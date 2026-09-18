import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  runTransaction,
  writeBatch,
  increment,
  Unsubscribe,
} from 'firebase/firestore';
import { db, auth } from './firebase';
import {
  Product,
  Category,
  ModifierGroup,
  Order,
  StoreSettings,
  DeliveryArea,
  Promo,
  Banner,
  PlatformLink,
  AuditLog,
  DailyAnalytics,
  AdminUser,
  Customer,
  PointLedgerEntry,
  RewardItem,
  PointRedemption,
} from '../types';
import { errorService } from './errorService';
import {
  normalizeProductName,
  normalizeSku,
  getSafeRegistryDocId,
  checkProductDuplicate,
  auditCatalogDuplicates,
  CatalogAuditResult,
} from '../utils/productUtils';
import {
  DEFAULT_STORE_SETTINGS,
  DEFAULT_CATEGORIES,
  DEFAULT_MODIFIER_GROUPS,
  DEFAULT_PRODUCTS,
  DEFAULT_DELIVERY_AREAS,
  DEFAULT_PROMOS,
  DEFAULT_BANNERS,
  DEFAULT_PLATFORM_LINKS,
} from '../data/seedData';

// Persistent and In-memory client cache to minimize Firestore reads and enable instant first-paint
interface CacheHolder {
  products: Product[] | null;
  categories: Category[] | null;
  modifierGroups: ModifierGroup[] | null;
  deliveryAreas: DeliveryArea[] | null;
  settings: StoreSettings | null;
  banners: Banner[] | null;
  platformLinks: PlatformLink[] | null;
  promos: Promo[] | null;
  lastFetched: number;
}

const PERSISTENT_CATALOG_KEY = 'huma_catalog_persistent_v2';

function readStoredCatalog(): Partial<CacheHolder> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(PERSISTENT_CATALOG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    }
  } catch {
    // Ignore storage parse error
  }
  return {};
}

function persistCatalog(currentCache: CacheHolder) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      PERSISTENT_CATALOG_KEY,
      JSON.stringify({
        products: currentCache.products,
        categories: currentCache.categories,
        modifierGroups: currentCache.modifierGroups,
        deliveryAreas: currentCache.deliveryAreas,
        settings: currentCache.settings,
        banners: currentCache.banners,
        platformLinks: currentCache.platformLinks,
        promos: currentCache.promos,
        lastFetched: currentCache.lastFetched,
      })
    );
  } catch {
    // Ignore storage quota error
  }
}

const initialStored = readStoredCatalog();

// Firestore Quota Circuit Breaker
const QUOTA_EXCEEDED_KEY = 'huma_firestore_quota_exceeded_timestamp';
const QUOTA_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes fallback before re-probing Firestore

let memoryQuotaExceededTime = 0;

export function isQuotaExceeded(): boolean {
  if (memoryQuotaExceededTime > 0 && Date.now() - memoryQuotaExceededTime < QUOTA_COOLDOWN_MS) {
    return true;
  }
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(QUOTA_EXCEEDED_KEY);
      if (stored) {
        const time = parseInt(stored, 10);
        if (Date.now() - time < QUOTA_COOLDOWN_MS) {
          memoryQuotaExceededTime = time;
          return true;
        }
      }
    } catch {
      // ignore
    }
  }
  return false;
}

export function markQuotaExceeded(): void {
  memoryQuotaExceededTime = Date.now();
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(QUOTA_EXCEEDED_KEY, String(memoryQuotaExceededTime));
    } catch {
      // ignore
    }
  }
}

// Persistent Order Storage for Offline/Quota Resiliency
const PERSISTENT_ORDERS_KEY = 'huma_orders_persistent_v1';

export function readStoredOrders(): Order[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(PERSISTENT_ORDERS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  return [];
}

export function persistStoredOrders(orders: Order[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PERSISTENT_ORDERS_KEY, JSON.stringify(orders.slice(0, 100)));
  } catch {
    // ignore
  }
}

export function appendOrUpdateStoredOrder(order: Order): void {
  const current = readStoredOrders();
  const idx = current.findIndex((o) => o.id === order.id || o.orderNumber === order.orderNumber);
  let updated: Order[];
  if (idx >= 0) {
    updated = [...current];
    updated[idx] = { ...updated[idx], ...order };
  } else {
    updated = [order, ...current];
  }
  persistStoredOrders(updated);
}

// Persistent Customer Storage for Offline/Quota Resiliency
const PERSISTENT_CUSTOMERS_KEY = 'huma_customers_persistent_v1';

export function readStoredCustomers(): Customer[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(PERSISTENT_CUSTOMERS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // ignore
  }
  return [];
}

export function persistStoredCustomers(customers: Customer[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PERSISTENT_CUSTOMERS_KEY, JSON.stringify(customers.slice(0, 150)));
  } catch {
    // ignore
  }
}

const cache: CacheHolder = {
  products: initialStored.products || null,
  categories: initialStored.categories || null,
  modifierGroups: initialStored.modifierGroups || null,
  deliveryAreas: initialStored.deliveryAreas || null,
  settings: initialStored.settings || null,
  banners: initialStored.banners || null,
  platformLinks: initialStored.platformLinks || null,
  promos: initialStored.promos || null,
  lastFetched: initialStored.lastFetched || 0,
};

const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes local cache for customer catalogs

/**
 * Recursively cleans an object by stripping any properties with `undefined` values.
 * Firestore throws an "Unsupported field value: undefined" error if any undefined
 * property exists in the payload.
 */
export function sanitizeForFirestore<T>(data: T): T {
  if (data === null || data === undefined) {
    return data;
  }
  if (Array.isArray(data)) {
    return data
      .filter((item) => item !== undefined)
      .map((item) => sanitizeForFirestore(item)) as unknown as T;
  }
  if (typeof data === 'object' && !(data instanceof Date)) {
    const cleanObj: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        cleanObj[key] = sanitizeForFirestore(value);
      }
    }
    return cleanObj as T;
  }
  return data;
}

/**
 * Build authoritative modifier inventory requirements from order items.
 *
 * Legacy modifiers remain unlimited unless their persisted modifier item
 * explicitly has stockEnabled === true.
 *
 * Standard selectedModifiers consume stock per ordered product quantity.
 * Batch modifier options consume the explicit allocated quantity.
 */
function buildModifierInventoryRequirements(
  items: Order['items'] = []
): Map<string, number> {
  const requirements = new Map<string, number>();

  for (const item of items) {
    const itemQuantity = Number(item.quantity);

    if (!Number.isInteger(itemQuantity) || itemQuantity <= 0) {
      continue;
    }

    const batchKeys = new Set<string>();

    for (const batch of item.batchModifiers || []) {
      const groupId = String(batch.modifierGroupId || '').trim();
      if (!groupId) continue;

      for (const option of batch.options || []) {
        const modifierId = String(option.modifierId || '').trim();
        const quantity = Number(option.quantity);

        if (
          !modifierId ||
          !Number.isInteger(quantity) ||
          quantity <= 0
        ) {
          continue;
        }

        const key = `${groupId}:${modifierId}`;
        batchKeys.add(key);
        requirements.set(
          key,
          (requirements.get(key) || 0) + quantity
        );
      }
    }

    for (const selected of item.selectedModifiers || []) {
      const groupId = String(selected.groupId || '').trim();
      const modifierId = String(selected.item?.id || '').trim();

      if (!groupId || !modifierId) continue;

      // A batch allocation is already the authoritative quantity.
      if (batchKeys.has(`${groupId}:${modifierId}`)) {
        continue;
      }

      const key = `${groupId}:${modifierId}`;
      requirements.set(
        key,
        (requirements.get(key) || 0) + itemQuantity
      );
    }
  }

  return requirements;
}

function modifierInventoryKey(
  groupId: string,
  modifierId: string
): string {
  return `modifier:${groupId}:${modifierId}`;
}

async function buildIdempotencyDocumentId(key: string): Promise<string> {
  const normalized = String(key || '').trim();

  if (!normalized) {
    return '';
  }

  try {
    if (
      typeof crypto !== 'undefined' &&
      crypto.subtle &&
      typeof TextEncoder !== 'undefined'
    ) {
      const encoded = new TextEncoder().encode(normalized);
      const digest = await crypto.subtle.digest('SHA-256', encoded);

      return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
    }
  } catch {
    // Fallback below for environments without Web Crypto.
  }

  return normalized
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 1200);
}

export class FirestoreService {
  /**
   * Synchronously return currently cached catalog (memory/localStorage) for immediate 0ms first-paint
   */
  public static getCachedCatalogSync(): CacheHolder {
    return cache;
  }

