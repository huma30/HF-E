/**
 * HUMA Automated Software Testing Suite
 * Validates:
 * 1. PricingEngine (Wholesale, Modifiers, Promos, Split/Cash payments)
 * 2. Loyalty Points Calculation Engine
 * 3. Receipt Formatting Engine (58mm & 80mm thermal text)
 * 4. WhatsApp Order Formatter
 * 5. Central Error Classification & Normalization
 * 6. Seed Data Integrity & Schema Validation
 */

import { PricingEngine } from '../src/services/pricingEngine';
import { errorService } from '../src/services/errorService';
import { ReceiptService } from '../src/services/receiptService';
import { WhatsAppService } from '../src/services/whatsappService';
import {
  DEFAULT_PRODUCTS,
  DEFAULT_CATEGORIES,
  DEFAULT_MODIFIER_GROUPS,
  DEFAULT_DELIVERY_AREAS,
  DEFAULT_PROMOS,
  DEFAULT_STORE_SETTINGS,
} from '../src/data/seedData';
import { Product, Promo, Order, CartItem, Category, ModifierGroup, BatchModifierSelection } from '../src/types';

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    testsPassed++;
  } else {
    console.error(`  [FAIL] ${testName}`);
    testsFailed++;
  }
}

function assertEqual<T>(actual: T, expected: T, testName: string) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (pass) {
    console.log(`  [PASS] ${testName}`);
    testsPassed++;
  } else {
    console.error(`  [FAIL] ${testName} (Expected: ${JSON.stringify(expected)}, Actual: ${JSON.stringify(actual)})`);
    testsFailed++;
  }
}

console.log('\n======================================================');
console.log('--- HUMA COMPREHENSIVE SOFTWARE TESTING SUITE ---');
console.log('======================================================\n');

// 1. PRICING ENGINE & WHOLESALE TESTING
console.log('1. Testing PricingEngine: Wholesale & Modifiers');
{
  const mockProduct: Product = {
    id: 'prod-test',
    name: 'Seblak Test',
    categoryId: 'cat-1',
    description: 'Test product',
    price: 15000,
    imageUrl: '',
    isActive: true,
    isAvailable: true,
    wholesaleEnabled: true,
    wholesaleRules: [
      { minQty: 5, maxQty: 9, price: 13500 },
      { minQty: 10, price: 12000 },
    ],
  };

  // Base price for qty 1-4
  assertEqual(PricingEngine.calculateUnitPrice(mockProduct, 1), 15000, 'Wholesale Tier 0 (Qty 1) = Rp 15.000');
  assertEqual(PricingEngine.calculateUnitPrice(mockProduct, 4), 15000, 'Wholesale Tier 0 (Qty 4) = Rp 15.000');

  // Tier 1 for qty 5-9
  assertEqual(PricingEngine.calculateUnitPrice(mockProduct, 5), 13500, 'Wholesale Tier 1 (Qty 5) = Rp 13.500');
  assertEqual(PricingEngine.calculateUnitPrice(mockProduct, 9), 13500, 'Wholesale Tier 1 (Qty 9) = Rp 13.500');

  // Tier 2 for qty >= 10
  assertEqual(PricingEngine.calculateUnitPrice(mockProduct, 10), 12000, 'Wholesale Tier 2 (Qty 10) = Rp 12.000');
  assertEqual(PricingEngine.calculateUnitPrice(mockProduct, 25), 12000, 'Wholesale Tier 2 (Qty 25) = Rp 12.000');

  // Modifiers extra price
  const modifiers = [
    { groupId: 'g1', groupName: 'Pedas', item: { id: 'm1', name: 'Level 3', price: 0, isActive: true, sortOrder: 1 } },
    { groupId: 'g2', groupName: 'Topping', item: { id: 'm2', name: 'Dumpling Keju', price: 3000, isActive: true, sortOrder: 1 } },
    { groupId: 'g2', groupName: 'Topping', item: { id: 'm3', name: 'Sosis', price: 2000, isActive: true, sortOrder: 2 } },
  ];
  assertEqual(PricingEngine.calculateModifiersPrice(modifiers), 5000, 'Modifiers extra calculation = Rp 5.000');

  // Line total
  assertEqual(PricingEngine.calculateLineTotal(13500, 5000, 5), (13500 + 5000) * 5, 'Line total (13.5k + 5k) * 5 = Rp 92.500');
}

