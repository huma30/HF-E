/**
 * HUMA Anti-Duplicate Product & Data Integrity Engine
 * Production-ready utility for product name normalization, SKU validation,
 * duplicate detection, and safe catalog deduplication.
 */

import { Product, Order } from '../types';

/**
 * Normalizes product name according to master anti-duplicate specification:
 * 1. Trim leading and trailing whitespace
 * 2. Lowercase
 * 3. Collapse multiple whitespace into a single space
 * 4. Clean leading/trailing punctuation while preserving standard culinary modifiers like (pedas) or &
 */
export function normalizeProductName(name: string | null | undefined): string {
  if (!name || typeof name !== 'string') return '';
  return name
    .trim()
    .toLowerCase()
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, '')
    .trim();
}

/**
 * Normalizes SKU:
 * 1. Trim whitespace
 * 2. Uppercase
 * 3. Collapse internal multiple spaces into single dash or space
 */
export function normalizeSku(sku: string | null | undefined): string {
  if (!sku || typeof sku !== 'string') return '';
  return sku
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '-')
    .replace(/[^A-Z0-9_\-\.]/g, '');
}

/**
 * Generates a collision-free, safe Firestore document ID for unique registry documents.
 */
export function getSafeRegistryDocId(type: 'name' | 'sku', value: string): string {
  const sanitized = encodeURIComponent(value).replace(/%/g, '_').slice(0, 150);
  return `${type}_${sanitized}`;
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  duplicateType?: 'NAME' | 'SKU';
  existingProduct?: Product;
  message?: string;
}

/**
 * Client & business-logic duplicate detection against existing active products.
 * Guarantees self-exclusion when updating an existing product (id === candidate.id).
 */
export function checkProductDuplicate(
  candidate: { name: string; sku?: string; id?: string },
  existingProducts: Product[]
): DuplicateCheckResult {
  const normName = normalizeProductName(candidate.name);
  const normSku = normalizeSku(candidate.sku);

  if (!normName) {
    return { isDuplicate: false };
  }

  for (const existing of existingProducts) {
    // Self-exclusion rule: a product is never duplicate of itself
    if (candidate.id && existing.id === candidate.id) {
      continue;
    }

    // Name check
    const existingNormName = existing.normalizedName || normalizeProductName(existing.name);
    if (existingNormName === normName) {
      return {
        isDuplicate: true,
        duplicateType: 'NAME',
        existingProduct: existing,
        message: `Produk dengan nama '${existing.name}' sudah tersedia. Silakan gunakan produk yang sudah ada atau ubah nama produk.`,
      };
    }

    // SKU check (if candidate has an SKU)
    if (normSku && existing.sku) {
      const existingNormSku = normalizeSku(existing.sku);
      if (existingNormSku === normSku) {
        return {
          isDuplicate: true,
          duplicateType: 'SKU',
          existingProduct: existing,
          message: `SKU '${normSku}' sudah digunakan oleh produk '${existing.name}'.`,
        };
      }
    }
  }

  return { isDuplicate: false };
}

export interface DuplicateGroup {
  normalizedKey: string;
  normalizedName: string;
  type: 'NAME' | 'SKU';
  canonicalProduct: Product;
  canonical: Product;
  duplicates: Product[];
  items: Product[];
  referencedInOrdersCount: number;
}

export interface CatalogAuditResult {
  totalScanned: number;
  duplicateGroupsCount: number;
  duplicateCount: number;
  activeDuplicatesFound: number;
  duplicateGroups: DuplicateGroup[];
  groups: DuplicateGroup[];
  allDuplicateProductIds: string[];
  duplicateProductIds: string[];
  canonicalMapping: Record<string, string>;
}

/**
 * Audit existing catalog for duplicate products without destroying historical transaction integrity.
 * Identifies duplicate clusters, selects canonical products, and identifies order references.
 */
export function auditCatalogDuplicates(products: Product[], orders: Order[] = []): CatalogAuditResult {
  const referencedProductIds = new Set<string>();
  for (const o of orders) {
    for (const it of o.items || []) {
      if (it.productId) {
        referencedProductIds.add(it.productId);
      }
    }
  }

  const nameMap = new Map<string, Product[]>();

  for (const p of products) {
    const norm = p.normalizedName || normalizeProductName(p.name);
    if (!norm) continue;
    const list = nameMap.get(norm) || [];
    list.push(p);
    nameMap.set(norm, list);
  }

  const duplicateGroups: DuplicateGroup[] = [];
  const allDuplicateProductIds: string[] = [];
  const canonicalMapping: Record<string, string> = {};
  let activeDuplicatesCount = 0;

  for (const [normKey, group] of nameMap.entries()) {
    if (group.length <= 1) continue;

    // Pick canonical: prefer active with image & older creation date
    const sorted = [...group].sort((a, b) => {
      // 1. Active preference
      if (a.isActive && !b.isActive) return -1;
      if (!a.isActive && b.isActive) return 1;

      // 2. Data completeness (has image, description)
      const aScore = (a.imageUrl ? 2 : 0) + (a.description ? 1 : 0) + (a.wholesaleRules?.length || 0);
      const bScore = (b.imageUrl ? 2 : 0) + (b.description ? 1 : 0) + (b.wholesaleRules?.length || 0);
      if (aScore !== bScore) return bScore - aScore;

      // 3. Oldest creation date
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return aTime - bTime;
    });

    const canonical = sorted[0];
    const duplicates = sorted.slice(1);

    let referencedCount = 0;
    for (const dup of duplicates) {
      allDuplicateProductIds.push(dup.id);
      canonicalMapping[dup.id] = canonical.id;
      if (dup.isActive) activeDuplicatesCount++;
      if (referencedProductIds.has(dup.id)) referencedCount++;
    }

    duplicateGroups.push({
      normalizedKey: normKey,
      normalizedName: normKey,
      type: 'NAME',
      canonicalProduct: canonical,
      canonical,
      duplicates,
      items: group,
      referencedInOrdersCount: referencedCount,
    });
  }

  return {
    totalScanned: products.length,
    duplicateGroupsCount: duplicateGroups.length,
    duplicateCount: allDuplicateProductIds.length,
    activeDuplicatesFound: activeDuplicatesCount,
    duplicateGroups,
    groups: duplicateGroups,
    allDuplicateProductIds,
    duplicateProductIds: allDuplicateProductIds,
    canonicalMapping,
  };
}
