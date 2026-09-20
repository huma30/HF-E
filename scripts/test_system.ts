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
import { OrderEngine } from '../src/services/orderEngine';
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
import { Product, Promo, Order, CartItem, Category } from '../src/types';

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



// 9. ORDER GROUP DOMAIN ENGINE
console.log('\n9. Testing Order Group Domain Engine');
{
  const makeItem = (id: string, name: string, price: number, quantity: number): any => ({
    id: `item-${id}`,
    productId: id,
    name,
    basePrice: price,
    unitPrice: price,
    quantity,
    selectedModifiers: [],
    modifiersPrice: 0,
    subtotal: price * quantity,
  });

  const group1 = OrderEngine.createGroup({
    categoryId: 'gorengan',
    items: [
      makeItem('bakwan', 'Bakwan', 2000, 2),
      makeItem('tahu', 'Tahu', 1500, 2),
      makeItem('tempe', 'Tempe', 1000, 1),
    ],
    modifiers: [{
      modifierId: 'balado',
      name: 'Balado',
      groupId: 'bumbu',
      groupName: 'Bumbu',
      price: 1000,
      quantity: 1,
    }],
  });

  const group2 = OrderEngine.createGroup({
    categoryId: 'gorengan',
    items: [
      makeItem('pisang', 'Pisang', 2500, 2),
      makeItem('cireng', 'Cireng', 1500, 3),
    ],
    modifiers: [{
      modifierId: 'bbq',
      name: 'BBQ',
      groupId: 'bumbu',
      groupName: 'Bumbu',
      price: 1000,
      quantity: 1,
    }],
  });

  assertEqual(group1.subtotal, 9000, 'Group 1 subtotal includes modifier exactly once');
  assertEqual(group2.subtotal, 10500, 'Group 2 subtotal is isolated from Group 1');
  assertEqual(OrderEngine.calculateOrderSubtotal([group1, group2]), 19500, 'Multiple groups sum independently');

  const updatedGroup1 = OrderEngine.updateGroup(group1, {
    modifiers: [{
      modifierId: 'pedas',
      name: 'Pedas',
      groupId: 'bumbu',
      groupName: 'Bumbu',
      price: 500,
      quantity: 1,
    }],
  });
  assert(updatedGroup1.id === group1.id, 'Editing a group keeps the same group id');
  assertEqual(updatedGroup1.subtotal, 8500, 'Editing one group recalculates only that group');

  const afterDelete = OrderEngine.deleteGroup([updatedGroup1, group2], updatedGroup1.id);
  assertEqual(afterDelete.length, 1, 'Deleting a group removes only that group');
  assert(afterDelete[0].id === group2.id, 'Other groups remain intact after deletion');

  const emptyGroup = OrderEngine.createGroup({
    categoryId: 'gorengan',
    items: [],
    modifiers: [],
  });
  assert(!OrderEngine.validateGroup(emptyGroup).valid, 'Empty Order Group is rejected');

  const validationGroup = OrderEngine.createGroup({
    categoryId: 'gorengan',
    items: [makeItem('uji', 'Item Uji', 2000, 1)],
    modifiers: [],
  });

  const requiredCategory = {
    id: 'gorengan',
    name: 'Aneka Gorengan',
    slug: 'gorengan',
    sortOrder: 1,
    isActive: true,
    orderingConfig: {
      groupingEnabled: true,
      modifierEnabled: true,
      modifierScope: 'group',
      modifierRequired: true,
      modifierMinSelection: 1,
      modifierMaxSelection: 2,
    },
  } as Category;

  const optionalCategory = {
    ...requiredCategory,
    orderingConfig: {
      ...requiredCategory.orderingConfig,
      modifierRequired: false,
      modifierMinSelection: 0,
    },
  } as Category;

  assert(
    !OrderEngine.validateGroup(validationGroup, requiredCategory).valid,
    'Order Group wajib bumbu ketika modifierRequired=true'
  );

  assert(
    OrderEngine.validateGroup(validationGroup, optionalCategory).valid,
    'Order Group boleh tanpa bumbu ketika modifierRequired=false'
  );

  const legacyOrder: Order = {
    id: 'legacy-1',
    orderNumber: '#HF-LEGACY',
    createdAt: new Date().toISOString(),
    source: 'WEB',
    status: 'COMPLETED',
    customer: { name: 'Legacy', whatsapp: '-' },
    serviceType: 'TAKEAWAY',
    items: [{
      cartItemId: 'legacy-item',
      productId: 'p1',
      productName: 'Bakwan',
      productImage: '',
      basePrice: 2000,
      unitPrice: 2000,
      quantity: 2,
      selectedModifiers: [],
      modifiersPrice: 0,
      lineTotal: 4000,
      categoryId: 'gorengan',
    }],
    subtotal: 4000,
    discount: 0,
    deliveryFee: 0,
    total: 4000,
    paymentMethod: 'CASH',
    amountPaid: 4000,
    change: 0,
  };
  const normalized = OrderEngine.normalizeOrder(legacyOrder);
  assertEqual(normalized.groups?.length, 1, 'Legacy flat order can be normalized to one group');
  assertEqual(normalized.groups?.[0]?.subtotal, 4000, 'Legacy normalized group keeps original total');

  const groupPromo = {
    id: 'promo-group-mix',
    code: 'GROUPMIX',
    name: 'Group Mix & Match',
    type: 'MIX_MATCH',
    value: 1500,
    minPurchase: 0,
    usedCount: 0,
    isActive: true,
    isMixMatch: true,
    mixMatchMinQty: 2,
    mixMatchBundleQty: 2,
    mixMatchRule: 'FULL_MULTIPLES',
    mixMatchPromoPrice: 1500,
    mixMatchDiscountType: 'FIXED_PRICE',
    mixMatchDiscountValue: 1500,
    mixMatchProductIds: ['bakwan', 'tahu', 'pisang'],
    mixMatchCategoryIds: [],
  } as Promo;

  const groupedPricing = PricingEngine.calculateMixMatchDiscounts(
    OrderEngine.flattenGroups([group1]),
    [groupPromo]
  );
  assertEqual(groupedPricing.discount, 1000, 'Mix & Match applies to eligible products inside Order Group');
  const threeEligible = OrderEngine.createGroup({ categoryId: 'gorengan', items: [makeItem('bakwan', 'Bakwan', 2000, 1), makeItem('tahu', 'Tahu', 1500, 1), makeItem('pisang', 'Pisang', 2500, 1)], modifiers: [] });
  const threeEligiblePricing = PricingEngine.calculateMixMatchDiscounts(OrderEngine.flattenGroups([threeEligible]), [groupPromo]);
  assertEqual(threeEligiblePricing.appliedBundles[0]?.itemsDiscountedCount, 2, '3 eligible items discounts only one complete pair');
  assertEqual(threeEligiblePricing.discount, 500, 'Odd eligible quantity leaves one item at normal price');

  assertEqual(
    groupedPricing.groupDiscounts?.[group1.id],
    1000,
    'Mix & Match discount is synchronized to the Order Group'
  );
  const splitGroupA = OrderEngine.createGroup({
    categoryId: 'gorengan',
    items: [makeItem('bakwan', 'Bakwan', 2000, 1)],
    modifiers: [],
  });
  const splitGroupB = OrderEngine.createGroup({
    categoryId: 'gorengan',
    items: [makeItem('tahu', 'Tahu', 3000, 1)],
    modifiers: [],
  });
  const nonEligibleGroup = OrderEngine.createGroup({
    categoryId: 'gorengan',
    items: [makeItem('cireng', 'Cireng', 4000, 1)],
    modifiers: [],
  });
  const splitAcrossGroups = PricingEngine.calculateMixMatchDiscounts(
    OrderEngine.flattenGroups([splitGroupA, splitGroupB, nonEligibleGroup]),
    [groupPromo]
  );
  assertEqual(splitAcrossGroups.discount, 2000, 'Mix & Match applies across all eligible Order Groups');
  assertEqual(
    (splitAcrossGroups.groupDiscounts?.[splitGroupA.id] || 0) +
      (splitAcrossGroups.groupDiscounts?.[splitGroupB.id] || 0),
    2000,
    'All eligible Order Group allocations sum exactly to the cart discount'
  );
  assertEqual(
    splitAcrossGroups.groupDiscounts?.[splitGroupA.id],
    800,
    'First eligible Order Group receives its allocated Mix & Match discount'
  );
  assertEqual(
    splitAcrossGroups.groupDiscounts?.[splitGroupB.id],
    1200,
    'Second eligible Order Group receives its allocated Mix & Match discount'
  );
  assertEqual(
    splitAcrossGroups.groupDiscounts?.[nonEligibleGroup.id] || 0,
    0,
    'Non-eligible Order Group keeps its normal price'
  );

  const belowMinimumGroup = OrderEngine.createGroup({
    categoryId: 'gorengan',
    items: [makeItem('bakwan', 'Bakwan', 2000, 1)],
    modifiers: [],
  });
  const belowMinimumPricing = PricingEngine.calculateMixMatchDiscounts(
    OrderEngine.flattenGroups([belowMinimumGroup]),
    [groupPromo]
  );
  assertEqual(belowMinimumPricing.discount, 0, 'Mix & Match Order Group stays normal below minimum quantity');
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

console.log('\n======================================================');
console.log(`TEST SUMMARY: ${testsPassed} PASSED, ${testsFailed} FAILED`);
console.log('======================================================\n');

if (testsFailed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