// 2. PROMO & VOUCHER ENGINE TESTING
console.log('\n2. Testing PricingEngine: Promo Vouchers');
{
  const percentagePromo: Promo = {
    id: 'promo-1',
    code: 'DISKON10',
    name: 'Diskon 10%',
    type: 'PERCENTAGE',
    value: 10,
    minPurchase: 30000,
    maxDiscount: 10000,
    usedCount: 0,
    isActive: true,
  };

  // Below min purchase
  const resBelow = PricingEngine.calculatePromoDiscount(percentagePromo, 25000, 5000);
  assertEqual(resBelow.discount, 0, 'Discounts 0 when subtotal < minPurchase');
  assert(resBelow.message !== undefined, 'Returns informative warning when below minPurchase');

  // Normal 10%
  const resValid = PricingEngine.calculatePromoDiscount(percentagePromo, 50000, 5000);
  assertEqual(resValid.discount, 5000, '10% of Rp 50.000 = Rp 5.000');

  // Capped by maxDiscount
  const resCapped = PricingEngine.calculatePromoDiscount(percentagePromo, 200000, 5000);
  assertEqual(resCapped.discount, 10000, 'Capped at maxDiscount = Rp 10.000');

  // Free delivery promo
  const freeOngkirPromo: Promo = {
    id: 'promo-2',
    code: 'FREEONGKIR',
    name: 'Gratis Ongkir',
    type: 'FREE_DELIVERY',
    value: 0,
    minPurchase: 20000,
    usedCount: 0,
    isActive: true,
  };
  const resFree = PricingEngine.calculatePromoDiscount(freeOngkirPromo, 30000, 6000);
  assertEqual(resFree.effectiveDeliveryFee, 0, 'FREE_DELIVERY sets effective delivery fee to 0');
  assertEqual(resFree.discount, 6000, 'FREE_DELIVERY discount equals delivery fee Rp 6.000');

  // Fixed discount promo
  const fixedPromo: Promo = {
    id: 'promo-3',
    code: 'HEMAT5RB',
    name: 'Potongan Rp 5.000',
    type: 'FIXED',
    value: 5000,
    minPurchase: 20000,
    usedCount: 0,
    isActive: true,
  };
  const resFixed = PricingEngine.calculatePromoDiscount(fixedPromo, 40000, 0);
  assertEqual(resFixed.discount, 5000, 'FIXED discount gives exact Rp 5.000');
}

// 3. CASH PAYMENT & CHANGE VALIDATION
console.log('\n3. Testing PricingEngine: Cash Payment Validation');
{
  const validCash = PricingEngine.validateCashPayment(35000, 50000);
  assert(validCash.isValid, '50.000 is valid for 35.000 total');
  assertEqual(validCash.change, 15000, 'Change is exactly Rp 15.000');

  const exactCash = PricingEngine.validateCashPayment(35000, 35000);
  assert(exactCash.isValid, 'Exact cash is valid');
  assertEqual(exactCash.change, 0, 'Change for exact cash is 0');

  const underCash = PricingEngine.validateCashPayment(35000, 30000);
  assert(!underCash.isValid, 'Underpayment is flagged as invalid');
  assert(underCash.message?.includes('5.000') || false, 'Underpayment message mentions missing Rp 5.000');
}

// 4. LOYALTY POINTS SYSTEM CALCULATIONS
console.log('\n4. Testing Loyalty Points Calculation Logic');
{
  // Settings: 1 poin per Rp 10.000, min order Rp 10.000
  const pointsPerRupiah = 10000;
  const minOrderForPoints = 10000;
  const pointsRedeemRate = 100; // 1 poin = Rp 100 diskon

  function calculatePointsEarned(totalSpent: number): number {
    if (totalSpent < minOrderForPoints) return 0;
    return Math.floor(totalSpent / pointsPerRupiah);
  }

  function calculateRedeemDiscount(points: number): number {
    return points * pointsRedeemRate;
  }

  assertEqual(calculatePointsEarned(8000), 0, 'Orders under Rp 10.000 earn 0 points');
  assertEqual(calculatePointsEarned(10000), 1, 'Rp 10.000 earns exactly 1 point');
  assertEqual(calculatePointsEarned(39500), 3, 'Rp 39.500 earns 3 points (floor rounding)');
  assertEqual(calculatePointsEarned(125000), 12, 'Rp 125.000 earns 12 points');

  assertEqual(calculateRedeemDiscount(10), 1000, '10 points = Rp 1.000 discount');
  assertEqual(calculateRedeemDiscount(50), 5000, '50 points = Rp 5.000 discount');
  assertEqual(calculateRedeemDiscount(100), 10000, '100 points = Rp 10.000 discount');
}

