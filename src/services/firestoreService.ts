import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
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
import { OrderEngine } from './orderEngine';
import { errorService } from './errorService';
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

const PERSISTENT_CATALOG_KEY = 'huma_catalog_persistent_v1';

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
    } catch {
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
    } catch {
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

    try {
      const colRef = collection(db, 'products');
      const q = query(colRef, orderBy('sortOrder', 'asc'), limit(100));
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
    } catch {
      return cache.products || DEFAULT_PRODUCTS;
    }
  }

  public static async saveProduct(product: Partial<Product> & { id?: string }): Promise<string> {
    const colRef = collection(db, 'products');
    const docId = product.id || doc(colRef).id;
    const data = {
      ...product,
      id: docId,
      updatedAt: new Date().toISOString(),
      createdAt: product.createdAt || new Date().toISOString(),
    };
    await setDoc(doc(db, 'products', docId), sanitizeForFirestore(data), { merge: true });
    cache.products = null; // Invalidate
    persistCatalog(cache);
    return docId;
  }

  public static async deleteProduct(id: string): Promise<void> {
    await deleteDoc(doc(db, 'products', id));
    cache.products = null;
    persistCatalog(cache);
  }

  /* =========================================================================
   * 4. MODIFIER GROUPS
   * ========================================================================= */
  public static async getModifierGroups(forceRefresh = false): Promise<ModifierGroup[]> {
    if (!forceRefresh && cache.modifierGroups && Date.now() - cache.lastFetched < CACHE_TTL_MS) {
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
    } catch {
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
    } catch {
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
    } catch {
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
    } catch {
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
    const docRef = doc(db, 'settings', 'general');
    return onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as StoreSettings;
          cache.settings = data;
          callback(data);
        } else {
          callback(DEFAULT_STORE_SETTINGS);
        }
      },
      (error) => {
        console.warn('[HUMA Firestore] subscribeStoreSettings error:', error);
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
    // Idempotency is enforced at the order document itself. A repeated request
    // with the same key targets the same document, so concurrent submissions
    // cannot create two different orders.
    const idempotencyKey = orderInput.idempotencyKey?.trim();
    const orderDocRef = idempotencyKey
      ? doc(db, 'orders', \`idempotent_\${idempotencyKey}\`)
      : doc(collection(db, 'orders'));

    let orderNumber: string;
    try {
      ({ orderNumber } = await this.generateOrderNumber());
    } catch (err) {
      console.warn('[HUMA] Order number generation fallback:', err);
      orderNumber = \`#HF-\${Date.now()}\`;
    }

    const createdAt = new Date().toISOString();
    const canonicalGroups = orderInput.groups && orderInput.groups.length > 0
      ? orderInput.groups.map((group) => OrderEngine.updateGroup(group, {
          categoryId: group.categoryId,
          items: group.items,
          modifiers: group.modifiers,
          note: group.note,
        }))
      : undefined;

    const newOrder: Order = {
      ...orderInput,
      id: orderDocRef.id,
      orderNumber,
      createdAt,
      status: orderInput.status || 'PENDING',
      groups: canonicalGroups,
      items: canonicalGroups && canonicalGroups.length > 0
        ? OrderEngine.flattenGroups(canonicalGroups)
        : orderInput.items,
    };

    const cleanOrder = sanitizeForFirestore(newOrder);

    let created = false;
    let savedOrder: Order;

    try {
      const txResult = await runTransaction(db, async (transaction) => {
        const existingSnap = await transaction.get(orderDocRef);
        if (existingSnap.exists()) {
          return {
            created: false,
            order: { id: existingSnap.id, ...existingSnap.data() } as Order,
          };
        }

        transaction.set(orderDocRef, cleanOrder);
        return { created: true, order: newOrder };
      });

      created = txResult.created;
      savedOrder = txResult.order;
    } catch (orderWriteErr: any) {
      console.error('[HUMA Order] Failed writing orders/' + orderDocRef.id, orderWriteErr);
      const code = orderWriteErr?.code || '';
      const detail = orderWriteErr?.message || 'Unknown Firestore error';
      throw new Error(
        \`Gagal menyimpan pesanan (orders/\${orderDocRef.id}). \${code ? \`[\${code}] \` : ''}\${detail}\`
      );
    }

    // Only new transactions update side effects. Replayed idempotent requests
    // return the already-persisted order without incrementing counters again.
    if (!created) {
      return savedOrder;
    }

    // Daily analytics is intentionally best-effort so a secondary aggregation
    // permission/configuration problem never hides a successfully saved order.
    try {
      const today = createdAt.substring(0, 10);
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
    const updates: Partial<Order> = {
      status: newStatus,
      updatedAt: new Date().toISOString(),
    };
    if (cancellationReason) {
      updates.cancellationReason = cancellationReason;
    }

    await updateDoc(orderRef, sanitizeForFirestore(updates));

    // If order is completed or cancelled, adjust analytics count
    const snap = await getDoc(orderRef);
    if (snap.exists()) {
      const order = snap.data() as Order;
      const today = (order.createdAt || new Date().toISOString()).substring(0, 10);
      const analyticsDocRef = doc(db, 'analyticsDaily', today);

      if (newStatus === 'COMPLETED') {
        await setDoc(analyticsDocRef, { completedOrders: increment(1) }, { merge: true });
        // Award loyalty points to customer
        try {
          const settings = await this.getStoreSettings();
          await this.earnPointsForOrder(order, settings);
        } catch (pointErr) {
          console.warn('[HUMA Loyalty] Error awarding points on completion:', pointErr);
        }
      } else if (newStatus === 'CANCELLED') {
        await setDoc(analyticsDocRef, { cancelledOrders: increment(1) }, { merge: true });
        // Reverse points earned from this order
        try {
          await this.reversePointsForCancelledOrder(order.id, order.orderNumber);
        } catch (revErr) {
          console.warn('[HUMA Loyalty] Error reversing points on cancellation:', revErr);
        }
      }
    }
  }

  /**
   * Real-time selective order listener for Admin/POS monitor (limited to recent 50 orders)
   */
  public static subscribeRecentOrders(callback: (orders: Order[]) => void): Unsubscribe {
    const colRef = collection(db, 'orders');
    const q = query(colRef, orderBy('createdAt', 'desc'), limit(50));

    return onSnapshot(
      q,
      (snapshot) => {
        const orders = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Order));
        callback(orders);
      },
      (error) => {
        errorService.capture(error, { action: 'subscribeRecentOrders' });
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
        callback(customers);
      },
      (error) => {
        errorService.capture(error, { action: 'subscribeCustomers' });
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
        errorService.capture(error, { action: 'subscribeCustomerPointLedger', customerId });
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
          productName: 'Es Teh Manis Jumbo Segar',
          description: 'Tukarkan 50 poin loyalitas untuk 1 cup Es Teh Manis Jumbo Segar.',
          stock: 99,
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

    await setDoc(docRef, sanitizeForFirestore(fullReward), { merge: true });
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
      if (reward.stock !== undefined && reward.stock <= 0) {
        throw new Error('Stok kuota reward telah habis.');
      }

      if ((custData.pointsBalance || 0) < reward.pointsCost) {
        throw new Error(`Poin tidak cukup. Dibutuhkan ${reward.pointsCost} poin, saldo: ${custData.pointsBalance || 0} poin.`);
      }

      const currentBalance = custData.pointsBalance || 0;
      const newBalance = currentBalance - reward.pointsCost;

      txn.update(customerRef, {
        pointsBalance: newBalance,
        updatedAt: now,
      });

      // Decrement reward stock if tracked
      const rewardUpdates: Record<string, any> = {
        redeemCount: (reward.redeemCount || 0) + 1,
      };
      if (reward.stock !== undefined) {
        rewardUpdates.stock = Math.max(0, reward.stock - 1);
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
    if (reward.stock !== undefined && reward.stock <= 0) {
      throw new Error('Kuota stok hadiah ini telah habis.');
    }

    if ((customer.pointsBalance || 0) < reward.pointsCost) {
      throw new Error(
        `Saldo poin Anda (${customer.pointsBalance || 0} poin) tidak mencukupi untuk menukarkan hadiah ini (${reward.pointsCost} poin).`
      );
    }

    // 3. Generate unique redemption code (e.g. RDM-XXXXXX)
    const randomSuffix = Math.floor(100000 + Math.random() * 900000);
    const redemptionCode = `RDM-${randomSuffix}`;
    const redemptionRef = doc(collection(db, 'pointRedemptions'));
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
        throw new Error(`Saldo poin tidak mencukupi saat proses transaksi (${currentBalance} poin).`);
      }

      const newBalance = currentBalance - reward.pointsCost;

      txn.update(customerRef, {
        pointsBalance: newBalance,
        updatedAt: now,
      });

      // Decrement reward stock if tracked
      const rewardUpdates: Record<string, any> = {
        redeemCount: (reward.redeemCount || 0) + 1,
      };
      if (reward.stock !== undefined) {
        rewardUpdates.stock = Math.max(0, reward.stock - 1);
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
        createdAt: now,
        createdBy: 'CUSTOMER_INSTANT',
        status: 'COMPLETED',
      };
      txn.set(redemptionRef, sanitizeForFirestore(redemptionResult));

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
}