  /* =========================================================================
   * 1. STORE SETTINGS & STATUS
   * ========================================================================= */
  public static async getSettings(forceRefresh = false): Promise<StoreSettings> {
    if (!forceRefresh && cache.settings && Date.now() - cache.lastFetched < CACHE_TTL_MS) {
      return cache.settings;
    }
    if (isQuotaExceeded() && cache.settings) {
      return cache.settings;
    }

    try {
      const docRef = doc(db, 'settings', 'general');
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data() as StoreSettings;
        cache.settings = data;
        persistCatalog(cache);
        return data;
      } else {
        // Return default settings without attempting an unauthorized write
        cache.settings = DEFAULT_STORE_SETTINGS;
        return DEFAULT_STORE_SETTINGS;
      }
    } catch (err) {
      if (errorService.classify(err) === 'QUOTA_ERROR') {
        markQuotaExceeded();
      }
      return cache.settings || DEFAULT_STORE_SETTINGS;
    }
  }

  public static async updateSettings(updates: Partial<StoreSettings>): Promise<void> {
    const docRef = doc(db, 'settings', 'general');
    await setDoc(docRef, sanitizeForFirestore(updates), { merge: true });
    cache.settings = { ...(cache.settings || DEFAULT_STORE_SETTINGS), ...updates };
    persistCatalog(cache);
  }

  /* =========================================================================
   * 2. CATEGORIES
   * ========================================================================= */
  public static async getCategories(forceRefresh = false): Promise<Category[]> {
    if (!forceRefresh && cache.categories && Date.now() - cache.lastFetched < CACHE_TTL_MS) {
      return cache.categories;
    }
    if (isQuotaExceeded() && cache.categories) {
      return cache.categories;
    }

    try {
      const colRef = collection(db, 'categories');
      const q = query(colRef, orderBy('sortOrder', 'asc'), limit(50));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Category));
        cache.categories = list;
        persistCatalog(cache);
        return list;
      }
      cache.categories = DEFAULT_CATEGORIES;
      return DEFAULT_CATEGORIES;
    } catch (err) {
      if (errorService.classify(err) === 'QUOTA_ERROR') {
        markQuotaExceeded();
      }
      return cache.categories || DEFAULT_CATEGORIES;
    }
  }

  public static async saveCategory(category: Partial<Category> & { id?: string }): Promise<string> {
    const colRef = collection(db, 'categories');
    const docId = category.id || doc(colRef).id;
    await setDoc(doc(db, 'categories', docId), sanitizeForFirestore({ ...category, id: docId }), { merge: true });
    cache.categories = null; // Invalidate
    persistCatalog(cache);
    return docId;
  }

  public static async deleteCategory(id: string): Promise<void> {
    await deleteDoc(doc(db, 'categories', id));
    cache.categories = null;
    persistCatalog(cache);
  }

  /* =========================================================================
   * 3. PRODUCTS
   * ========================================================================= */
  public static async getProducts(forceRefresh = false): Promise<Product[]> {
    if (!forceRefresh && cache.products && Date.now() - cache.lastFetched < CACHE_TTL_MS) {
      return cache.products;
    }
    if (isQuotaExceeded() && cache.products) {
      return cache.products;
    }

    try {
      const colRef = collection(db, 'products');
      const q = query(colRef, orderBy('sortOrder', 'asc'), limit(500));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Product));
        cache.products = list;
        cache.lastFetched = Date.now();
        persistCatalog(cache);
        return list;
      }
      cache.products = DEFAULT_PRODUCTS;
      cache.lastFetched = Date.now();
      return DEFAULT_PRODUCTS;
    } catch (err) {
      if (errorService.classify(err) === 'QUOTA_ERROR') {
        markQuotaExceeded();
      }
      return cache.products || DEFAULT_PRODUCTS;
    }
  }

  public static async saveProduct(product: Partial<Product> & { id?: string }): Promise<string> {
    const colRef = collection(db, 'products');
    const docId = product.id || doc(colRef).id;
    const isNew = !product.id;

    const rawName = product.name || '';
    const normName = normalizeProductName(rawName);
    const normSku = normalizeSku(product.sku);

    if (!normName) {
      throw new Error('VALIDATION_ERROR: Nama produk tidak boleh kosong.');
    }

    const cleanProductData: Product = {
      id: docId,
      name: rawName.trim(),
      normalizedName: normName,
      sku: normSku || undefined,
      categoryId: product.categoryId || '',
      description: (product.description || '').trim(),
      price: Number(product.price) || 0,
      costPrice: product.costPrice ? Number(product.costPrice) : undefined,
      imageUrl: product.imageUrl || '',
      isActive: product.isActive !== undefined ? product.isActive : true,
      isAvailable: product.isAvailable !== undefined ? product.isAvailable : true,

      // Master inventory configuration.
      stockEnabled: product.stockEnabled === true,
      stock:
        product.stock !== undefined
          ? Math.max(0, Math.floor(Number(product.stock) || 0))
          : undefined,

      isPopular: !!product.isPopular,
      wholesaleEnabled: !!product.wholesaleEnabled,
      wholesaleRules: product.wholesaleRules || [],
      modifierGroupIds: product.modifierGroupIds || [],
      sortOrder: product.sortOrder !== undefined ? product.sortOrder : 100,
      createdAt: product.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isDuplicate: product.isDuplicate || false,
      canonicalProductId: product.canonicalProductId || undefined,
    };

    const nameDocId = getSafeRegistryDocId('name', normName);
    const skuDocId = normSku ? getSafeRegistryDocId('sku', normSku) : null;

    // Database-level atomic duplicate check via Firestore Transaction
    try {
      await runTransaction(db, async (txn) => {
        // 1. Check Name registry
        const nameDocRef = doc(db, 'product_names', nameDocId);
        const nameSnap = await txn.get(nameDocRef);
        if (nameSnap.exists()) {
          const regData = nameSnap.data();
          if (regData.productId && regData.productId !== docId) {
            throw new Error(`DUPLICATE_PRODUCT: Produk dengan nama '${rawName.trim()}' sudah terdaftar dalam sistem (ID: ${regData.productId}). Silakan gunakan produk yang sudah ada atau ubah nama produk.`);
          }
        }

        // 2. Check SKU registry if specified
        if (skuDocId) {
          const skuDocRef = doc(db, 'product_skus', skuDocId);
          const skuSnap = await txn.get(skuDocRef);
          if (skuSnap.exists()) {
            const skuRegData = skuSnap.data();
            if (skuRegData.productId && skuRegData.productId !== docId) {
              throw new Error(`DUPLICATE_SKU: SKU '${normSku}' sudah digunakan oleh produk lain (ID: ${skuRegData.productId}).`);
            }
          }
        }

        // If updating an existing product, deregister old name/sku if they changed
        if (!isNew && cache.products) {
          const oldProd = cache.products.find((p) => p.id === docId);
          if (oldProd) {
            const oldNormName = oldProd.normalizedName || normalizeProductName(oldProd.name);
            if (oldNormName && oldNormName !== normName) {
              txn.delete(doc(db, 'product_names', getSafeRegistryDocId('name', oldNormName)));
            }
            const oldNormSku = normalizeSku(oldProd.sku);
            if (oldNormSku && oldNormSku !== normSku) {
              txn.delete(doc(db, 'product_skus', getSafeRegistryDocId('sku', oldNormSku)));
            }
          }
        }

        // 3. Atomically register unique Name and SKU
        txn.set(nameDocRef, {
          productId: docId,
          name: rawName.trim(),
          normalizedName: normName,
          updatedAt: new Date().toISOString(),
        });

        if (skuDocId) {
          const skuDocRef = doc(db, 'product_skus', skuDocId);
          txn.set(skuDocRef, {
            productId: docId,
            sku: normSku,
            updatedAt: new Date().toISOString(),
          });
        }

        // 4. Save Product document
        const prodDocRef = doc(db, 'products', docId);
        txn.set(prodDocRef, sanitizeForFirestore(cleanProductData), { merge: true });
      });
    } catch (err: any) {
      if (err?.message?.startsWith('DUPLICATE_PRODUCT') || err?.message?.startsWith('DUPLICATE_SKU')) {
        throw err;
      }
      // Fallback: in offline or permission-limited mode, enforce duplicate check against local/cache products
      const currentProducts = cache.products || [];
      const dupCheck = checkProductDuplicate({ name: rawName, sku: normSku, id: docId }, currentProducts);
      if (dupCheck.isDuplicate) {
        throw new Error(dupCheck.message || `DUPLICATE_PRODUCT: Produk '${rawName}' sudah tersedia.`);
      }

      // Safe write
      await setDoc(doc(db, 'products', docId), sanitizeForFirestore(cleanProductData), { merge: true });
    }

    cache.products = null; // Invalidate
    persistCatalog(cache);
    return docId;
  }

  public static async deleteProduct(id: string): Promise<void> {
    try {
      // Find existing product to clean up its registry doc
      const prodDocRef = doc(db, 'products', id);
      const prodSnap = await getDoc(prodDocRef);
      if (prodSnap.exists()) {
        const prod = prodSnap.data() as Product;
        const normName = prod.normalizedName || normalizeProductName(prod.name);
        const normSku = normalizeSku(prod.sku);

        if (normName) {
          try {
            await deleteDoc(doc(db, 'product_names', getSafeRegistryDocId('name', normName)));
          } catch (e) {
            console.warn('[HUMA] Registry delete skipped:', e);
          }
        }
        if (normSku) {
          try {
            await deleteDoc(doc(db, 'product_skus', getSafeRegistryDocId('sku', normSku)));
          } catch (e) {
            console.warn('[HUMA] SKU Registry delete skipped:', e);
          }
        }
      }
    } catch (err) {
      console.warn('[HUMA] Error preparing deleteProduct cleanup:', err);
    }

    await deleteDoc(doc(db, 'products', id));
    cache.products = null;
    persistCatalog(cache);
  }

  /**
   * Safe deduplication cleanup for existing catalog duplicates.
   * Marks non-canonical duplicate products as inactive/duplicate and links them to canonical ID
   * WITHOUT destroying or modifying historical orders!
   */
  public static async cleanupDuplicateProducts(
    duplicateProductIds: string[],
    canonicalMapping: Record<string, string>
  ): Promise<{ deactivatedCount: number }> {
    if (!duplicateProductIds || duplicateProductIds.length === 0) {
      return { deactivatedCount: 0 };
    }

    const batch = writeBatch(db);
    const now = new Date().toISOString();
    let count = 0;

    for (const dupId of duplicateProductIds) {
      const canonicalId = canonicalMapping[dupId];
      const docRef = doc(db, 'products', dupId);
      batch.update(docRef, {
        isActive: false,
        isAvailable: false,
        isDuplicate: true,
        canonicalProductId: canonicalId || null,
        updatedAt: now,
      });
      count++;
    }

    await batch.commit();

    // Invalidate cache
    cache.products = null;
    persistCatalog(cache);

    // Record audit log
    try {
      await this.logAudit({
        action: 'DEDUPLICATE_PRODUCTS',
        actorId: 'system',
        actorEmail: 'system@humafood.local',
        actorRole: 'SUPER_ADMIN',
        targetType: 'PRODUCT_CATALOG',
        targetId: 'catalog',
        metadata: {
          deactivatedCount: count,
          details: `Safely deactivated ${count} duplicate products while preserving historical transaction references.`,
        },
      });
    } catch (e) {
      console.warn('[HUMA Audit] Log deduplication skipped:', e);
    }

    return { deactivatedCount: count };
  }

  /**
   * Auto-delete duplicate menu products permanently from Firestore database.
   * Purges duplicate menu items while keeping canonical items completely safe.
   * Cleans up registry locks (ensuring canonical is properly registered),
   * clears memory & localStorage catalog caches, logs the operation, and returns deleted list.
   */
  public static async autoDeleteDuplicateProducts(
    duplicateProductIds?: string[],
    canonicalMapping?: Record<string, string>
  ): Promise<{ deletedCount: number; deletedNames: string[] }> {
    const allProducts = await this.getProducts(true);
    let targetDuplicateIds: string[] = [];
    let mapping: Record<string, string> = canonicalMapping || {};

    if (duplicateProductIds && duplicateProductIds.length > 0) {
      targetDuplicateIds = duplicateProductIds;
    } else {
      const audit = auditCatalogDuplicates(allProducts);
      targetDuplicateIds = audit.duplicateProductIds;
      mapping = audit.canonicalMapping;
    }

    if (!targetDuplicateIds || targetDuplicateIds.length === 0) {
      return { deletedCount: 0, deletedNames: [] };
    }

    const targetSet = new Set(targetDuplicateIds);
    const productsToDelete = allProducts.filter((p) => targetSet.has(p.id));
    const deletedNames: string[] = [];

    // Delete in chunks of 250 to ensure safe Firestore batch limits (< 500)
    const CHUNK_SIZE = 250;
    for (let i = 0; i < productsToDelete.length; i += CHUNK_SIZE) {
      const chunk = productsToDelete.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);

      for (const prod of chunk) {
        deletedNames.push(prod.name);
        const docRef = doc(db, 'products', prod.id);
        batch.delete(docRef);

        const normName = prod.normalizedName || normalizeProductName(prod.name);
        const normSku = normalizeSku(prod.sku);
        const canonicalId = mapping[prod.id];

        // Ensure canonical product retains name registry ownership
        if (normName) {
          const nameDocId = getSafeRegistryDocId('name', normName);
          const nameRegRef = doc(db, 'product_names', nameDocId);
          if (canonicalId) {
            const canonicalProd = allProducts.find((p) => p.id === canonicalId && !targetSet.has(p.id));
            if (canonicalProd) {
              batch.set(
                nameRegRef,
                {
                  productId: canonicalProd.id,
                  name: canonicalProd.name,
                  normalizedName: normName,
                  updatedAt: new Date().toISOString(),
                },
                { merge: true }
              );
            }
          }
        }

        // SKU registry cleanup
        if (normSku && !canonicalId) {
          const skuRegRef = doc(db, 'product_skus', getSafeRegistryDocId('sku', normSku));
          batch.delete(skuRegRef);
        }
      }

      await batch.commit();
    }

    // Invalidate local memory & persistent cache
    cache.products = null;
    persistCatalog(cache);

    // Record audit log
    try {
      await this.logAudit({
        action: 'AUTO_DELETE_DUPLICATE_PRODUCTS',
        actorId: 'admin',
        actorEmail: 'admin@humafood.local',
        actorRole: 'SUPER_ADMIN',
        targetType: 'PRODUCT_CATALOG',
        targetId: 'catalog',
        metadata: {
          deletedCount: deletedNames.length,
          deletedNames,
          deletedProductIds: targetDuplicateIds,
          details: `Auto-deleted ${deletedNames.length} duplicate menu items permanently from database while keeping canonical items intact.`,
        },
      });
    } catch (e) {
      console.warn('[HUMA Audit] Log auto-delete skipped:', e);
    }

    return { deletedCount: deletedNames.length, deletedNames };
  }

  public static getAutoDeleteDuplicatesSetting(): boolean {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        return localStorage.getItem('huma_auto_delete_duplicates') === 'true';
      } catch (e) {
        return false;
      }
    }
    return false;
  }

  public static setAutoDeleteDuplicatesSetting(enabled: boolean): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.setItem('huma_auto_delete_duplicates', enabled ? 'true' : 'false');
      } catch (e) {
        console.warn('Failed to save auto delete duplicates setting:', e);
      }
    }
  }

  /* =========================================================================
   * 4. MODIFIER GROUPS
   * ========================================================================= */
  public static async getModifierGroups(forceRefresh = false): Promise<ModifierGroup[]> {
    if (!forceRefresh && cache.modifierGroups && Date.now() - cache.lastFetched < CACHE_TTL_MS) {
      return cache.modifierGroups;
    }
    if (isQuotaExceeded() && cache.modifierGroups) {
      return cache.modifierGroups;
    }

    try {
      const colRef = collection(db, 'modifierGroups');
      const snap = await getDocs(colRef);
      if (!snap.empty) {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ModifierGroup));
        cache.modifierGroups = list;
        persistCatalog(cache);
        return list;
      }
      cache.modifierGroups = DEFAULT_MODIFIER_GROUPS;
      return DEFAULT_MODIFIER_GROUPS;
    } catch (err) {
      if (errorService.classify(err) === 'QUOTA_ERROR') {
        markQuotaExceeded();
      }
      return cache.modifierGroups || DEFAULT_MODIFIER_GROUPS;
    }
  }

  public static async saveModifierGroup(group: Partial<ModifierGroup> & { id?: string }): Promise<string> {
    const colRef = collection(db, 'modifierGroups');
    const docId = group.id || doc(colRef).id;
    await setDoc(doc(db, 'modifierGroups', docId), sanitizeForFirestore({ ...group, id: docId }), { merge: true });
    cache.modifierGroups = null;
    persistCatalog(cache);
    return docId;
  }

  /**
   * Atomically update stock management for multiple modifier items in one group.
   * This avoids overwriting a newer stock value when orders are processed concurrently.
   */
  public static async updateModifierStocks(
    groupId: string,
    updates: Array<{
      modifierId: string;
      stockEnabled: boolean;
      stock: number;
      isAvailable: boolean;
    }>
  ): Promise<void> {
    if (!updates.length) return;

    const groupRef = doc(db, 'modifierGroups', groupId);

    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(groupRef);
      if (!snap.exists()) {
        throw new Error('Grup modifier tidak ditemukan.');
      }

      const data = snap.data() as ModifierGroup;
      const items = Array.isArray(data.items) ? [...data.items] : [];
      const updateMap = new Map(updates.map((update) => [update.modifierId, update]));

      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        const update = updateMap.get(item.id);
        if (!update) continue;

        const stockEnabled = update.stockEnabled === true;
        const stock = Math.max(0, Math.floor(Number(update.stock) || 0));
        const isAvailable = stockEnabled && stock <= 0 ? false : update.isAvailable !== false;

        items[index] = {
          ...item,
          stockEnabled,
          stock,
          isAvailable,
          status: (isAvailable ? 'AVAILABLE' : 'SOLD_OUT') as 'AVAILABLE' | 'SOLD_OUT',
        };
      }

      transaction.set(
        groupRef,
        {
          items,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    });

    cache.modifierGroups = null;
    persistCatalog(cache);
  }

  public static async deleteModifierGroup(id: string): Promise<void> {
    await deleteDoc(doc(db, 'modifierGroups', id));
    cache.modifierGroups = null;
    persistCatalog(cache);
  }

  /* =========================================================================
   * 5. DELIVERY AREAS
   * ========================================================================= */
  public static async getDeliveryAreas(forceRefresh = false): Promise<DeliveryArea[]> {
    if (!forceRefresh && cache.deliveryAreas && Date.now() - cache.lastFetched < CACHE_TTL_MS) {
      return cache.deliveryAreas;
    }
    if (isQuotaExceeded() && cache.deliveryAreas) {
      return cache.deliveryAreas;
    }

    try {
      const colRef = collection(db, 'deliveryAreas');
      const snap = await getDocs(colRef);
      if (!snap.empty) {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as DeliveryArea));
        cache.deliveryAreas = list;
        persistCatalog(cache);
        return list;
      }
      cache.deliveryAreas = DEFAULT_DELIVERY_AREAS;
      return DEFAULT_DELIVERY_AREAS;
    } catch (err) {
      if (errorService.classify(err) === 'QUOTA_ERROR') {
        markQuotaExceeded();
      }
      return cache.deliveryAreas || DEFAULT_DELIVERY_AREAS;
    }
  }

  public static async saveDeliveryArea(area: Partial<DeliveryArea> & { id?: string }): Promise<string> {
    const colRef = collection(db, 'deliveryAreas');
    const docId = area.id || doc(colRef).id;
    await setDoc(doc(db, 'deliveryAreas', docId), sanitizeForFirestore({ ...area, id: docId }), { merge: true });
    cache.deliveryAreas = null;
    persistCatalog(cache);
    return docId;
  }

  public static async deleteDeliveryArea(id: string): Promise<void> {
    await deleteDoc(doc(db, 'deliveryAreas', id));
    cache.deliveryAreas = null;
    persistCatalog(cache);
  }

  /* =========================================================================
   * 6. PROMOS
   * ========================================================================= */
  public static async getPromos(forceRefresh = false): Promise<Promo[]> {
    if (!forceRefresh && cache.promos && Date.now() - cache.lastFetched < CACHE_TTL_MS) {
      return cache.promos;
    }
    if (isQuotaExceeded() && cache.promos) {
      return cache.promos;
    }

    try {
      const colRef = collection(db, 'promos');
      const snap = await getDocs(colRef);
      if (!snap.empty) {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Promo));
        cache.promos = list;
        persistCatalog(cache);
        return list;
      }
      cache.promos = DEFAULT_PROMOS;
      return DEFAULT_PROMOS;
    } catch (err) {
      if (errorService.classify(err) === 'QUOTA_ERROR') {
        markQuotaExceeded();
      }
      return cache.promos || DEFAULT_PROMOS;
    }
  }

  public static async savePromo(promo: Partial<Promo> & { id?: string }): Promise<string> {
    const colRef = collection(db, 'promos');
    const docId = promo.id || doc(colRef).id;
    await setDoc(doc(db, 'promos', docId), sanitizeForFirestore({ ...promo, id: docId }), { merge: true });
    cache.promos = null;
    persistCatalog(cache);
    return docId;
  }

  public static async deletePromo(id: string): Promise<void> {
    await deleteDoc(doc(db, 'promos', id));
    cache.promos = null;
    persistCatalog(cache);
  }

  /* =========================================================================
   * 7. BANNERS & PLATFORMS
   * ========================================================================= */
  public static async getBanners(forceRefresh = false): Promise<Banner[]> {
    if (!forceRefresh && cache.banners && Date.now() - cache.lastFetched < CACHE_TTL_MS) {
      return cache.banners;
    }
    if (isQuotaExceeded() && cache.banners) {
      return cache.banners;
    }

    try {
      const colRef = collection(db, 'banners');
      const q = query(colRef, orderBy('sortOrder', 'asc'), limit(10));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Banner));
        cache.banners = list;
        persistCatalog(cache);
        return list;
      }
      cache.banners = DEFAULT_BANNERS;
      return DEFAULT_BANNERS;
    } catch (err) {
      if (errorService.classify(err) === 'QUOTA_ERROR') {
        markQuotaExceeded();
      }
      return cache.banners || DEFAULT_BANNERS;
    }
  }

  public static async saveBanner(banner: Partial<Banner> & { id?: string }): Promise<string> {
    const colRef = collection(db, 'banners');
    const docId = banner.id || doc(colRef).id;
    await setDoc(doc(db, 'banners', docId), sanitizeForFirestore({ ...banner, id: docId }), { merge: true });
    cache.banners = null;
    persistCatalog(cache);
    return docId;
  }

  public static async deleteBanner(id: string): Promise<void> {
    await deleteDoc(doc(db, 'banners', id));
    cache.banners = null;
    persistCatalog(cache);
  }

  public static async getPlatformLinks(forceRefresh = false): Promise<PlatformLink[]> {
    if (!forceRefresh && cache.platformLinks && Date.now() - cache.lastFetched < CACHE_TTL_MS) {
      return cache.platformLinks;
    }

    try {
      const colRef = collection(db, 'platformLinks');
      const snap = await getDocs(colRef);
      if (!snap.empty) {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as PlatformLink));
        cache.platformLinks = list;
        persistCatalog(cache);
        return list;
      }
      cache.platformLinks = DEFAULT_PLATFORM_LINKS;
      return DEFAULT_PLATFORM_LINKS;
    } catch {
      return cache.platformLinks || DEFAULT_PLATFORM_LINKS;
    }
  }

  public static async savePlatformLink(link: Partial<PlatformLink> & { id?: string }): Promise<string> {
    const colRef = collection(db, 'platformLinks');
    const docId = link.id || doc(colRef).id;
    await setDoc(doc(db, 'platformLinks', docId), sanitizeForFirestore({ ...link, id: docId }), { merge: true });
    cache.platformLinks = null;
    persistCatalog(cache);
    return docId;
  }

  public static async deletePlatformLink(id: string): Promise<void> {
    await deleteDoc(doc(db, 'platformLinks', id));
    cache.platformLinks = null;
    persistCatalog(cache);
  }

  /* Convenience aliases for Admin managers */
  public static async getStoreSettings(forceRefresh = false): Promise<StoreSettings> {
    return this.getSettings(forceRefresh);
  }

  public static async updateStoreSettings(updates: Partial<StoreSettings>): Promise<void> {
    return this.updateSettings(updates);
  }

  public static subscribeStoreSettings(callback: (settings: StoreSettings) => void): Unsubscribe {
    // Immediately emit cached settings if present
    if (cache.settings) {
      callback(cache.settings);
    }

    if (isQuotaExceeded()) {
      return () => {};
    }

    const docRef = doc(db, 'settings', 'general');
    return onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as StoreSettings;
          cache.settings = data;
          persistCatalog(cache);
          callback(data);
        } else {
          callback(DEFAULT_STORE_SETTINGS);
        }
      },
      (error) => {
        const classification = errorService.classify(error);
        if (classification === 'QUOTA_ERROR') {
          markQuotaExceeded();
          console.warn('[HUMA Firestore] Read quota reached in subscribeStoreSettings, using cached settings.');
        } else {
          console.warn('[HUMA Firestore] subscribeStoreSettings error:', error);
        }
        callback(cache.settings || DEFAULT_STORE_SETTINGS);
      }
    );
  }

  public static subscribeToOrders(callback: (orders: Order[]) => void): Unsubscribe {
    return this.subscribeRecentOrders(callback);
  }

  public static async getAuditLogs(limitCount = 50): Promise<AuditLog[]> {
    return this.getRecentAuditLogs(limitCount);
  }

  public static async createProduct(product: Omit<Product, 'id'>): Promise<string> {
    return this.saveProduct(product);
  }

  public static async updateProduct(id: string, updates: Partial<Product>): Promise<void> {
    await this.saveProduct({ ...updates, id });
  }

  public static async createCategory(category: Omit<Category, 'id'>): Promise<string> {
    return this.saveCategory(category);
  }

  public static async updateCategory(id: string, updates: Partial<Category>): Promise<void> {
    await this.saveCategory({ ...updates, id });
  }

  public static async createModifierGroup(group: Omit<ModifierGroup, 'id'>): Promise<string> {
    return this.saveModifierGroup(group);
  }

  public static async updateModifierGroup(id: string, updates: Partial<ModifierGroup>): Promise<void> {
    await this.saveModifierGroup({ ...updates, id });
  }

  public static async createPromo(promo: Omit<Promo, 'id'>): Promise<string> {
    return this.savePromo(promo);
  }

  public static async updatePromo(id: string, updates: Partial<Promo>): Promise<void> {
    await this.savePromo({ ...updates, id });
  }

  public static async createDeliveryArea(area: Omit<DeliveryArea, 'id'>): Promise<string> {
    return this.saveDeliveryArea(area);
  }

  public static async updateDeliveryArea(id: string, updates: Partial<DeliveryArea>): Promise<void> {
    await this.saveDeliveryArea({ ...updates, id });
  }

  public static async createBanner(banner: Omit<Banner, 'id'>): Promise<string> {
    return this.saveBanner(banner);
  }

  public static async updateBanner(id: string, updates: Partial<Banner>): Promise<void> {
    await this.saveBanner({ ...updates, id });
  }

  /* =========================================================================
   * 8. ORDERS & ANTI-DOUBLE ORDER ENGINE
   * ========================================================================= */
  /**
   * Generate sequential human-readable order number: #HF-XXXXXX
   */
  public static async generateOrderNumber(): Promise<{ orderNumber: string; counterVal: number }> {
    // If staff/admin is authenticated, try sequential counter in settings
    if (auth.currentUser) {
      try {
        const counterDocRef = doc(db, 'settings', 'orderCounter');
        return await runTransaction(db, async (transaction) => {
          const snap = await transaction.get(counterDocRef);
          let currentVal = 100;
          if (snap.exists()) {
            currentVal = snap.data().lastNumber || 100;
          }
          const nextVal = currentVal + 1;
          transaction.set(counterDocRef, { lastNumber: nextVal }, { merge: true });
          
          const padded = String(nextVal).padStart(6, '0');
          return {
            orderNumber: `#HF-${padded}`,
            counterVal: nextVal,
          };
        });
      } catch (err) {
        console.warn('[HUMA] Counter transaction skipped, falling back to time sequence:', err);
      }
    }

    // High-resolution collision-resistant order number for public customer storefront:
    // Format: #HF-YYMMDD-XXXX (e.g. #HF-260904-5821)
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const rand = Math.floor(1000 + Math.random() * 9000);
    const counterVal = Date.now() % 1000000;
    return {
      orderNumber: `#HF-${yy}${mm}${dd}-${rand}`,
      counterVal,
    };
  }

  /**
   * Create an order with idempotency check to guarantee anti-double order
   */
  public static async createOrder(orderInput: Omit<Order, 'id' | 'orderNumber' | 'createdAt'>): Promise<Order> {
    // 1. Check idempotency if provided
    if (orderInput.idempotencyKey) {
      try {
        const checkQ = query(
          collection(db, 'orders'),
          where('idempotencyKey', '==', orderInput.idempotencyKey),
          limit(1)
        );
        const existingSnap = await getDocs(checkQ);
        if (!existingSnap.empty) {
          return { id: existingSnap.docs[0].id, ...existingSnap.docs[0].data() } as Order;
        }
      } catch (err) {
        console.warn('[HUMA] Idempotency check skipped:', err);
      }
    }

    // 1.5. Validate required Batch Modifiers (Bumbu Guard)
    if (orderInput.items && orderInput.items.length > 0) {
      try {
        const categories = await this.getCategories();
        const batchCategories = categories.filter(
          (c) => (c.batchModifierEnabled && c.batchModifierGroupId) || c.name.toLowerCase().includes('goreng')
        );

        for (const bCat of batchCategories) {
          const isGorengan = bCat.name.toLowerCase().includes('goreng');
          const isReq = isGorengan || bCat.batchModifierRequired !== false;
          if (!isReq) continue;

          const matchingItems = orderInput.items.filter((it) => it.categoryId === bCat.id);
          const totalQty = matchingItems.reduce((sum, it) => sum + it.quantity, 0);

          if (totalQty > 0) {
            const sel = (orderInput.batchModifiers || []).find((bm) => bm.categoryId === bCat.id);
            const count = sel
              ? (sel.selectedModifiers?.length ?? sel.options?.filter((o) => (o.quantity ?? 1) > 0).length ?? 0)
              : 0;
            const minReq = bCat.batchModifierMinSelection !== undefined
              ? Math.max(1, Number(bCat.batchModifierMinSelection))
              : 1;

            if (count < minReq) {
              throw new Error('Pesanan Aneka Gorengan wajib memilih bumbu tabur terlebih dahulu sebelum dapat diproses.');
            }
          }
        }
      } catch (err: any) {
        if (err.message && err.message.includes('wajib memilih bumbu')) {
          throw err;
        }
        console.warn('[HUMA] Batch modifier backend validation skipped:', err);
      }
    }

    // 2. Pricing and Total Integrity Enforcement
    const computedSubtotal = (orderInput.items || []).reduce((sum, it) => {
      const lineTotal = it.lineTotal !== undefined ? it.lineTotal : (it.unitPrice + (it.modifiersPrice || 0)) * it.quantity;
      return sum + lineTotal;
    }, 0);
    const safeDiscount = Math.max(0, orderInput.discount || 0);
    const safeDeliveryFee = Math.max(0, orderInput.deliveryFee || 0);
    const computedTotal = Math.max(0, computedSubtotal - safeDiscount + safeDeliveryFee);

    // 3. Generate order number and atomically consume master stock.
    const { orderNumber } = await this.generateOrderNumber();
    const orderDocRef = doc(collection(db, 'orders'));
    const orderId = orderDocRef.id;
    const createdAt = new Date().toISOString();

    const normalizedIdempotencyKey =
      String(orderInput.idempotencyKey || '').trim();

    const idempotencyRef =
      normalizedIdempotencyKey
        ? doc(
            db,
            'orderIdempotency',
            await buildIdempotencyDocumentId(
              normalizedIdempotencyKey
            )
          )
        : null;

    const baseOrder: Order = {
      ...orderInput,
      id: orderId,
      orderNumber,
      createdAt,
      subtotal:
        computedSubtotal > 0
          ? computedSubtotal
          : orderInput.subtotal,
      discount: safeDiscount,
      deliveryFee: safeDeliveryFee,
      total: computedTotal,
      status: orderInput.status || 'PENDING',
      inventoryOperationId: orderId,
      inventoryTracked: {},
    };

    let transactionResult: { order: Order; created: boolean };

    try {
      transactionResult = await runTransaction(
        db,
        async (txn) => {
          // ATOMIC IDEMPOTENCY LOCK
          //
          // The initial query above is only a fast path.
          // This transaction lock closes the race window when
          // two identical requests arrive concurrently.

          if (idempotencyRef) {
            const lockSnap = await txn.get(idempotencyRef);

            if (lockSnap.exists()) {
              const lockedOrderId =
                String(lockSnap.data()?.orderId || '').trim();

              if (!lockedOrderId) {
                throw new Error(
                  'Idempotency record pesanan rusak.'
                );
              }

              const lockedOrderRef =
                doc(db, 'orders', lockedOrderId);

              const lockedOrderSnap =
                await txn.get(lockedOrderRef);

              if (!lockedOrderSnap.exists()) {
                throw new Error(
                  'Idempotency record menunjuk pesanan yang tidak ditemukan.'
                );
              }

              const existingOrder = {
                id: lockedOrderSnap.id,
                ...lockedOrderSnap.data(),
              } as Order;

              return {
                order: existingOrder,
                created: false,
              };
            }
          }

          const quantities =
            new Map<string, number>();

          for (const item of baseOrder.items || []) {
            const productId =
              String(item.productId || '').trim();
            const quantity = Number(item.quantity);

            if (
              !productId ||
              !Number.isInteger(quantity) ||
              quantity <= 0
            ) {
              throw new Error(
                'Item pesanan tidak valid untuk transaksi stok.'
              );
            }

            quantities.set(
              productId,
              (quantities.get(productId) || 0) +
                quantity
            );
          }

          const productEntries = [
            ...quantities.entries(),
          ].map(([productId, quantity]) => ({
            productId,
            quantity,
            ref: doc(
              db,
              'products',
              productId
            ),
          }));

          const productSnapshots = [];

          // Firestore requires transaction reads before writes.
          for (const entry of productEntries) {
            const snap = await txn.get(
              entry.ref
            );

            productSnapshots.push({
              ...entry,
              snap,
            });
          }

          const modifierRequirements =
            buildModifierInventoryRequirements(baseOrder.items);

          const modifierGroupsById =
            new Map<string, Array<{ modifierId: string; quantity: number }>>();

          for (const [key, quantity] of modifierRequirements.entries()) {
            const separatorIndex = key.indexOf(':');
            if (separatorIndex <= 0) continue;

            const groupId = key.slice(0, separatorIndex);
            const modifierId = key.slice(separatorIndex + 1);

            if (!modifierGroupsById.has(groupId)) {
              modifierGroupsById.set(groupId, []);
            }

            modifierGroupsById.get(groupId)!.push({
              modifierId,
              quantity,
            });
          }

          const modifierGroupEntries = [
            ...modifierGroupsById.entries(),
          ].map(([groupId, requirements]) => ({
            groupId,
            requirements,
            ref: doc(
              db,
              'modifierGroups',
              groupId
            ),
          }));

          const modifierGroupSnapshots = [];

          // Firestore requires ALL transaction reads before writes.
          for (const entry of modifierGroupEntries) {
            const snap = await txn.get(entry.ref);

            modifierGroupSnapshots.push({
              ...entry,
              snap,
            });
          }

          const inventoryTracked:
            Record<string, number> = {};

          for (const entry of productSnapshots) {
            if (!entry.snap.exists()) {
              throw new Error(
                `Produk "${entry.productId}" tidak ditemukan.`
              );
            }

            const product =
              entry.snap.data() as Product;

            // Legacy unlimited/manual products are untouched.
            if (product.stockEnabled !== true) {
              continue;
            }

            const currentStock =
              Number(product.stock);

            if (
              !Number.isInteger(currentStock) ||
              currentStock < 0
            ) {
              throw new Error(
                `Konfigurasi stok "${product.name}" tidak valid.`
              );
            }

            if (currentStock < entry.quantity) {
              throw new Error(
                `Stok "${product.name}" tidak mencukupi. ` +
                  `Tersedia ${currentStock} pcs, ` +
                  `diminta ${entry.quantity} pcs.`
              );
            }

            txn.update(entry.ref, {
              stock:
                currentStock - entry.quantity,
              updatedAt: createdAt,
              inventoryOperationId:
                orderId,
              inventoryOrderId:
                orderId,
              inventoryOperationType:
                'SALE',
            });

            inventoryTracked[
              entry.productId
            ] = entry.quantity;
          }

          // Modifier inventory stock is processed in the same
          // Firestore transaction as product inventory.
          for (const entry of modifierGroupSnapshots) {
            if (!entry.snap.exists()) {
              throw new Error(
                `Modifier group "${entry.groupId}" tidak ditemukan.`
              );
            }

            const groupData = entry.snap.data() as any;
            const sourceItems = Array.isArray(groupData.items)
              ? groupData.items
              : [];

            let updatedItems = [...sourceItems];

            for (const requirement of entry.requirements) {
              const modifierIndex = updatedItems.findIndex(
                (modifier: any) =>
                  String(modifier?.id || '') ===
                  requirement.modifierId
              );

              if (modifierIndex < 0) {
                throw new Error(
                  `Modifier "${requirement.modifierId}" pada group "${entry.groupId}" tidak ditemukan.`
                );
              }

              const modifier = updatedItems[modifierIndex];

              // Legacy modifier inventory remains unchanged.
              if (modifier.stockEnabled !== true) {
                continue;
              }

              const currentStock = Number(modifier.stock);

              if (
                !Number.isInteger(currentStock) ||
                currentStock < 0
              ) {
                throw new Error(
                  `Konfigurasi stok modifier "${modifier.name || requirement.modifierId}" tidak valid.`
                );
              }

              if (currentStock < requirement.quantity) {
                throw new Error(
                  `Stok modifier "${modifier.name || requirement.modifierId}" tidak mencukupi. ` +
                  `Tersedia ${currentStock} pcs, ` +
                  `dibutuhkan ${requirement.quantity} pcs.`
                );
              }

              updatedItems[modifierIndex] = {
                ...modifier,
                stock: currentStock - requirement.quantity,
                isAvailable:
                  currentStock - requirement.quantity > 0,
                status:
                  currentStock - requirement.quantity > 0
                    ? 'AVAILABLE'
                    : 'SOLD_OUT',
              };

              inventoryTracked[
                modifierInventoryKey(
                  entry.groupId,
                  requirement.modifierId
                )
              ] = requirement.quantity;
            }

            txn.update(entry.ref, {
              items: updatedItems,
              updatedAt: createdAt,
            });
          }

          const finalOrder: Order = {
            ...baseOrder,
            inventoryTracked,
          };

          txn.set(
            orderDocRef,
            sanitizeForFirestore(
              finalOrder
            )
          );

          // ATOMIC IDEMPOTENCY RECORD
          if (idempotencyRef) {
            txn.set(
              idempotencyRef,
              sanitizeForFirestore({
                idempotencyKey:
                  normalizedIdempotencyKey,
                orderId,
                createdAt,
                status: 'COMMITTED',
              })
            );
          }

          return {
            order: finalOrder,
            created: true,
          };
        }
      );
    } catch (saveErr) {
      console.warn(
        '[HUMA Firestore] Atomic order transaction failed:',
        saveErr
      );

      if (
        errorService.classify(saveErr) ===
        'QUOTA_ERROR'
      ) {
        markQuotaExceeded();
      }

      // Inventory orders must fail safely. Do not create a
      // local-only success record when Firestore did not commit.
      throw saveErr;
    }

    // Firestore transaction succeeded.
    const newOrder = transactionResult.order;

    appendOrUpdateStoredOrder(newOrder);

    // An idempotent replay must NOT increment analytics,
    // promo usage, or loyalty points a second time.
    if (!transactionResult.created) {
      return newOrder;
    }

    // 4. Update Daily Analytics document and Promo usage if permissions allow
    try {
      const today = createdAt.substring(0, 10); // YYYY-MM-DD
      const analyticsDocRef = doc(db, 'analyticsDaily', today);
      await setDoc(
        analyticsDocRef,
        {
          date: today,
          orderCount: increment(1),
          totalRevenue: increment(newOrder.total),
          posOrders: increment(newOrder.source === 'POS' ? 1 : 0),
          webOrders: increment(newOrder.source === 'WEB' ? 1 : 0),
          deliveryFeeTotal: increment(newOrder.deliveryFee || 0),
          discountsTotal: increment(newOrder.discount || 0),
        },
        { merge: true }
      );
    } catch (analyticsErr) {
      console.warn('[HUMA] Skipping daily analytics aggregation:', analyticsErr);
    }

    // Increment promo usage if applicable
    if (newOrder.promoCode) {
      try {
        const promoQuery = query(collection(db, 'promos'), where('code', '==', newOrder.promoCode), limit(1));
        const promoSnap = await getDocs(promoQuery);
        if (!promoSnap.empty) {
          await updateDoc(promoSnap.docs[0].ref, { usedCount: increment(1) });
        }
      } catch (promoErr) {
        console.warn('[HUMA] Skipping promo counter update:', promoErr);
      }
    }

    // If created as COMPLETED (e.g., instant POS cashier payment), award loyalty points
    if (newOrder.status === 'COMPLETED') {
      try {
        const settings = await this.getStoreSettings();
        await this.earnPointsForOrder(newOrder, settings);
      } catch (pointErr) {
        console.warn('[HUMA Loyalty] Error awarding points in createOrder:', pointErr);
      }
    }

    return newOrder;
  }

  /**
   * Update order status with validation state machine
   */
  public static async updateOrderStatus(
    orderId: string,
    newStatus: Order['status'],
    cancellationReason?: string
  ): Promise<void> {
    const orderRef = doc(db, 'orders', orderId);

    if (newStatus === 'CANCELLED') {
      const result = await runTransaction(
        db,
        async (txn) => {
          const orderSnap =
            await txn.get(orderRef);

          if (!orderSnap.exists()) {
            throw new Error(
              'Pesanan tidak ditemukan.'
            );
          }

          const currentOrder = {
            id: orderSnap.id,
            ...orderSnap.data(),
          } as Order;

          // Idempotent cancellation:
          // a second cancellation never restores stock again.
          if (
            currentOrder.status === 'CANCELLED'
          ) {
            return {
              changed: false,
              order: currentOrder,
            };
          }

          const tracked =
            currentOrder.inventoryTracked ||
            {};

          const productEntries =
            Object.entries(tracked)
              .filter(
                ([, quantity]) =>
                  Number.isInteger(
                    Number(quantity)
                  ) &&
                  Number(quantity) > 0
              )
              .map(
                ([productId, quantity]) => ({
                  productId,
                  quantity: Number(quantity),
                  ref: doc(
                    db,
                    'products',
                    productId
                  ),
                })
              );

          const productSnapshots = [];

          for (const entry of productEntries) {
            const snap = await txn.get(
              entry.ref
            );

            productSnapshots.push({
              ...entry,
              snap,
            });
          }

          const updatedAt =
            new Date().toISOString();

            let rewardCancellation: any = null;

            if (currentOrder.orderType === 'REWARD_REDEMPTION' && currentOrder.redemptionId) {
              const redemptionRef = doc(
                db,
                'pointRedemptions',
                currentOrder.redemptionId
              );

              const redemptionSnap = await txn.get(redemptionRef);

              if (!redemptionSnap.exists()) {
                throw new Error('Data redemption tidak ditemukan.');
              }

              const redemption = redemptionSnap.data() || {};

              if (redemption.status !== 'COMPLETED') {
                throw new Error('Status redemption tidak valid untuk pembatalan.');
              }

              if (redemption.orderId !== currentOrder.id) {
                throw new Error('Redemption tidak terhubung ke order RDM ini.');
              }

              const customerRef = doc(
                db,
                'customers',
                String(redemption.customerId)
              );

              const rewardRef = doc(
                db,
                'rewards',
                String(redemption.rewardId)
              );

              const customerSnap = await txn.get(customerRef);
              const rewardSnap = await txn.get(rewardRef);

              if (!customerSnap.exists() || !rewardSnap.exists()) {
                throw new Error('Data loyalty redemption tidak lengkap.');
              }

              rewardCancellation = {
                redemptionRef,
                customerRef,
                rewardRef,
                redemption,
                customer: customerSnap.data() || {},
                reward: rewardSnap.data() || {},
                reversalLedgerRef: doc(collection(db, 'pointLedger')),
              };
            }

          // Restore modifier inventory from the exact quantities
          // recorded during the original sale.
          const modifierRestorationRequirements =
            new Map<string, number>();

          for (const [inventoryKey, quantityValue] of Object.entries(
            currentOrder.inventoryTracked || {}
          )) {
            if (!inventoryKey.startsWith('modifier:')) {
              continue;
            }

            const parts = inventoryKey.split(':');
            if (parts.length < 3) {
              continue;
            }

            const groupId = parts[1];
            const modifierId = parts.slice(2).join(':');
            const quantity = Number(quantityValue);

            if (
              !groupId ||
              !modifierId ||
              !Number.isInteger(quantity) ||
              quantity <= 0
            ) {
              continue;
            }

            modifierRestorationRequirements.set(
              `${groupId}:${modifierId}`,
              (
                modifierRestorationRequirements.get(
                  `${groupId}:${modifierId}`
                ) || 0
              ) + quantity
            );
          }

          const modifierRestorationGroups = new Map<
            string,
            Array<{ modifierId: string; quantity: number }>
          >();

          for (
            const [key, quantity]
              of modifierRestorationRequirements.entries()
          ) {
            const separator = key.indexOf(':');

            if (separator <= 0) {
              continue;
            }

            const groupId = key.slice(0, separator);
            const modifierId = key.slice(separator + 1);

            if (!modifierRestorationGroups.has(groupId)) {
              modifierRestorationGroups.set(groupId, []);
            }

            modifierRestorationGroups.get(groupId)!.push({
              modifierId,
              quantity,
            });
          }

          const modifierRestorationEntries = [
            ...modifierRestorationGroups.entries(),
          ].map(([groupId, requirements]) => ({
            groupId,
            requirements,
            ref: doc(
              db,
              'modifierGroups',
              groupId
            ),
          }));

          const modifierRestorationSnapshots = [];

          // IMPORTANT:
          // Every modifier read happens before any modifier write.
          for (const entry of modifierRestorationEntries) {
            const snap = await txn.get(entry.ref);

            modifierRestorationSnapshots.push({
              ...entry,
              snap,
            });
          }

          for (const entry of productSnapshots) {
            if (!entry.snap.exists()) {
              throw new Error(
                `Produk "${entry.productId}" tidak ditemukan sehingga stok tidak dapat dikembalikan.`
              );
            }

            const product =
              entry.snap.data() as Product;

            const currentStock =
              Number(product.stock);

            if (
              !Number.isInteger(currentStock) ||
              currentStock < 0
            ) {
              throw new Error(
                `Konfigurasi stok produk "${product.name}" tidak valid.`
              );
            }

            txn.update(entry.ref, {
              stock:
                currentStock + entry.quantity,
              updatedAt,
              inventoryOperationId:
                `cancel_${orderId}`,
              inventoryOrderId:
                orderId,
              inventoryOperationType:
                'CANCEL',
            });
          }

          // Restore modifier inventory atomically.
          for (const entry of modifierRestorationSnapshots) {
            if (!entry.snap.exists()) {
              throw new Error(
                `Modifier group "${entry.groupId}" tidak ditemukan sehingga stok tidak dapat dikembalikan.`
              );
            }

            const groupData = entry.snap.data() as any;
            const sourceItems = Array.isArray(groupData.items)
              ? groupData.items
              : [];

            const updatedItems = [...sourceItems];

            for (const requirement of entry.requirements) {
              const modifierIndex = updatedItems.findIndex(
                (modifier: any) =>
                  String(modifier?.id || '') ===
                  requirement.modifierId
              );

              if (modifierIndex < 0) {
                throw new Error(
                  `Modifier "${requirement.modifierId}" pada group "${entry.groupId}" tidak ditemukan sehingga stok tidak dapat dikembalikan.`
                );
              }

              const modifier = updatedItems[modifierIndex];
              const currentStock = Number(modifier.stock);

              if (
                !Number.isInteger(currentStock) ||
                currentStock < 0
              ) {
                throw new Error(
                  `Konfigurasi stok modifier "${modifier.name || requirement.modifierId}" tidak valid saat restore.`
                );
              }

              const restoredStock =
                currentStock + requirement.quantity;

              updatedItems[modifierIndex] = {
                ...modifier,
                stock: restoredStock,
                isAvailable: true,
                status: 'AVAILABLE',
              };
            }

            txn.update(entry.ref, {
              items: updatedItems,
              updatedAt,
            });
          }

          const finalOrder: Order = {
            ...currentOrder,
            status: 'CANCELLED',
            updatedAt,
            inventoryRestored: true,
            inventoryRestorationOperationId:
              `cancel_${orderId}`,
          };

          if (cancellationReason) {
            finalOrder.cancellationReason =
              cancellationReason;
          }

          txn.update(
            orderRef,
            sanitizeForFirestore(
              finalOrder
            ) as any
          );

            if (rewardCancellation) {
              const redemption = rewardCancellation.redemption;
              const customer = rewardCancellation.customer;
              const reward = rewardCancellation.reward;

              const pointsSpent = Number(redemption.pointsSpent || 0);
              if (pointsSpent <= 0) {
                throw new Error('Jumlah poin redemption tidak valid.');
              }

              const currentBalance = Number(customer.pointsBalance || 0);
              const restoredBalance = currentBalance + pointsSpent;

              txn.update(
                rewardCancellation.customerRef,
                {
                  pointsBalance: restoredBalance,
                  updatedAt,
                }
              );

              const redeemCount = Number(reward.redeemCount || 0);
              if (redeemCount <= 0) {
                throw new Error('Counter redemption reward tidak valid.');
              }

              const rewardUpdates: Record<string, any> = {
                redeemCount: redeemCount - 1,
                lastCancelledRedemptionId:
                  rewardCancellation.redemptionRef.id,
              };

              if (reward.type !== 'PRODUCT' && reward.stock !== undefined) {
                rewardUpdates.stock = Number(reward.stock || 0) + 1;
              }

              txn.update(
                rewardCancellation.rewardRef,
                rewardUpdates
              );

              const reversalEntry: PointLedgerEntry = {
                id: rewardCancellation.reversalLedgerRef.id,
                customerId: String(redemption.customerId),
                customerName: String(redemption.customerName || customer.name || 'Pelanggan HUMA'),
                type: 'REVERSAL',
                amount: pointsSpent,
                balanceBefore: currentBalance,
                balanceAfter: restoredBalance,
                source: 'REDEEM_CANCELLED',
                rewardId: redemption.rewardId,
                rewardName: redemption.rewardName,
                orderId: currentOrder.id,
                note: `Pengembalian ${pointsSpent} poin karena ${currentOrder.orderNumber} dibatalkan.`,
                createdAt: updatedAt,
                createdBy: 'SYSTEM',
              };

              txn.set(
                rewardCancellation.reversalLedgerRef,
                sanitizeForFirestore(reversalEntry)
              );

              txn.update(
                rewardCancellation.redemptionRef,
                {
                  status: 'CANCELLED',
                  cancelledAt: updatedAt,
                  cancelledOrderId: currentOrder.id,
                  cancellationReason:
                    cancellationReason || 'Dibatalkan oleh staff',
                  pointsBalanceAfter: restoredBalance,
                }
              );
            }

          return {
            changed: true,
            order: finalOrder,
          };
        }
      );

      if (!result.changed) {
        return;
      }

      appendOrUpdateStoredOrder(
        result.order
      );

      // Keep existing cancellation analytics.
      try {
        const today = (
          result.order.createdAt ||
          new Date().toISOString()
        ).substring(0, 10);

        const analyticsDocRef =
          doc(
            db,
            'analyticsDaily',
            today
          );

        await setDoc(
          analyticsDocRef,
          {
            cancelledOrders:
              increment(1),
          },
          { merge: true }
        );

        try {
          await this.reversePointsForCancelledOrder(
            result.order.id,
            result.order.orderNumber
          );
        } catch (revErr) {
          console.warn(
            '[HUMA Loyalty] Error reversing points on cancellation:',
            revErr
          );
        }
      } catch (analyticsErr) {
        console.warn(
          '[HUMA] Skipping cancellation analytics:',
          analyticsErr
        );
      }

      return;
    }

    // All non-cancellation status behavior remains unchanged.
    const updates: Partial<Order> = {
      status: newStatus,
      updatedAt: new Date().toISOString(),
    };

    if (cancellationReason) {
      updates.cancellationReason =
        cancellationReason;
    }

    try {
      await updateDoc(
        orderRef,
        sanitizeForFirestore(updates)
      );
    } catch (upErr) {
      console.warn(
        '[HUMA Firestore] Update order status deferred to local offline storage:',
        upErr
      );

      if (
        errorService.classify(upErr) ===
        'QUOTA_ERROR'
      ) {
        markQuotaExceeded();
      }
    }

    appendOrUpdateStoredOrder({
      id: orderId,
      ...updates,
    } as Order);

    try {
      const snap =
        await getDoc(orderRef);

      if (snap.exists()) {
        const order =
          snap.data() as Order;

        const today = (
          order.createdAt ||
          new Date().toISOString()
        ).substring(0, 10);

        const analyticsDocRef =
          doc(
            db,
            'analyticsDaily',
            today
          );

        if (newStatus === 'COMPLETED') {
          await setDoc(
            analyticsDocRef,
            {
              completedOrders:
                increment(1),
            },
            { merge: true }
          );

          try {
            const settings =
              await this.getStoreSettings();

            await this.earnPointsForOrder(
              order,
              settings
            );
          } catch (pointErr) {
            console.warn(
              '[HUMA Loyalty] Error awarding points on completion:',
              pointErr
            );
          }
        }
      }
    } catch (analyticsErr) {
      console.warn(
        '[HUMA] Skipping order status analytics aggregation:',
        analyticsErr
      );
    }
  }

  /**
   * Real-time selective order listener for Admin/POS monitor (limited to recent 50 orders)
   * With instant local cached order serving and quota exhaustion resilience
   */
  public static subscribeRecentOrders(callback: (orders: Order[]) => void): Unsubscribe {
    // 1. Instantly deliver local stored orders so UI never remains blank
    const localOrders = readStoredOrders();
    if (localOrders.length > 0) {
      callback(localOrders);
    }

    // 2. If quota limit is currently active, avoid triggering failed listeners
    if (isQuotaExceeded()) {
      console.warn('[HUMA Firestore] Daily read quota currently reached; serving orders from local storage cache.');
      return () => {};
    }

    const colRef = collection(db, 'orders');
    const q = query(colRef, orderBy('createdAt', 'desc'), limit(50));

    return onSnapshot(
      q,
      (snapshot) => {
        const orders = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Order));
        persistStoredOrders(orders);
        callback(orders);
      },
      (error) => {
        const classification = errorService.classify(error);
        if (classification === 'QUOTA_ERROR') {
          markQuotaExceeded();
          console.warn(
            '[HUMA Firestore] Daily read quota limit reached during subscribeRecentOrders. Serving from local persistent cache.'
          );
        } else {
          errorService.capture(error, { action: 'subscribeRecentOrders' });
        }
        // Fall back to stored orders on failure
        const fallback = readStoredOrders();
        if (fallback.length > 0) {
          callback(fallback);
        }
      }
    );
  }

  /* =========================================================================
   * 9. AUDIT LOGGING
   * ========================================================================= */
  public static async logAudit(entry: Omit<AuditLog, 'id' | 'timestamp'>): Promise<void> {
    try {
      const logRef = doc(collection(db, 'auditLogs'));
      const fullLog: AuditLog = {
        ...entry,
        id: logRef.id,
        timestamp: new Date().toISOString(),
      };
      await setDoc(logRef, sanitizeForFirestore(fullLog));
    } catch (err) {
      console.warn('Audit log write error', err);
    }
  }

  public static async getRecentAuditLogs(limitCount = 50): Promise<AuditLog[]> {
    try {
      const q = query(collection(db, 'auditLogs'), orderBy('timestamp', 'desc'), limit(limitCount));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as AuditLog));
    } catch {
      return [];
    }
  }

  /* =========================================================================
   * 10. DAILY ANALYTICS AGGREGATE
   * ========================================================================= */
  public static async getDailyAnalytics(dateString: string): Promise<DailyAnalytics | null> {
    try {
      const snap = await getDoc(doc(db, 'analyticsDaily', dateString));
      if (snap.exists()) {
        return snap.data() as DailyAnalytics;
      }
      return null;
    } catch {
      return null;
    }
  }

  /* =========================================================================
   * 11. INITIAL SEED DATA INITIALIZER (Auto-Setup)
   * Seeds production-quality products, categories, modifiers & settings if empty
   * ========================================================================= */
  public static async initializeSeedDataIfEmpty(): Promise<void> {
    try {
      // Writing seed data to Firestore requires admin authentication.
      // Skip if unauthenticated to prevent PERMISSION_ERROR.
      if (!auth.currentUser) {
        return;
      }

      const checkSnap = await getDocs(query(collection(db, 'products'), limit(1)));
      if (!checkSnap.empty) {
        return; // Data already initialized
      }

      console.log('[HUMA] Initializing production seed dataset in Firestore...');

      // 1. Settings
      await setDoc(doc(db, 'settings', 'general'), DEFAULT_STORE_SETTINGS, { merge: true });

      // 2. Categories
      const categories: Omit<Category, 'id'>[] = [
        { name: 'Seblak Spesial', slug: 'seblak', sortOrder: 1, isActive: true },
        { name: 'Mie & Bakso Aci', slug: 'mie-baci', sortOrder: 2, isActive: true },
        { name: 'Camilan & Gorengan', slug: 'camilan', sortOrder: 3, isActive: true },
        { name: 'Minuman Segar', slug: 'minuman', sortOrder: 4, isActive: true },
      ];
      const catIds: string[] = [];
      for (const cat of categories) {
        const id = await this.saveCategory(cat);
        catIds.push(id);
      }

      // 3. Modifier Groups
      const levelPedasGroup: Omit<ModifierGroup, 'id'> = {
        name: 'Level Pedas',
        description: 'Tentukan tingkat kepedasan favoritmu',
        isRequired: true,
        minSelection: 1,
        maxSelection: 1,
        isActive: true,
        items: [
          { id: 'p0', name: 'Level 0 (Original Gurih)', price: 0, isActive: true, sortOrder: 1 },
          { id: 'p1', name: 'Level 1 (Pedas Santai)', price: 0, isActive: true, sortOrder: 2 },
          { id: 'p2', name: 'Level 2 (Pedas Sedang)', price: 0, isActive: true, sortOrder: 3 },
          { id: 'p3', name: 'Level 3 (Pedas Nampol)', price: 1000, isActive: true, sortOrder: 4 },
          { id: 'p5', name: 'Level 5 (Pedas Mampus)', price: 2000, isActive: true, sortOrder: 5 },
        ],
      };
      const pedasGroupId = await this.saveModifierGroup(levelPedasGroup);

      const toppingGroup: Omit<ModifierGroup, 'id'> = {
        name: 'Ekstra Topping Lezat',
        description: 'Pilih topping tambahan sesuai selera',
        isRequired: false,
        minSelection: 0,
        maxSelection: 5,
        isActive: true,
        items: [
          { id: 'top-telur', name: 'Telur Ayam Utuh', price: 3500, isActive: true, sortOrder: 1 },
          { id: 'top-sosis', name: 'Sosis Sapi Panggang', price: 2500, isActive: true, sortOrder: 2 },
          { id: 'top-bakso', name: 'Bakso Sapi Urat (2 pcs)', price: 3000, isActive: true, sortOrder: 3 },
          { id: 'top-dumpling', name: 'Dumpling Keju Lumer', price: 3500, isActive: true, sortOrder: 4 },
          { id: 'top-keju', name: 'Keju Mozzarella Melt', price: 4000, isActive: true, sortOrder: 5 },
        ],
      };
      const toppingGroupId = await this.saveModifierGroup(toppingGroup);

      // 4. Products with Wholesale / Tier Pricing
      const products: Omit<Product, 'id'>[] = [
        {
          name: 'Seblak Komplit Spesial HUMA',
          categoryId: catIds[0],
          description: 'Seblak otentik kuah kental rempah kencur dengan telur, kerupuk mawar, sosis, bakso, cuanki, dan mie kuning kenyal.',
          price: 18000,
          costPrice: 10000,
          imageUrl: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=600&q=80',
          isActive: true,
          isAvailable: true,
          isPopular: true,
          wholesaleEnabled: true,
          wholesaleRules: [
            { minQty: 5, maxQty: 9, price: 17000 },
            { minQty: 10, maxQty: 19, price: 16000 },
            { minQty: 20, price: 15000 },
          ],
          modifierGroupIds: [pedasGroupId, toppingGroupId],
          sortOrder: 1,
        },
        {
          name: 'Seblak Original Perum Gina',
          categoryId: catIds[0],
          description: 'Seblak kuah pedas gurih khas Gina, kerupuk bawang, makaroni, sayur sawi segar, dan bumbu rempah pilihan.',
          price: 13000,
          costPrice: 7000,
          imageUrl: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80',
          isActive: true,
          isAvailable: true,
          isPopular: true,
          wholesaleEnabled: true,
          wholesaleRules: [
            { minQty: 5, maxQty: 9, price: 12000 },
            { minQty: 10, price: 11000 },
          ],
          modifierGroupIds: [pedasGroupId, toppingGroupId],
          sortOrder: 2,
        },
        {
          name: 'Mie Jebew Super Pedas',
          categoryId: catIds[1],
          description: 'Mie kenyal diaduk dengan chili oil racikan istimewa, kecap asin, taburan ayam cincang gurih, dan pangsit renyah.',
          price: 14000,
          costPrice: 8000,
          imageUrl: 'https://images.unsplash.com/photo-1552611052-33e04de081de?auto=format&fit=crop&w=600&q=80',
          isActive: true,
          isAvailable: true,
          isPopular: true,
          wholesaleEnabled: false,
          modifierGroupIds: [pedasGroupId, toppingGroupId],
          sortOrder: 3,
        },
        {
          name: 'Baso Aci Kuah Jeruk Limau',
          categoryId: catIds[1],
          description: 'Baso aci kenyal isi tetelan, tahu cuanki lidah, sukro cikur garing, dengan kuah kaldu segar beraroma limau asli.',
          price: 15000,
          costPrice: 8500,
          imageUrl: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=600&q=80',
          isActive: true,
          isAvailable: true,
          wholesaleEnabled: true,
          wholesaleRules: [
            { minQty: 5, maxQty: 9, price: 14000 },
            { minQty: 10, price: 13000 },
          ],
          modifierGroupIds: [pedasGroupId, toppingGroupId],
          sortOrder: 4,
        },
        {
          name: 'Ceker Mercon Kuah Nampol',
          categoryId: catIds[2],
          description: 'Ceker empuk lembut dimasak lama dalam balutan sambal mercon merah membakar selera. Cocok untuk cemilan santai.',
          price: 16000,
          costPrice: 9000,
          imageUrl: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=600&q=80',
          isActive: true,
          isAvailable: true,
          wholesaleEnabled: false,
          modifierGroupIds: [pedasGroupId],
          sortOrder: 5,
        },
        {
          name: 'Es Teh Manis Jumbo Segar',
          categoryId: catIds[3],
          description: 'Teh melati seduh wangi dengan es kristal dan gula murni, ukuran cup jumbo pelepas dahaga.',
          price: 5000,
          costPrice: 1500,
          imageUrl: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&w=600&q=80',
          isActive: true,
          isAvailable: true,
          wholesaleEnabled: false,
          sortOrder: 6,
        },
        {
          name: 'Es Cincau Susu Karamel',
          categoryId: catIds[3],
          description: 'Cincau hitam kenyal dipadu susu creamy dingin dan siraman saus karamel gula aren harum.',
          price: 9000,
          costPrice: 4000,
          imageUrl: 'https://images.unsplash.com/photo-1517256064527-09c73fc73e38?auto=format&fit=crop&w=600&q=80',
          isActive: true,
          isAvailable: true,
          wholesaleEnabled: false,
          sortOrder: 7,
        },
      ];

      for (const prod of products) {
        await this.saveProduct(prod);
      }

      // 5. Delivery Areas
      const deliveryAreas: Omit<DeliveryArea, 'id'>[] = [
        {
          name: 'Perum Gina (Blok A, B, C, D)',
          description: 'Kompleks dalam perumahan Gina — Free Ongkir Antar Sampai Depan Pagar',
          deliveryFee: 0,
          minOrderAmount: 10000,
          estimatedDeliveryMinutes: 15,
          isActive: true,
        },
        {
          name: 'Sekitar Jl. Raya Gina & Sekitarnya (< 2 km)',
          description: 'Radius dekat Perum Gina',
          deliveryFee: 3000,
          minOrderAmount: 15000,
          estimatedDeliveryMinutes: 25,
          isActive: true,
        },
        {
          name: 'Area 2 - 5 km (Kecamatan Sekitar)',
          description: 'Area kecamatan sekitar radius 5km',
          deliveryFee: 6000,
          minOrderAmount: 25000,
          estimatedDeliveryMinutes: 35,
          isActive: true,
        },
      ];
      for (const area of deliveryAreas) {
        await this.saveDeliveryArea(area);
      }

      // 6. Promos
      const promos: Omit<Promo, 'id'>[] = [
        {
          code: 'HUMABERSAHABAT',
          name: 'Diskon Spesial Warga Gina 10%',
          description: 'Diskon 10% untuk jajan bersahabat minimal belanja Rp 25.000',
          type: 'PERCENTAGE',
          value: 10,
          minPurchase: 25000,
          maxDiscount: 5000,
          usedCount: 0,
          isActive: true,
        },
        {
          code: 'GRATISONGKIR',
          name: 'Gratis Ongkir Delivery',
          description: 'Bebas ongkir untuk pesan antar dengan belanja Rp 30.000',
          type: 'FREE_DELIVERY',
          value: 0,
          minPurchase: 30000,
          usedCount: 0,
          isActive: true,
        },
      ];
      for (const promo of promos) {
        await this.savePromo(promo);
      }

      // 7. Banners
      const banners: Omit<Banner, 'id'>[] = [
        {
          title: 'Jajan Dekat Rasa Bersahabat — HUMA Food',
          imageUrl: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1200&q=80',
          isActive: true,
          sortOrder: 1,
        },
        {
          title: 'Seblak Kuah Rempah Spesial — Pedas Gurih Nendang',
          imageUrl: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=1200&q=80',
          isActive: true,
          sortOrder: 2,
        },
      ];
      for (const banner of banners) {
        await this.saveBanner(banner);
      }

      // 8. Platform Links (GoFood / ShopeeFood)
      const platforms: Omit<PlatformLink, 'id'>[] = [
        {
          name: 'GoFood',
          url: 'https://gofood.link',
          isActive: true,
        },
        {
          name: 'ShopeeFood',
          url: 'https://shopee.co.id/shopeefood',
          isActive: true,
        },
      ];
      for (const p of platforms) {
        await this.savePlatformLink(p);
      }

      console.log('[HUMA] Production seed dataset initialized successfully!');
    } catch (err) {
      console.warn('[HUMA] Skipping seed data write:', (err as any)?.message || err);
    }
  }

  /* =========================================================================
   * 12. CUSTOMER & LOYALTY POINT SYSTEM (ADMIN ONLY VISIBILITY)
   * ========================================================================= */

  /**
   * Fetch all customers (ordered by updatedAt desc)
   */
  public static async getCustomers(): Promise<Customer[]> {
    try {
      const q = query(collection(db, 'customers'), limit(150));
      const snap = await getDocs(q);

      if (snap.empty) {
        await this.seedInitialCustomers();
        const reSnap = await getDocs(q);
        const list = reSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Customer));
        return list.sort(
          (a, b) =>
            new Date(b.updatedAt || b.createdAt || 0).getTime() -
            new Date(a.updatedAt || a.createdAt || 0).getTime()
        );
      }

      const customers = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Customer));
      return customers.sort(
        (a, b) =>
          new Date(b.updatedAt || b.createdAt || 0).getTime() -
          new Date(a.updatedAt || a.createdAt || 0).getTime()
      );
    } catch (err) {
      console.warn('[HUMA] Handled error in getCustomers:', err);
      return [];
    }
  }

  /**
   * Search customer by phone/WhatsApp number for loyalty points balance check
   */
  public static async getCustomerByPhone(phone: string): Promise<Customer | null> {
    try {
      const cleanDigits = phone.replace(/\D/g, '');
      if (!cleanDigits || cleanDigits.length < 6) return null;

      const rawCustomers = await this.getCustomers();
      const matched = rawCustomers.find((c) => {
        const cDigits = (c.whatsapp || '').replace(/\D/g, '');
        if (!cDigits) return false;
        if (cDigits === cleanDigits) return true;
        const cTrimmed = cDigits.replace(/^0/, '').replace(/^62/, '');
        const qTrimmed = cleanDigits.replace(/^0/, '').replace(/^62/, '');
        return cTrimmed === qTrimmed;
      });

      return matched || null;
    } catch (err) {
      console.warn('[HUMA] Handled error in getCustomerByPhone:', err);
      return null;
    }
  }

  /**
   * Real-time listener for customers
   */
  public static subscribeCustomers(callback: (customers: Customer[]) => void): Unsubscribe {
    const local = readStoredCustomers();
    if (local.length > 0) {
      callback(local);
    }

    if (isQuotaExceeded()) {
      return () => {};
    }

    const colRef = collection(db, 'customers');
    const q = query(colRef, limit(150));

    return onSnapshot(
      q,
      (snapshot) => {
        const customers = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Customer));
        customers.sort(
          (a, b) =>
            new Date(b.updatedAt || b.createdAt || 0).getTime() -
            new Date(a.updatedAt || a.createdAt || 0).getTime()
        );
        persistStoredCustomers(customers);
        callback(customers);
      },
      (error) => {
        const classification = errorService.classify(error);
        if (classification === 'QUOTA_ERROR') {
          markQuotaExceeded();
          console.warn('[HUMA Firestore] Read quota reached in subscribeCustomers, using local cache.');
        } else {
          errorService.capture(error, { action: 'subscribeCustomers' });
        }
        callback(readStoredCustomers());
      }
    );
  }

  /**
   * Real-time listener for a customer's point ledger
   */
  public static subscribeCustomerPointLedger(
    customerId: string,
    callback: (entries: PointLedgerEntry[]) => void
  ): Unsubscribe {
    if (isQuotaExceeded()) {
      return () => {};
    }

    const colRef = collection(db, 'pointLedger');
    const q = query(colRef, where('customerId', '==', customerId), limit(100));

    return onSnapshot(
      q,
      (snapshot) => {
        const entries = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as PointLedgerEntry));
        entries.sort(
          (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
        );
        callback(entries);
      },
      (error) => {
        const classification = errorService.classify(error);
        if (classification === 'QUOTA_ERROR') {
          markQuotaExceeded();
          console.warn('[HUMA Firestore] Read quota reached in subscribeCustomerPointLedger.');
        } else {
          errorService.capture(error, { action: 'subscribeCustomerPointLedger', customerId });
        }
      }
    );
  }

  public static async seedInitialCustomers(): Promise<void> {
    try {
      const now = new Date().toISOString();
      const initialCustomers: Customer[] = [
        {
          id: 'cust_081234567890',
          name: 'Budi Santoso',
          whatsapp: '081234567890',
          address: 'Perum Gina Blok B2 No. 14',
          notes: 'Pelanggan setia seblak level 3 komplit',
          status: 'ACTIVE',
          pointsBalance: 250,
          totalPointsEarned: 350,
          totalSpent: 185000,
          totalOrders: 6,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'cust_081987654321',
          name: 'Siti Rahmawati',
          whatsapp: '081987654321',
          address: 'Perum Gina Blok A1 No. 05',
          notes: 'Suka mie jebew & es cincau karamel',
          status: 'ACTIVE',
          pointsBalance: 120,
          totalPointsEarned: 170,
          totalSpent: 95000,
          totalOrders: 3,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'cust_085712345678',
          name: 'Ahmad Fauzi',
          whatsapp: '085712345678',
          address: 'Jl. Raya Gina No. 88 (Dekat gapura)',
          notes: 'Langganan kantor / pesanan rame-rame',
          status: 'ACTIVE',
          pointsBalance: 450,
          totalPointsEarned: 600,
          totalSpent: 320000,
          totalOrders: 11,
          createdAt: now,
          updatedAt: now,
        },
      ];

      for (const cust of initialCustomers) {
        await setDoc(doc(db, 'customers', cust.id), cust, { merge: true });
      }
    } catch (e) {
      console.warn('Seed customers skipped:', e);
    }
  }

  /**
   * Get single customer by ID
   */
  public static async getCustomerById(customerId: string): Promise<Customer | null> {
    try {
      const snap = await getDoc(doc(db, 'customers', customerId));
      if (snap.exists()) {
        return { id: snap.id, ...snap.data() } as Customer;
      }
      return null;
    } catch (err) {
      errorService.capture(err, { action: 'getCustomerById', customerId });
      return null;
    }
  }

  /**
   * Find customer by WhatsApp phone number
   */
  public static async findCustomerByWhatsapp(whatsapp: string): Promise<Customer | null> {
    const cleanPhone = whatsapp.replace(/[^0-9]/g, '');
    if (!cleanPhone) return null;

    try {
      const q = query(collection(db, 'customers'), where('whatsapp', '==', cleanPhone), limit(1));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const d = snap.docs[0];
        return { id: d.id, ...d.data() } as Customer;
      }
      return null;
    } catch (err) {
      errorService.capture(err, { action: 'findCustomerByWhatsapp', whatsapp });
      return null;
    }
  }

  /**
   * Create or update customer record
   */
  public static async saveCustomer(customer: Partial<Customer>): Promise<Customer> {
    const now = new Date().toISOString();
    const cleanPhone = (customer.whatsapp || '').replace(/[^0-9]/g, '');

    const customerId = customer.id || (cleanPhone ? `cust_${cleanPhone}` : doc(collection(db, 'customers')).id);
    const docRef = doc(db, 'customers', customerId);

    const existing = await getDoc(docRef);
    let fullCustomer: Customer;

    if (existing.exists()) {
      const current = existing.data() as Customer;
      fullCustomer = {
        ...current,
        name: (customer.name || current.name).trim(),
        whatsapp: cleanPhone || current.whatsapp,
        address: customer.address !== undefined ? customer.address.trim() : current.address,
        notes: customer.notes !== undefined ? customer.notes.trim() : current.notes,
        status: customer.status || current.status || 'ACTIVE',
        updatedAt: now,
      };
    } else {
      fullCustomer = {
        id: customerId,
        name: (customer.name || 'Pelanggan HUMA').trim(),
        whatsapp: cleanPhone,
        address: customer.address?.trim() || '',
        notes: customer.notes?.trim() || '',
        status: customer.status || 'ACTIVE',
        totalSpent: customer.totalSpent || 0,
        totalOrders: customer.totalOrders || 0,
        pointsBalance: customer.pointsBalance || 0,
        totalPointsEarned: customer.totalPointsEarned || 0,
        createdAt: now,
        updatedAt: now,
      };
    }

    await setDoc(docRef, sanitizeForFirestore(fullCustomer), { merge: true });
    return fullCustomer;
  }

  /**
   * Delete or deactivate customer
   */
  public static async deleteCustomer(customerId: string): Promise<void> {
    const docRef = doc(db, 'customers', customerId);
    await updateDoc(docRef, { status: 'INACTIVE', updatedAt: new Date().toISOString() });
  }

  /**
   * Fetch point ledger history (optionally filtered by customerId)
   */
  public static async getPointLedger(customerId?: string, limitCount = 100): Promise<PointLedgerEntry[]> {
    try {
      const colRef = collection(db, 'pointLedger');
      const q = customerId
        ? query(colRef, where('customerId', '==', customerId), limit(limitCount))
        : query(colRef, limit(limitCount));

      const snap = await getDocs(q);
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as PointLedgerEntry));
      return list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    } catch (err) {
      console.warn('[HUMA] Handled error in getPointLedger:', err);
      return [];
    }
  }

  /**
   * Reward Catalog CRUD
   */
  public static async getRewards(onlyActive = false): Promise<RewardItem[]> {
    try {
      const colRef = collection(db, 'rewards');
      const snap = await getDocs(query(colRef, limit(100)));

      if (snap.empty) {
        await this.seedInitialRewards();
        const reSnap = await getDocs(query(colRef, limit(100)));
        let list = reSnap.docs.map((d) => ({ id: d.id, ...d.data() } as RewardItem));
        if (onlyActive) {
          list = list.filter((r) => r.isActive !== false);
        }
        return list.sort((a, b) => (a.pointsCost || 0) - (b.pointsCost || 0));
      }

      let list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as RewardItem));
      if (onlyActive) {
        list = list.filter((r) => r.isActive !== false);
      }
      return list.sort((a, b) => (a.pointsCost || 0) - (b.pointsCost || 0));
    } catch (err) {
      console.warn('[HUMA] Handled error in getRewards:', err);
      return [];
    }
  }

  public static async seedInitialRewards(): Promise<void> {
    try {
      const now = new Date().toISOString();
      const initialRewards: RewardItem[] = [
        {
          id: 'reward_es_teh',
          name: 'Es Teh Manis Jumbo Gratis',
          type: 'PRODUCT',
          pointsCost: 50,
          productId: 'prod-teh-jumbo',
          productName: 'Es Teh Manis Jumbo Segar',
          description: 'Tukarkan 50 poin loyalitas untuk 1 cup Es Teh Manis Jumbo Segar.',
          isActive: true,
          redeemCount: 14,
          createdAt: now,
        },
        {
          id: 'reward_diskon_5k',
          name: 'Voucher Potongan Rp 5.000',
          type: 'DISCOUNT',
          pointsCost: 100,
          discountValue: 5000,
          description: 'Potongan harga langsung Rp 5.000 untuk transaksi apa saja.',
          stock: 50,
          isActive: true,
          redeemCount: 28,
          createdAt: now,
        },
        {
          id: 'reward_topping_dumpling',
          name: 'Free Topping Dumpling Keju',
          type: 'PRODUCT',
          pointsCost: 75,
          productName: 'Dumpling Keju Lumer',
          description: 'Gratis 1 porsi topping Dumpling Keju Lumer pada seblak Anda.',
          stock: 40,
          isActive: true,
          redeemCount: 9,
          createdAt: now,
        },
        {
          id: 'reward_diskon_10k',
          name: 'Voucher Potongan Rp 10.000',
          type: 'DISCOUNT',
          pointsCost: 200,
          discountValue: 10000,
          description: 'Potongan harga langsung Rp 10.000 hemat bersahabat.',
          stock: 30,
          isActive: true,
          redeemCount: 12,
          createdAt: now,
        },
      ];

      for (const reward of initialRewards) {
        await setDoc(doc(db, 'rewards', reward.id), reward, { merge: true });
      }
    } catch (e) {
      console.warn('Seed rewards skipped:', e);
    }
  }

  public static async saveReward(reward: Partial<RewardItem>): Promise<void> {
    const rewardId = reward.id || doc(collection(db, 'rewards')).id;
    const docRef = doc(db, 'rewards', rewardId);

    const fullReward: RewardItem = {
      id: rewardId,
      name: (reward.name || '').trim(),
      type: reward.type || 'PRODUCT',
      pointsCost: Number(reward.pointsCost) || 100,
      discountValue: reward.discountValue ? Number(reward.discountValue) : undefined,
      productId: reward.productId || undefined,
      productName: reward.productName || undefined,
      description: reward.description?.trim() || '',
      stock: reward.stock !== undefined ? Number(reward.stock) : undefined,
      isActive: reward.isActive !== false,
      validUntil: reward.validUntil || undefined,
      redeemCount: reward.redeemCount || 0,
      createdAt: reward.createdAt || new Date().toISOString(),
    };

    const cleanReward = sanitizeForFirestore(fullReward) as unknown as Record<
      string,
      unknown
    >;

    // PRODUCT rewards with a master product must never keep a
    // duplicate reward-level stock value.
    if (
      fullReward.type === 'PRODUCT' &&
      fullReward.productId
    ) {
      cleanReward.stock = deleteField();
    }

    await setDoc(
      docRef,
      cleanReward,
      { merge: true }
    );
  }

  public static async deleteReward(rewardId: string): Promise<void> {
    await deleteDoc(doc(db, 'rewards', rewardId));
  }

  /**
   * Fetch point redemptions history
   */
  public static async getPointRedemptions(customerId?: string, limitCount = 50): Promise<PointRedemption[]> {
    try {
      const colRef = collection(db, 'pointRedemptions');
      const q = customerId
        ? query(colRef, where('customerId', '==', customerId), limit(limitCount))
        : query(colRef, limit(limitCount));

      const snap = await getDocs(q);
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as PointRedemption));
      return list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    } catch (err) {
      console.warn('[HUMA] Handled error in getPointRedemptions:', err);
      return [];
    }
  }

  /**
   * Award loyalty points for a completed order (Atomic & Idempotent)
   */
  public static async earnPointsForOrder(order: Order, settings: StoreSettings | null): Promise<number> {
    if (!settings || settings.isPointsEnabled === false) return 0;

    const rawPhone = order.customer?.whatsapp || '';
    const cleanPhone = rawPhone.replace(/[^0-9]/g, '');
    const customerName = (order.customer?.name || '').trim();

    // If order has no phone and no customer identifier, points cannot be tracked
    if (!cleanPhone && !customerName) return 0;

    const rate = settings.pointsPerRupiah || 10000;
    const minOrder = settings.minOrderForPoints || 10000;

    if (order.subtotal < minOrder) return 0;

    let points = settings.pointsRounding === 'ROUND'
      ? Math.round(order.subtotal / rate)
      : Math.floor(order.subtotal / rate);

    if (settings.maxPointsPerOrder && points > settings.maxPointsPerOrder) {
      points = settings.maxPointsPerOrder;
    }

    if (points <= 0) return 0;

    try {
      // 1. Idempotency check: verify points have not already been awarded for this order
      const existingLedgerQuery = query(
        collection(db, 'pointLedger'),
        where('orderId', '==', order.id),
        where('type', '==', 'EARN'),
        limit(1)
      );
      const existingSnap = await getDocs(existingLedgerQuery);
      if (!existingSnap.empty) {
        console.log(`[HUMA Loyalty] Points already awarded for order #${order.orderNumber}`);
        return 0;
      }

      // 2. Find or create customer
      let customer: Customer | null = null;
      if (cleanPhone) {
        customer = await this.findCustomerByWhatsapp(cleanPhone);
      }

      if (!customer) {
        customer = await this.saveCustomer({
          name: customerName || 'Pelanggan HUMA',
          whatsapp: cleanPhone,
          address: order.customer?.address || '',
          totalSpent: order.total,
          totalOrders: 1,
          pointsBalance: 0,
          totalPointsEarned: 0,
        });
      }

      const customerRef = doc(db, 'customers', customer.id);
      const ledgerRef = doc(collection(db, 'pointLedger'));
      const now = new Date().toISOString();

      await runTransaction(db, async (txn) => {
        const custDoc = await txn.get(customerRef);
        const currentBalance = custDoc.exists() ? (custDoc.data()?.pointsBalance || 0) : 0;
        const currentTotalSpent = custDoc.exists() ? (custDoc.data()?.totalSpent || 0) : 0;
        const currentTotalOrders = custDoc.exists() ? (custDoc.data()?.totalOrders || 0) : 0;
        const currentTotalEarned = custDoc.exists() ? (custDoc.data()?.totalPointsEarned || 0) : 0;

        const newBalance = currentBalance + points;

        txn.update(customerRef, {
          pointsBalance: newBalance,
          totalPointsEarned: currentTotalEarned + points,
          totalSpent: currentTotalSpent + order.total,
          totalOrders: currentTotalOrders + 1,
          updatedAt: now,
        });

        const ledgerEntry: PointLedgerEntry = {
          id: ledgerRef.id,
          customerId: customer!.id,
          customerName: customerName || customer!.name,
          type: 'EARN',
          amount: points,
          balanceBefore: currentBalance,
          balanceAfter: newBalance,
          source: 'ORDER',
          orderId: order.id,
          note: `Poin dari transaksi pesanan #${order.orderNumber} (Rp ${order.subtotal.toLocaleString('id-ID')})`,
          createdAt: now,
          createdBy: 'SYSTEM',
        };

        txn.set(ledgerRef, sanitizeForFirestore(ledgerEntry));
      });

      console.log(`[HUMA Loyalty] Awarded ${points} points to ${customer.name} for order #${order.orderNumber}`);
      return points;
    } catch (err) {
      errorService.capture(err, { action: 'earnPointsForOrder', orderId: order.id });
      return 0;
    }
  }

  /**
   * Reverse points if an order is cancelled/refunded
   */
  public static async reversePointsForCancelledOrder(orderId: string, orderNumber: string): Promise<void> {
    try {
      // Find the EARN entry
      const earnQuery = query(
        collection(db, 'pointLedger'),
        where('orderId', '==', orderId),
        where('type', '==', 'EARN'),
        limit(1)
      );
      const earnSnap = await getDocs(earnQuery);
      if (earnSnap.empty) return;

      const earnEntry = earnSnap.docs[0].data() as PointLedgerEntry;
      const pointsToReverse = earnEntry.amount;

      // Check if already reversed
      const reversalQuery = query(
        collection(db, 'pointLedger'),
        where('orderId', '==', orderId),
        where('type', '==', 'REVERSAL'),
        limit(1)
      );
      const revSnap = await getDocs(reversalQuery);
      if (!revSnap.empty) return; // Already reversed

      const customerRef = doc(db, 'customers', earnEntry.customerId);
      const ledgerRef = doc(collection(db, 'pointLedger'));
      const now = new Date().toISOString();

      await runTransaction(db, async (txn) => {
        const custDoc = await txn.get(customerRef);
        if (!custDoc.exists()) return;

        const currentBalance = custDoc.data()?.pointsBalance || 0;
        const newBalance = Math.max(0, currentBalance - pointsToReverse);

        txn.update(customerRef, {
          pointsBalance: newBalance,
          updatedAt: now,
        });

        const reversalEntry: PointLedgerEntry = {
          id: ledgerRef.id,
          customerId: earnEntry.customerId,
          customerName: earnEntry.customerName,
          type: 'REVERSAL',
          amount: -pointsToReverse,
          balanceBefore: currentBalance,
          balanceAfter: newBalance,
          source: 'ORDER_CANCELLED',
          orderId,
          note: `Pembatalan ${pointsToReverse} poin dari pesanan #${orderNumber} yang dibatalkan`,
          createdAt: now,
          createdBy: 'SYSTEM',
        };

        txn.set(ledgerRef, sanitizeForFirestore(reversalEntry));
      });
    } catch (err) {
      errorService.capture(err, { action: 'reversePointsForCancelledOrder', orderId });
    }
  }

  /**
   * Redeem points for discount (Potongan Harga)
   */
  public static async redeemPointsDiscount(params: {
    customerId: string;
    pointsToRedeem: number;
    discountValue: number;
    adminId: string;
    adminName: string;
    orderId?: string;
  }): Promise<PointRedemption> {
    const { customerId, pointsToRedeem, discountValue, adminId, adminName, orderId } = params;

    if (pointsToRedeem <= 0) {
      throw new Error('Jumlah poin yang ditukarkan harus lebih dari 0.');
    }

    const customerRef = doc(db, 'customers', customerId);
    const ledgerRef = doc(collection(db, 'pointLedger'));
    const redemptionRef = doc(collection(db, 'pointRedemptions'));
    const now = new Date().toISOString();

    let redemptionResult: PointRedemption;

    await runTransaction(db, async (txn) => {
      const custDoc = await txn.get(customerRef);
      if (!custDoc.exists()) {
        throw new Error('Data pelanggan tidak ditemukan.');
      }

      const custData = custDoc.data() as Customer;
      if (custData.status === 'INACTIVE') {
        throw new Error('Pelanggan berstatus tidak aktif.');
      }

      if ((custData.pointsBalance || 0) < pointsToRedeem) {
        throw new Error(`Saldo poin tidak mencukupi. Saldo saat ini: ${custData.pointsBalance || 0} poin.`);
      }

      const currentBalance = custData.pointsBalance || 0;
      const newBalance = currentBalance - pointsToRedeem;

      txn.update(customerRef, {
        pointsBalance: newBalance,
        updatedAt: now,
      });

      const ledgerEntry: PointLedgerEntry = {
        id: ledgerRef.id,
        customerId,
        customerName: custData.name,
        type: 'REDEEM',
        amount: -pointsToRedeem,
        balanceBefore: currentBalance,
        balanceAfter: newBalance,
        source: 'REDEEM_DISCOUNT',
        orderId,
        note: `Tukar ${pointsToRedeem} poin untuk potongan harga Rp ${discountValue.toLocaleString('id-ID')}`,
        createdAt: now,
        createdBy: adminId || 'ADMIN',
      };

      txn.set(ledgerRef, sanitizeForFirestore(ledgerEntry));

      redemptionResult = {
        id: redemptionRef.id,
        customerId,
        customerName: custData.name,
        rewardId: 'DISCOUNT_REWARD',
        rewardName: `Potongan Belanja Rp ${discountValue.toLocaleString('id-ID')}`,
        type: 'DISCOUNT',
        pointsSpent: pointsToRedeem,
        discountAmount: discountValue,
        orderId,
        createdAt: now,
        createdBy: adminName || 'Admin',
        status: 'COMPLETED',
      };

      txn.set(redemptionRef, sanitizeForFirestore(redemptionResult));
    });

    return redemptionResult!;
  }

  /**
   * Redeem points for a free product reward
   */
  public static async redeemPointsProduct(params: {
    customerId: string;
    rewardId: string;
    adminId: string;
    adminName: string;
    orderId?: string;
  }): Promise<PointRedemption> {
    const { customerId, rewardId, adminId, adminName, orderId } = params;

    const customerRef = doc(db, 'customers', customerId);
    const rewardRef = doc(db, 'rewards', rewardId);
    const ledgerRef = doc(collection(db, 'pointLedger'));
    const redemptionRef = doc(collection(db, 'pointRedemptions'));
    const now = new Date().toISOString();

    let redemptionResult: PointRedemption;

    await runTransaction(db, async (txn) => {
      const custDoc = await txn.get(customerRef);
      if (!custDoc.exists()) {
        throw new Error('Data pelanggan tidak ditemukan.');
      }
      const custData = custDoc.data() as Customer;
      if (custData.status === 'INACTIVE') {
        throw new Error('Pelanggan berstatus tidak aktif.');
      }

      const rewardDoc = await txn.get(rewardRef);
      if (!rewardDoc.exists()) {
        throw new Error('Reward tidak ditemukan.');
      }
      const reward = rewardDoc.data() as RewardItem;
      if (!reward.isActive) {
        throw new Error('Reward ini sedang tidak aktif.');
      }
      if (reward.validUntil && new Date(reward.validUntil) < new Date()) {
        throw new Error('Masa berlaku reward telah berakhir.');
      }
      if (
        reward.type !== 'PRODUCT' &&
        reward.stock !== undefined &&
        reward.stock <= 0
      ) {
        throw new Error('Stok kuota reward telah habis.');
      }

      if ((custData.pointsBalance || 0) < reward.pointsCost) {
        throw new Error(`Poin tidak cukup. Dibutuhkan ${reward.pointsCost} poin, saldo: ${custData.pointsBalance || 0} poin.`);
      }

      const currentBalance = custData.pointsBalance || 0;
      const newBalance = currentBalance - reward.pointsCost;

      if (
        reward.type === 'PRODUCT' &&
        reward.productId
      ) {
        const productRef = doc(
          db,
          'products',
          reward.productId
        );

        const productDoc = await txn.get(
          productRef
        );

        if (!productDoc.exists()) {
          throw new Error(
            'Produk reward tidak ditemukan.'
          );
        }

        const product =
          productDoc.data() as Product;

        if (product.stockEnabled !== true) {
          throw new Error(
            `Stok master produk "${product.name}" belum aktif.`
          );
        }

        const currentStock =
          Number(product.stock);

        if (
          !Number.isInteger(currentStock) ||
          currentStock < 0
        ) {
          throw new Error(
            `Konfigurasi stok produk "${product.name}" tidak valid.`
          );
        }

        if (currentStock <= 0) {
          throw new Error(
            `Stok "${product.name}" telah habis.`
          );
        }

        txn.update(productRef, {
          stock: currentStock - 1,
          updatedAt: now,
          inventoryOperationId:
            redemptionRef.id,
          inventoryOperationType:
            'REDEEM_REWARD',
        });
      }

      txn.update(customerRef, {
        pointsBalance: newBalance,
        updatedAt: now,
      });

      // Decrement reward stock if tracked
      const rewardUpdates: Record<string, any> = {
        redeemCount:
          (reward.redeemCount || 0) + 1,
        lastRedemptionId: redemptionRef.id,
      };
      if (
        reward.type !== 'PRODUCT' &&
        reward.stock !== undefined
      ) {
        rewardUpdates.stock =
          Math.max(0, reward.stock - 1);
      }
      txn.update(rewardRef, rewardUpdates);

      const ledgerEntry: PointLedgerEntry = {
        id: ledgerRef.id,
        customerId,
        customerName: custData.name,
        type: 'REDEEM',
        amount: -reward.pointsCost,
        balanceBefore: currentBalance,
        balanceAfter: newBalance,
        source: 'REDEEM_PRODUCT',
        rewardId: reward.id,
        rewardName: reward.name,
        orderId,
        note: `Tukar ${reward.pointsCost} poin untuk reward ${reward.name}`,
        createdAt: now,
        createdBy: adminId || 'ADMIN',
      };
      txn.set(ledgerRef, sanitizeForFirestore(ledgerEntry));

      redemptionResult = {
        id: redemptionRef.id,
        customerId,
        customerName: custData.name,
        rewardId: reward.id,
        rewardName: reward.name,
        type: reward.type,
        pointsSpent: reward.pointsCost,
        productId: reward.productId,
        productName: reward.productName,
        orderId,
        inventoryOperationId: redemptionRef.id,
        createdAt: now,
        createdBy: adminName || 'Admin',
        status: 'COMPLETED',
      };
      txn.set(redemptionRef, sanitizeForFirestore(redemptionResult));
    });

    return redemptionResult!;
  }

  /**
   * Instant Reward Redemption by customer (Self-Service with WhatsApp Phone Number)
   * Connects to customer points balance and processes atomic point deduction
   */
  public static async redeemInstantReward(params: {
    customerPhone: string;
    customerName?: string;
    rewardId: string;
  }): Promise<{
    redemption: PointRedemption;
    customer: Customer;
    reward: RewardItem;
  }> {
    const { customerPhone, customerName, rewardId } = params;
    const cleanDigits = customerPhone.replace(/\D/g, '');
    if (!cleanDigits || cleanDigits.length < 6) {
      throw new Error('Nomor WhatsApp tidak valid. Masukkan minimal 6 digit nomor.');
    }

    // 1. Locate customer by phone
    let customer = await this.getCustomerByPhone(customerPhone);
    if (!customer) {
      customer = await this.findCustomerByWhatsapp(cleanDigits);
    }

    if (!customer) {
      throw new Error(`Nomor ${customerPhone} belum terdaftar atau belum memiliki saldo poin. Kumpulkan poin dengan berbelanja terlebih dahulu!`);
    }

    if (customer.status === 'INACTIVE') {
      throw new Error('Akun pelanggan berstatus nonaktif.');
    }

    // 2. Fetch reward
    const rewardRef = doc(db, 'rewards', rewardId);
    const rewardSnap = await getDoc(rewardRef);
    if (!rewardSnap.exists()) {
      throw new Error('Hadiah tidak ditemukan di katalog.');
    }
    const reward = { id: rewardSnap.id, ...rewardSnap.data() } as RewardItem;
    if (!reward.isActive) {
      throw new Error('Hadiah ini sedang tidak aktif.');
    }
    if (reward.validUntil && new Date(reward.validUntil) < new Date()) {
      throw new Error('Masa berlaku hadiah telah berakhir.');
    }
    if (
      reward.type !== 'PRODUCT' &&
      reward.stock !== undefined &&
      reward.stock <= 0
    ) {
      throw new Error('Kuota stok hadiah ini telah habis.');
    }

    if ((customer.pointsBalance || 0) < reward.pointsCost) {
      throw new Error(
        `Saldo poin Anda (${customer.pointsBalance || 0} poin) tidak mencukupi untuk menukarkan hadiah ini (${reward.pointsCost} poin).`
      );
    }

    // 3. Generate unique redemption code (e.g. RDM-XXXXXX)
      // Stable redemption/order identity.
      const redemptionRef = doc(collection(db, 'pointRedemptions'));
      const redemptionCode =
        `RDM-${redemptionRef.id.slice(-8).toUpperCase()}`;
      const orderRef = doc(collection(db, 'orders'));
      const orderId = orderRef.id;
      const orderNumber = `#${redemptionCode}`;
      const customerRef = doc(db, 'customers', customer.id);
      const ledgerRef = doc(collection(db, 'pointLedger'));
      const now = new Date().toISOString();

    let redemptionResult: PointRedemption;
    let updatedCustomer: Customer;

    await runTransaction(db, async (txn) => {
      const custDoc = await txn.get(customerRef);
      if (!custDoc.exists()) {
        throw new Error('Data pelanggan tidak ditemukan.');
      }
      const custData = custDoc.data() as Customer;
      const currentBalance = custData.pointsBalance || 0;

      if (currentBalance < reward.pointsCost) {
        throw new Error(
          `Saldo poin tidak mencukupi saat proses transaksi (${currentBalance} poin).`
        );
      }

      // PRODUCT reward consumes the same master stock used by sales.
      if (
        reward.type === 'PRODUCT' &&
        reward.productId
      ) {
        const productRef = doc(
          db,
          'products',
          reward.productId
        );

        const productDoc = await txn.get(
          productRef
        );

        if (!productDoc.exists()) {
          throw new Error(
            'Produk reward tidak ditemukan.'
          );
        }

        const product =
          productDoc.data() as Product;

        if (product.stockEnabled !== true) {
          throw new Error(
            `Stok master produk "${product.name}" belum aktif.`
          );
        }

        const currentStock =
          Number(product.stock);

        if (
          !Number.isInteger(currentStock) ||
          currentStock < 0
        ) {
          throw new Error(
            `Konfigurasi stok produk "${product.name}" tidak valid.`
          );
        }

        if (currentStock <= 0) {
          throw new Error(
            `Stok "${product.name}" telah habis.`
          );
        }

        txn.update(productRef, {
          stock: currentStock - 1,
          updatedAt: now,
          inventoryOperationId:
            redemptionRef.id,
          inventoryOperationType:
            'REDEEM_REWARD',
        });
      }

      const newBalance =
        currentBalance - reward.pointsCost;

      txn.update(customerRef, {
        pointsBalance: newBalance,
        updatedAt: now,
      });

      // Decrement reward stock if tracked
      const rewardUpdates: Record<string, any> = {
        redeemCount:
          (reward.redeemCount || 0) + 1,
        lastRedemptionId: redemptionRef.id,
      };
      if (
        reward.type !== 'PRODUCT' &&
        reward.stock !== undefined
      ) {
        rewardUpdates.stock =
          Math.max(0, reward.stock - 1);
      }
      txn.update(rewardRef, rewardUpdates);

      // Point ledger entry
      const ledgerEntry: PointLedgerEntry = {
        id: ledgerRef.id,
        customerId: customer.id,
        customerName: custData.name || customerName || 'Pelanggan HUMA',
        type: 'REDEEM',
        amount: -reward.pointsCost,
        balanceBefore: currentBalance,
        balanceAfter: newBalance,
        source: 'INSTANT_REDEEM',
        rewardId: reward.id,
        rewardName: reward.name,
        note: `Redem Instan [${redemptionCode}] untuk "${reward.name}"`,
        createdAt: now,
        createdBy: 'CUSTOMER_SELF_SERVICE',
      };
      txn.set(ledgerRef, sanitizeForFirestore(ledgerEntry));

      // Redemption record
      redemptionResult = {
        id: redemptionRef.id,
        redemptionCode,
        customerId: customer.id,
        customerName: custData.name || customerName || 'Pelanggan HUMA',
        customerPhone: custData.whatsapp || cleanDigits,
        rewardId: reward.id,
        rewardName: reward.name,
        type: reward.type,
        pointsSpent: reward.pointsCost,
        productId: reward.productId,
        productName: reward.productName,
        discountAmount: reward.discountValue,
        pointsBalanceAfter: newBalance,
          orderId,
        inventoryOperationId: redemptionRef.id,
        createdAt: now,
        createdBy: 'CUSTOMER_INSTANT',
        status: 'COMPLETED',
      };
      txn.set(redemptionRef, sanitizeForFirestore(redemptionResult));

        // Store the redemption as a normal pending order.
        const rewardOrder: Order = {
          id: orderId,
          orderNumber,
          createdAt: now,
          source: 'WEB',
          status: 'PENDING',
          orderType: 'REWARD_REDEMPTION',
          redemptionId: redemptionRef.id,
          redemptionCode,
          customer: {
            name:
              custData.name ||
              customerName ||
              'Pelanggan HUMA',
            whatsapp:
              custData.whatsapp ||
              cleanDigits,
            notes:
              `Redeem reward "${reward.name}" ` +
              `dengan ${reward.pointsCost} poin. ` +
              `Kode: ${redemptionCode}`,
          },
          serviceType: 'TAKEAWAY',
          items: [
            {
              cartItemId:
                `reward-${redemptionRef.id}`,
              productId:
                reward.productId ||
                `reward-${reward.id}`,
              productName:
                reward.productName ||
                reward.name,
              productImage: '',
              basePrice: 0,
              unitPrice: 0,
              quantity: 1,
              selectedModifiers: [],
              modifiersPrice: 0,
              lineTotal: 0,
              categoryId: 'REWARD',
            },
          ],
          subtotal: 0,
          discount: 0,
          deliveryFee: 0,
          total: 0,
          paymentMethod: 'CASH',
          amountPaid: 0,
          change: 0,
          idempotencyKey:
            `reward-redemption-${redemptionRef.id}`,
          inventoryOperationId: orderId,
          inventoryTracked:
            reward.type === 'PRODUCT' &&
            reward.productId
              ? { [reward.productId]: 1 }
              : {},
        };

        txn.set(
          orderRef,
          sanitizeForFirestore(rewardOrder)
        );

      updatedCustomer = {
        ...custData,
        pointsBalance: newBalance,
        updatedAt: now,
      };
    });

    return {
      redemption: redemptionResult!,
      customer: updatedCustomer!,
      reward,
    };
  }

  /**
   * Manual point adjustment by Admin (Audited with reason & admin identity)
   */
  public static async manualAdjustPoints(params: {
    customerId: string;
    amount: number;
    reason: string;
    adminId: string;
    adminName: string;
  }): Promise<void> {
    const { customerId, amount, reason, adminId, adminName } = params;
    if (amount === 0) {
      throw new Error('Jumlah perubahan poin tidak boleh 0.');
    }
    if (!reason.trim()) {
      throw new Error('Alasan penyesuaian poin wajib diisi.');
    }

    const customerRef = doc(db, 'customers', customerId);
    const ledgerRef = doc(collection(db, 'pointLedger'));
    const now = new Date().toISOString();

    await runTransaction(db, async (txn) => {
      const custDoc = await txn.get(customerRef);
      if (!custDoc.exists()) {
        throw new Error('Pelanggan tidak ditemukan.');
      }
      const cust = custDoc.data() as Customer;
      const currentBalance = cust.pointsBalance || 0;
      const newBalance = currentBalance + amount;

      if (newBalance < 0) {
        throw new Error(`Pengurangan melebihi saldo poin. Saldo saat ini: ${currentBalance} poin.`);
      }

      txn.update(customerRef, {
        pointsBalance: newBalance,
        updatedAt: now,
      });

      const ledgerEntry: PointLedgerEntry = {
        id: ledgerRef.id,
        customerId,
        customerName: cust.name,
        type: 'ADJUSTMENT',
        amount,
        balanceBefore: currentBalance,
        balanceAfter: newBalance,
        source: 'ADMIN_MANUAL',
        note: `Penyesuaian manual oleh ${adminName}: ${reason.trim()}`,
        createdAt: now,
        createdBy: adminId || 'ADMIN',
      };

      txn.set(ledgerRef, sanitizeForFirestore(ledgerEntry));
    });
  }

  /**
   * Bulk create products efficiently with anti-duplicate validation
   */
  public static async bulkCreateProducts(
    productList: Array<Omit<Product, 'id'>>
  ): Promise<{ insertedCount: number; skippedDuplicatesCount: number; duplicateNames: string[] }> {
    if (!productList || productList.length === 0) {
      return { insertedCount: 0, skippedDuplicatesCount: 0, duplicateNames: [] };
    }

    // Get current products to check against existing catalog
    const existingProducts = await this.getProducts(true);
    const existingNames = new Set<string>();
    const existingSkus = new Set<string>();

    for (const p of existingProducts) {
      const norm = p.normalizedName || normalizeProductName(p.name);
      if (norm) existingNames.add(norm);
      if (p.sku) existingSkus.add(normalizeSku(p.sku));
    }

    const seenInBatchNames = new Set<string>();
    const seenInBatchSkus = new Set<string>();

    const validToInsert: Product[] = [];
    const duplicateNames: string[] = [];

    const now = new Date().toISOString();

    for (let index = 0; index < productList.length; index++) {
      const prod = productList[index];
      const rawName = prod.name || '';
      const normName = normalizeProductName(rawName);
      const normSku = normalizeSku(prod.sku);

      if (!normName) {
        continue; // Skip invalid row
      }

      // Check if duplicate with existing database OR within this batch
      if (existingNames.has(normName) || seenInBatchNames.has(normName)) {
        duplicateNames.push(rawName.trim());
        continue;
      }

      if (normSku && (existingSkus.has(normSku) || seenInBatchSkus.has(normSku))) {
        duplicateNames.push(`${rawName.trim()} (SKU: ${normSku})`);
        continue;
      }

      seenInBatchNames.add(normName);
      if (normSku) seenInBatchSkus.add(normSku);

      const colRef = collection(db, 'products');
      const docRef = doc(colRef);

      const productData: Product = {
        ...prod,
        id: docRef.id,
        name: rawName.trim(),
        normalizedName: normName,
        sku: normSku || undefined,
        createdAt: prod.createdAt || now,
        updatedAt: now,
        sortOrder: prod.sortOrder ?? (100 + index),
        isDuplicate: false,
      };

      validToInsert.push(productData);
    }

    let totalInserted = 0;
    // Batch limit: 200 operations per batch (saving product + registry entry)
    const BATCH_SIZE = 200;
    for (let i = 0; i < validToInsert.length; i += BATCH_SIZE) {
      const chunk = validToInsert.slice(i, i + BATCH_SIZE);
      const batch = writeBatch(db);

      chunk.forEach((p) => {
        const prodDocRef = doc(db, 'products', p.id);
        batch.set(prodDocRef, sanitizeForFirestore(p));

        // Also register in product_names collection
        if (p.normalizedName) {
          const nameDocRef = doc(db, 'product_names', getSafeRegistryDocId('name', p.normalizedName));
          batch.set(nameDocRef, {
            productId: p.id,
            name: p.name,
            normalizedName: p.normalizedName,
            updatedAt: now,
          });
        }

        // Also register in product_skus collection if SKU exists
        if (p.sku) {
          const skuDocRef = doc(db, 'product_skus', getSafeRegistryDocId('sku', p.sku));
          batch.set(skuDocRef, {
            productId: p.id,
            sku: p.sku,
            updatedAt: now,
          });
        }
      });

      await batch.commit();
      totalInserted += chunk.length;
    }

    // Invalidate products cache
    cache.products = null;
    cache.lastFetched = 0;
    persistCatalog(cache);

    return {
      insertedCount: totalInserted,
      skippedDuplicatesCount: duplicateNames.length,
      duplicateNames,
    };
  }
}