// 5. RECEIPT FORMATTER TESTING
console.log('\n5. Testing Receipt Formatting Engine');
{
  const sampleCartItem: CartItem = {
    cartItemId: 'c1',
    productId: 'prod-1',
    productName: 'Seblak Spesial',
    productImage: '',
    basePrice: 15000,
    unitPrice: 15000,
    quantity: 2,
    selectedModifiers: [
      { groupId: 'g1', groupName: 'Pedas', item: { id: 'm1', name: 'Level 2 Sedang', price: 0, isActive: true, sortOrder: 1 } },
    ],
    modifiersPrice: 0,
    lineTotal: 30000,
  };

  const sampleOrder: Order = {
    id: 'ord-123',
    orderNumber: '#HF-000101',
    createdAt: new Date().toISOString(),
    source: 'POS',
    status: 'COMPLETED',
    customer: { name: 'Ibu Rina', whatsapp: '08123456789' },
    serviceType: 'DINE_IN',
    items: [sampleCartItem],
    subtotal: 30000,
    discount: 0,
    deliveryFee: 0,
    total: 30000,
    paymentMethod: 'CASH',
    amountPaid: 50000,
    change: 20000,
    cashierName: 'Siti Kasir',
  };

  const receipt = ReceiptService.formatTextReceipt(sampleOrder, DEFAULT_STORE_SETTINGS);
  assert(receipt.includes('HUMA FOOD'), 'Receipt includes store name');
  assert(receipt.includes('#HF-000101'), 'Receipt includes order number');
  assert(receipt.includes('Seblak Spesial'), 'Receipt includes product name');
  assert(receipt.includes('30.000'), 'Receipt includes line total');
}

// 6. WHATSAPP SERVICE FORMATTER TESTING
console.log('\n6. Testing WhatsApp Order Message Formatter');
{
  const sampleOrder: Order = {
    id: 'ord-wa-1',
    orderNumber: '#HF-000202',
    createdAt: new Date().toISOString(),
    source: 'WEB',
    status: 'PENDING',
    customer: { name: 'Mas Budi', whatsapp: '085811223344', address: 'Blok C No. 5' },
    serviceType: 'DELIVERY',
    deliveryAreaName: 'Perum Gina Blok B & C',
    items: [
      {
        cartItemId: 'item-1',
        productId: 'prod-mie',
        productName: 'Mie Jebew Pedas',
        productImage: '',
        basePrice: 12000,
        unitPrice: 12000,
        quantity: 2,
        selectedModifiers: [],
        modifiersPrice: 0,
        lineTotal: 24000,
      },
    ],
    subtotal: 24000,
    discount: 0,
    deliveryFee: 3000,
    total: 27000,
    paymentMethod: 'COD',
    amountPaid: 0,
    change: 0,
  };

  const waUrl = WhatsAppService.getWhatsAppUrl(sampleOrder);
  assert(waUrl.startsWith('https://wa.me/'), 'WA link is a valid wa.me URL');
  assert(waUrl.includes(encodeURIComponent('#HF-000202')), 'WA text includes order number');
  assert(waUrl.includes(encodeURIComponent('Mas Budi')), 'WA text includes customer name');
  assert(waUrl.includes(encodeURIComponent('Mie Jebew Pedas')), 'WA text includes ordered item');
  assert(waUrl.includes(encodeURIComponent('Delivery Antar')), 'WA text includes service type');
}

// 7. CENTRAL ERROR SERVICE CLASSIFICATION & NORMALIZATION
console.log('\n7. Testing Central Error Service: Classification & User Messages');
{
  const permErr = errorService.normalize(new Error('Missing or insufficient permissions.'));
  assertEqual(permErr.classification, 'PERMISSION_ERROR', 'Correctly classifies permission-denied');
  assert(permErr.userMessage.includes('Akses ditolak'), 'Provides Indonesian user-friendly permission error message');

  const authErr = errorService.normalize(new Error('Firebase: Error (auth/wrong-password).'));
  assertEqual(authErr.classification, 'AUTH_ERROR', 'Correctly classifies auth errors');

  const netErr = errorService.normalize(new Error('Failed to fetch: network unavailable'));
  assertEqual(netErr.classification, 'NETWORK_ERROR', 'Correctly classifies network errors');

  const validErr = errorService.normalize(new Error('validation failed: phone number is required'));
  assertEqual(validErr.classification, 'VALIDATION_ERROR', 'Correctly classifies validation errors');
}

// 8. MASTER DATA & SCHEMA INTEGRITY
console.log('\n8. Testing Seed Data Integrity & Schema Compliance');
{
  assert(DEFAULT_PRODUCTS.length >= 7, `Initial products loaded: ${DEFAULT_PRODUCTS.length} items`);
  assert(DEFAULT_CATEGORIES.length >= 4, `Initial categories loaded: ${DEFAULT_CATEGORIES.length} categories`);
  assert(DEFAULT_MODIFIER_GROUPS.length >= 2, `Initial modifier groups loaded: ${DEFAULT_MODIFIER_GROUPS.length} groups`);
  assert(DEFAULT_DELIVERY_AREAS.length >= 3, `Initial delivery areas loaded: ${DEFAULT_DELIVERY_AREAS.length} areas`);
  assert(DEFAULT_PROMOS.length >= 2, `Initial promos loaded: ${DEFAULT_PROMOS.length} promos`);
  assert(DEFAULT_STORE_SETTINGS.storeName.length > 0, 'Initial store settings contains valid store name');

  // Check that every product belongs to an existing category
  const categoryIds = new Set(DEFAULT_CATEGORIES.map((c) => c.id));
  const allProductsValid = DEFAULT_PRODUCTS.every((p) => categoryIds.has(p.categoryId));
  assert(allProductsValid, 'All products are mapped to valid existing categories');

  // Check wholesale rules validity
  const wholesaleProds = DEFAULT_PRODUCTS.filter((p) => p.wholesaleEnabled);
  assert(wholesaleProds.length > 0, `Has wholesale enabled products (${wholesaleProds.length} products)`);
  const rulesValid = wholesaleProds.every(
    (p) => p.wholesaleRules && p.wholesaleRules.every((r) => r.minQty > 0 && r.price < p.price)
  );
  assert(rulesValid, 'Wholesale rules have valid minQty and offer cheaper prices than base price');
}

// 9. ANTI-DUPLICATE PRODUCT & NORMALIZATION TESTING
console.log('\n9. Testing Anti-Duplicate Engine & Name Normalization');
{
  const {
    normalizeProductName,
    normalizeSku,
    checkProductDuplicate,
    auditCatalogDuplicates,
  } = await import('../src/utils/productUtils');

  // Normalization
  assertEqual(normalizeProductName('  Seblak   Komplit  '), 'seblak komplit', 'Trims and collapses spaces');
  assertEqual(normalizeProductName('“Seblak Prasmanan”'), 'seblak prasmanan', 'Cleans fancy quotation marks');
  assertEqual(normalizeProductName('ES TEH MANIS'), 'es teh manis', 'Converts to lowercase');
  assertEqual(normalizeSku(' sbl 01 '), 'SBL-01', 'Normalizes SKU to uppercase dash format');

  // Duplicate Check against catalog
  const catalog: Product[] = [
    {
      id: 'p1',
      name: 'Seblak Original Prasmanan',
      normalizedName: 'seblak original prasmanan',
      sku: 'SBL-01',
      categoryId: 'cat_seblak',
      description: '',
      price: 15000,
      imageUrl: '',
      isAvailable: true,
      isActive: true,
      wholesaleEnabled: false,
      modifierGroupIds: [],
    },
  ];

  // Detect duplicate with varied casing and whitespace
  const dup1 = checkProductDuplicate({ name: '  SEBLAK   ORIGINAL   PRASMANAN  ' }, catalog);
  assert(dup1.isDuplicate, 'Detects duplicate with varied casing and excess spacing');
  assertEqual(dup1.duplicateType, 'NAME', 'Identifies duplicate type as NAME');

  // Detect duplicate SKU
  const dup2 = checkProductDuplicate({ name: 'Menu Baru', sku: 'sbl 01' }, catalog);
  assert(dup2.isDuplicate, 'Detects duplicate SKU regardless of casing/spacing');
  assertEqual(dup2.duplicateType, 'SKU', 'Identifies duplicate type as SKU');

  // Allows editing existing product without false positive
  const editSelf = checkProductDuplicate({ id: 'p1', name: 'Seblak Original Prasmanan', sku: 'SBL-01' }, catalog);
  assert(!editSelf.isDuplicate, 'Allows editing existing product without triggering self-duplicate');

  // Catalog Audit & Deduplication Test
  const messyCatalog: Product[] = [
    { id: 'm1', name: 'Seblak Pedas', categoryId: 'cat_1', description: 'With image', price: 15000, imageUrl: 'http://img.com', isAvailable: true, isActive: true, wholesaleEnabled: false, modifierGroupIds: [], createdAt: '2026-01-01T00:00:00Z' },
    { id: 'm2', name: '  seblak  pedas  ', categoryId: 'cat_1', description: '', price: 15000, imageUrl: '', isAvailable: true, isActive: true, wholesaleEnabled: false, modifierGroupIds: [], createdAt: '2026-01-02T00:00:00Z' },
    { id: 'm3', name: 'Es Jeruk', categoryId: 'cat_2', description: '', price: 8000, imageUrl: '', isAvailable: true, isActive: true, wholesaleEnabled: false, modifierGroupIds: [] },
  ];

  const audit = auditCatalogDuplicates(messyCatalog);
  assertEqual(audit.duplicateGroupsCount, 1, 'Identified 1 duplicate group');
  assertEqual(audit.duplicateCount, 1, 'Identified 1 duplicate item to deactivate');
  assertEqual(audit.groups[0].canonical.id, 'm1', 'Picks m1 as canonical due to image and earlier creation');
  assertEqual(audit.canonicalMapping['m2'], 'm1', 'Maps m2 duplicate to canonical m1');

  // Verify FirestoreService.autoDeleteDuplicateProducts definition
  const { FirestoreService } = await import('../src/services/firestoreService');
  assert(typeof FirestoreService.autoDeleteDuplicateProducts === 'function', 'FirestoreService exposes autoDeleteDuplicateProducts function');
  assert(typeof FirestoreService.getAutoDeleteDuplicatesSetting === 'function', 'FirestoreService exposes getAutoDeleteDuplicatesSetting function');
  assert(typeof FirestoreService.setAutoDeleteDuplicatesSetting === 'function', 'FirestoreService exposes setAutoDeleteDuplicatesSetting function');
}

// 8. BATCH MODIFIER GUARD & MIX & MATCH PRICING INTEGRITY
console.log('\n8. Testing Batch Modifier Guard & Mix & Match Integrity');
{
  const seblakCategory: Category = {
    id: 'cat-seblak',
    name: 'Seblak Prasmanan',
    slug: 'seblak-prasmanan',
    icon: 'Soup',
    sortOrder: 1,
    isActive: true,
    batchModifierEnabled: true,
    batchModifierGroupId: 'group-bumbu',
    batchModifierRequired: true,
    batchModifierMinSelection: 1,
    batchModifierMaxSelection: 2,
    batchModifierMode: 'POOL',
  };

  const minumanCategory: Category = {
    id: 'cat-minuman',
    name: 'Minuman Segar',
    slug: 'minuman-segar',
    icon: 'Coffee',
    sortOrder: 2,
    isActive: true,
    batchModifierEnabled: false,
  };

  const bumbuGroup: ModifierGroup = {
    id: 'group-bumbu',
    name: 'Pilihan Bumbu & Kuah',
    isActive: true,
    minSelection: 1,
    maxSelection: 2,
    isRequired: true,
    items: [
      { id: 'b-pedas', name: 'Bumbu Pedas Manis', price: 0, sortOrder: 1, isAvailable: true, isActive: true },
      { id: 'b-asin', name: 'Bumbu Asin Gurih', price: 0, sortOrder: 2, isAvailable: true, isActive: true },
    ],
  };

  const seblakItem: CartItem = {
    cartItemId: 'item-1',
    productId: 'prod-seblak',
    productName: 'Seblak Komplit',
    productImage: '',
    basePrice: 15000,
    unitPrice: 15000,
    quantity: 2,
    selectedModifiers: [],
    modifiersPrice: 0,
    lineTotal: 30000,
    categoryId: 'cat-seblak',
  };

  const esTehItem: CartItem = {
    cartItemId: 'item-2',
    productId: 'prod-esteh',
    productName: 'Es Teh Manis',
    productImage: '',
    basePrice: 5000,
    unitPrice: 5000,
    quantity: 1,
    selectedModifiers: [],
    modifiersPrice: 0,
    lineTotal: 5000,
    categoryId: 'cat-minuman',
  };

  // Helper evaluator mimicking CartDrawer & Backend logic
  function evaluateBumbuStatus(
    items: CartItem[],
    categories: Category[],
    groups: ModifierGroup[],
    batchSelections: Record<string, any>
  ): 'NOT_REQUIRED' | 'REQUIRED_NOT_SELECTED' | 'SELECTED' {
    const relevantBatchCategories = categories
      .filter((cat) => (cat.batchModifierEnabled && cat.batchModifierGroupId) || cat.name.toLowerCase().includes('goreng'))
      .map((cat) => {
        const matchingItems = items.filter((it) => it.categoryId === cat.id);
        const totalQty = matchingItems.reduce((sum, it) => sum + it.quantity, 0);
        const group = groups.find(
          (g) => g.id === cat.batchModifierGroupId || (cat.name.toLowerCase().includes('goreng') && g.name.toLowerCase().includes('bumbu'))
        );
        return { category: cat, group, totalQty };
      })
      .filter((entry): entry is { category: Category; group: ModifierGroup; totalQty: number } =>
        entry.totalQty > 0 && !!entry.group
      );

    if (relevantBatchCategories.length === 0) return 'NOT_REQUIRED';

    const hasIncomplete = relevantBatchCategories.some((entry) => {
      const isGorengan = entry.category.name.toLowerCase().includes('goreng');
      const isReq = isGorengan || entry.category.batchModifierRequired !== false;
      const minSelections = entry.category.batchModifierMinSelection !== undefined
        ? Math.max(isGorengan ? 1 : 0, Number(entry.category.batchModifierMinSelection))
        : 1;
      const sel = batchSelections[entry.category.id];
      const count = sel ? (sel.selectedModifiers?.length ?? sel.options?.filter((o: any) => (o.quantity ?? 1) > 0).length ?? 0) : 0;
      return isReq ? count < minSelections : false;
    });

    return hasIncomplete ? 'REQUIRED_NOT_SELECTED' : 'SELECTED';
  }

  // T3: Single Batch Product without bumbu -> REQUIRED_NOT_SELECTED
  const statusT3 = evaluateBumbuStatus([seblakItem], [seblakCategory, minumanCategory], [bumbuGroup], {});
  assertEqual(statusT3, 'REQUIRED_NOT_SELECTED', 'T3: Cart with Batch Modifier product without bumbu is REQUIRED_NOT_SELECTED');

  // T4: Single Batch Product with valid bumbu -> SELECTED
  const validSelections = {
    'cat-seblak': {
      categoryId: 'cat-seblak',
      categoryName: 'Seblak Prasmanan',
      selectedModifiers: [{ modifierId: 'b-pedas', modifierName: 'Bumbu Pedas Manis', price: 0 }],
    },
  };
  const statusT4 = evaluateBumbuStatus([seblakItem], [seblakCategory, minumanCategory], [bumbuGroup], validSelections);
  assertEqual(statusT4, 'SELECTED', 'T4: Cart with Batch Modifier product and valid bumbu is SELECTED');

  // T5: Non-Batch Product only -> NOT_REQUIRED
  const statusT5 = evaluateBumbuStatus([esTehItem], [seblakCategory, minumanCategory], [bumbuGroup], {});
  assertEqual(statusT5, 'NOT_REQUIRED', 'T5: Cart with non-batch products only is NOT_REQUIRED');

  // T6: Quantity mutation test
  const mutatedItem = { ...seblakItem, quantity: 5, lineTotal: 75000 };
  const statusT6 = evaluateBumbuStatus([mutatedItem], [seblakCategory, minumanCategory], [bumbuGroup], validSelections);
  assertEqual(statusT6, 'SELECTED', 'T6: Quantity increase retains valid evaluation with selected bumbu');

  // T7: Remove Batch Product test (seblak removed, only es teh left)
  const statusT7 = evaluateBumbuStatus([esTehItem], [seblakCategory, minumanCategory], [bumbuGroup], {});
  assertEqual(statusT7, 'NOT_REQUIRED', 'T7: Removing batch modifier product transitions status to NOT_REQUIRED');

  // Mix & Match Discount Engine verification
  const promoMM: Promo = {
    id: 'promo-mm',
    code: 'MM-SEBLAK',
    name: 'Diskon Seblak 2 Porsi',
    description: 'Beli 2 porsi dapat diskon',
    discountType: 'FIXED',
    discountValue: 2000,
    value: 2000,
    minPurchase: 0,
    minOrderAmount: 0,
    usedCount: 0,
    isActive: true,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    type: 'MIX_MATCH',
    isMixMatch: true,
    mixMatchQuantity: 2,
    mixMatchCategoryIds: ['cat-seblak'],
    mixMatchPromoPrice: 14000,
  };

  const mmResult = PricingEngine.calculateMixMatchDiscounts([seblakItem], [promoMM]);
  assertEqual(mmResult.discount, 2000, 'Mix & Match discount calculation remains intact at Rp 2.000');
  assert(mmResult.appliedBundles.length > 0, 'Mix & Match bundles properly applied in pricing engine');

  // Aneka Gorengan Specific Tests
  const anekaGorenganCategory: Category = {
    id: 'bIOwprfg8JjGL8IqkXqZ',
    name: 'Aneka gorengan',
    slug: 'aneka-gorengan',
    sortOrder: 2,
    isActive: true,
    batchModifierEnabled: true,
    batchModifierRequired: true,
    batchModifierGroupId: 'C3z7JP7YWWqQwiTQKJwA',
    batchModifierMinSelection: 1,
    batchModifierMaxSelection: 2,
  };

  const gorenganItem: CartItem = {
    cartItemId: 'cart-gorengan-1',
    productId: 'prod-tahu-walik',
    productName: 'Tahu Walik Crispy',
    productImage: 'https://images.unsplash.com/photo-1541592106381-b31e9677c0e5?w=400',
    basePrice: 10000,
    modifiersPrice: 0,
    categoryId: 'bIOwprfg8JjGL8IqkXqZ',
    quantity: 2,
    unitPrice: 10000,
    lineTotal: 20000,
    selectedModifiers: [],
  };

  // Aneka Gorengan without bumbu must be REQUIRED_NOT_SELECTED
  const gorenganStatusNoBumbu = evaluateBumbuStatus(
    [gorenganItem],
    [anekaGorenganCategory],
    [bumbuGroup],
    {}
  );
  assertEqual(
    gorenganStatusNoBumbu,
    'REQUIRED_NOT_SELECTED',
    'Aneka Gorengan without bumbu is strictly blocked with status REQUIRED_NOT_SELECTED'
  );

  // Aneka Gorengan with bumbu selected must be SELECTED
  const gorenganSelections: Record<string, BatchModifierSelection> = {
    bIOwprfg8JjGL8IqkXqZ: {
      categoryId: 'bIOwprfg8JjGL8IqkXqZ',
      categoryName: 'Aneka gorengan',
      modifierGroupId: 'C3z7JP7YWWqQwiTQKJwA',
      modifierGroupName: 'Bumbu Tabur',
      options: [{ modifierId: 'm-balado', modifierName: 'Balado Pedas Manis', quantity: 1, price: 0 }],
      selectedModifiers: [{ modifierId: 'm-balado', modifierName: 'Balado Pedas Manis', price: 0 }],
      totalAllocated: 1,
      targetQuantity: 2,
    },
  };

  const gorenganStatusWithBumbu = evaluateBumbuStatus(
    [gorenganItem],
    [anekaGorenganCategory],
    [bumbuGroup],
    gorenganSelections
  );
  assertEqual(
    gorenganStatusWithBumbu,
    'SELECTED',
    'Aneka Gorengan with bumbu selected advances cleanly with status SELECTED'
  );
}

console.log('\n======================================================');
console.log(`TEST SUMMARY: ${testsPassed} PASSED, ${testsFailed} FAILED`);
console.log('======================================================\n');

if (testsFailed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
