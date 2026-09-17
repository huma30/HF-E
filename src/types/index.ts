/**
 * HUMA F&B Commerce & POS System - Data Types & Models
 * Production-ready TypeScript definitions
 */

export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'CASHIER';

export type StoreStatusType = 'OPEN' | 'CLOSED' | 'TEMPORARILY_CLOSED' | 'FORCE_OPEN' | 'FORCE_CLOSED';

export type ServiceType = 'DELIVERY' | 'TAKEAWAY' | 'DINE_IN';

export type PaymentMethod = 'CASH' | 'COD' | 'QRIS' | 'BANK_TRANSFER' | 'MULTI';

export type OrderStatus = 
  | 'PENDING' 
  | 'CONFIRMED' 
  | 'PREPARING' 
  | 'READY' 
  | 'OUT_FOR_DELIVERY' 
  | 'COMPLETED' 
  | 'CANCELLED' 
  | 'REFUNDED';

export interface AdminUser {
  uid: string;
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

export interface OperatingHours {
  open: string; // e.g. "09:00"
  close: string; // e.g. "21:00"
  days: number[]; // [0, 1, 2, 3, 4, 5, 6] (0 = Sunday)
}

export interface StoreSettings {
  storeName: string;
  tagline: string;
  address: string;
  whatsapp: string;
  logoUrl?: string;
  receiptLogoUrl?: string;
  qrisImageUrl?: string;
  barcodeImageUrl?: string;
  googleMapsUrl?: string;
  googleReviewUrl?: string;
  isGoogleReviewEnabled?: boolean;
  isGoFoodEnabled?: boolean;
  goFoodUrl?: string;
  goFoodLabel?: string;
  operatingHours: OperatingHours;
  manualStatusOverride?: StoreStatusType | 'AUTO';
  isOrderingEnabled: boolean;
  minOrderAmount: number;
  autoCutEnabled?: boolean;
  paperWidth?: '58mm' | '80mm';
  // Payment Settings
  isCodEnabled?: boolean;
  codInstructions?: string;
  isQrisEnabled?: boolean;
  qrisInstructions?: string;
  isTransferEnabled?: boolean;
  bankName?: string;
  accountNumber?: string;
  accountHolder?: string;
  transferInstructions?: string;
  // Point Loyalty Settings
  isPointsEnabled?: boolean;
  isGiftBoxEnabled?: boolean; // Toggle for Kotak Hadiah icon on customer storefront
  pointsPerRupiah?: number; // e.g. 10000 = Rp 10.000 -> 1 poin
  minOrderForPoints?: number; // e.g. 10000
  pointsRedeemRate?: number; // e.g. 100 = 1 poin -> Rp 100 diskon (100 poin = Rp 10.000)
  pointsRounding?: 'FLOOR' | 'ROUND';
  maxPointsPerOrder?: number;
  // Footer Customization Settings
  footerDescription?: string;
  footerDeliveryNote?: string;
  footerBottomNote?: string;
  footerCopyright?: string;
  isFooterEnabled?: boolean;
  footerShowPlatforms?: boolean;
  // Receipt Thermal Footer Customization Settings
  receiptFooterMessage?: string; // e.g. "Terima kasih atas pesanan Anda!"
  receiptFooterNote?: string; // e.g. "Simpan struk ini sebagai bukti transaksi"
  receiptFooterShowTagline?: boolean; // toggle whether to print store tagline in receipt footer
  receiptFooterCustomText?: string; // optional extra lines/promotions at footer
  receiptFooterShowGoogleReview?: boolean; // toggle google review prompt at footer
}

export interface PlatformLink {
  id: string;
  name: string; // 'GoFood' | 'ShopeeFood' | 'GrabFood' | string
  url: string;
  logoUrl?: string;
  isActive: boolean;
}

export interface Banner {
  id: string;
  title: string;
  subtitle?: string;
  imageUrl: string;
  targetUrl?: string;
  ctaText?: string;
  isActive: boolean;
  sortOrder: number;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  icon?: string;
  iconName?: string;
  imageUrl?: string;
  sortOrder: number;
  isActive: boolean;
  // Batch Modifier Configuration
  batchModifierEnabled?: boolean;
  batchModifierGroupId?: string;
  batchModifierRequired?: boolean;
  batchModifierMinSelection?: number;
  batchModifierMaxSelection?: number;
  batchModifierMode?: 'UNIFORM' | 'PER_ITEM' | 'POOL';
}

export interface WholesaleRule {
  minQty: number;
  maxQty?: number; // undefined means unbounded
  price: number;
}

export interface ModifierItem {
  id: string;
  name: string;
  price: number;
  isActive: boolean;
  sortOrder: number;
  isAvailable?: boolean;
  status?: 'AVAILABLE' | 'SOLD_OUT';
}

export interface ModifierGroup {
  id: string;
  name: string;
  description?: string;
  isRequired: boolean;
  minSelection: number;
  maxSelection: number;
  items: ModifierItem[];
  isActive: boolean;
}

export interface BatchModifierOption {
  modifierId: string;
  modifierName: string;
  quantity: number;
  price: number;
}

export interface BatchModifierSelection {
  categoryId: string;
  categoryName: string;
  modifierGroupId: string;
  modifierGroupName: string;
  options: BatchModifierOption[];
  totalAllocated: number;
  targetQuantity: number;
  required?: boolean;
  minSelections?: number;
  maxSelections?: number;
  selectedModifiers?: {
    modifierId: string;
    modifierName: string;
    price?: number;
  }[];
}

export interface Product {
  id: string;
  name: string;
  normalizedName?: string;
  sku?: string;
  categoryId: string;
  description: string;
  price: number; // Base price
  costPrice?: number;
  imageUrl: string;
  isActive: boolean;
  isAvailable: boolean;
  isPopular?: boolean;
  wholesaleEnabled: boolean;
  wholesaleRules?: WholesaleRule[];
  modifierGroupIds?: string[];
  sortOrder?: number;
  createdAt?: string;
  updatedAt?: string;
  isDuplicate?: boolean;
  canonicalProductId?: string;
}

export interface SelectedModifier {
  groupId: string;
  groupName: string;
  item: ModifierItem;
}

export interface CartItem {
  cartItemId: string; // Unique hash/id for cart line
  productId: string;
  productName: string;
  productImage: string;
  basePrice: number;
  unitPrice: number; // After wholesale calculation
  quantity: number;
  selectedModifiers: SelectedModifier[];
  modifiersPrice: number;
  lineTotal: number;
  notes?: string;
  categoryId?: string;
}

export interface DeliveryArea {
  id: string;
  name: string;
  description?: string;
  deliveryFee: number;
  minOrderAmount: number;
  estimatedDeliveryMinutes: number;
  isActive: boolean;
}

export type PromoType = 'PERCENTAGE' | 'FIXED' | 'FREE_DELIVERY' | 'MIX_MATCH';

export interface Promo {
  id: string;
  code: string;
  name: string;
  description?: string;
  type: PromoType;
  value: number; // % discount (e.g. 10) or fixed amount (e.g. 5000) or promo price per item
  minPurchase: number;
  maxDiscount?: number;
  discountType?: PromoType;
  discountValue?: number;
  minOrderAmount?: number;
  maxDiscountAmount?: number;
  startDate?: string;
  endDate?: string;
  usageLimit?: number;
  usedCount: number;
  isActive: boolean;
  // Mix & Match Quantity-Based Pricing settings
  isMixMatch?: boolean;
  mixMatchProductIds?: string[];
  mixMatchCategoryIds?: string[];
  mixMatchMinQty?: number;
  mixMatchQuantity?: number; // Compatibility alias with minQty
  mixMatchDiscountType?: 'FIXED' | 'PERCENTAGE' | 'FIXED_PRICE';
  mixMatchDiscountValue?: number;
  mixMatchPromoPrice?: number; // Official Promo Price per Pcs
  mixMatchPriceType?: 'PER_ITEM' | 'PACKAGE';
  mixMatchAllowSameProduct?: boolean;
}

export interface SplitPayment {
  method: PaymentMethod;
  amount: number;
}

export interface OrderCustomer {
  name: string;
  whatsapp: string; // optional, "-" if empty
  address?: string;
  notes?: string;
}

export interface Order {
  id: string;
  orderNumber: string; // e.g. #HF-000125
  createdAt: string;
  updatedAt?: string;
  source: 'WEB' | 'POS';
  status: OrderStatus;
  customer: OrderCustomer;
  serviceType: ServiceType;
  deliveryAreaId?: string;
  deliveryAreaName?: string;
  items: CartItem[];
  subtotal: number;
  discount: number;
  promoCode?: string;
  deliveryFee: number;
  total: number;
  paymentMethod: PaymentMethod;
  splitPayments?: SplitPayment[];
  amountPaid: number;
  change: number;
  cashierName?: string;
  idempotencyKey?: string;
  cancellationReason?: string;
  batchModifiers?: BatchModifierSelection[];
}

export interface DailyAnalytics {
  date: string; // YYYY-MM-DD
  totalRevenue: number;
  orderCount: number;
  completedOrders: number;
  cancelledOrders: number;
  posOrders: number;
  webOrders: number;
  deliveryFeeTotal: number;
  discountsTotal: number;
  paymentBreakdown: Record<string, number>;
  popularProducts: Record<string, { name: string; qty: number; revenue: number }>;
}

export interface AuditLog {
  id: string;
  actorId: string;
  actorEmail: string;
  actorRole: Role;
  action: string;
  targetType: string;
  targetId: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface PrinterSettings {
  printerType: 'BROWSER' | 'BLUETOOTH' | 'IMAGE';
  paperWidth: '58mm' | '80mm';
  autoPrintAfterOrder: boolean;
  printLogo: boolean;
  footerText: string;
}

/* =========================================================================
 * CUSTOMER & LOYALTY POINT SYSTEM (ADMIN-ONLY VISIBILITY FOR POINTS)
 * ========================================================================= */

export type CustomerStatus = 'ACTIVE' | 'INACTIVE';

export interface Customer {
  id: string;
  name: string;
  whatsapp: string; // unique identifier key
  address?: string;
  notes?: string;
  status: CustomerStatus;
  totalSpent: number;
  totalOrders: number;
  pointsBalance: number; // PRIVACY: Only accessible by staff/admin
  totalPointsEarned: number;
  createdAt: string;
  updatedAt: string;
}

export type PointLedgerType = 'EARN' | 'REDEEM' | 'ADJUSTMENT' | 'EXPIRED' | 'REVERSAL';
export type PointSource =
  | 'ORDER'
  | 'ADMIN_MANUAL'
  | 'REDEEM_DISCOUNT'
  | 'REDEEM_PRODUCT'
  | 'INSTANT_REDEEM'
  | 'ORDER_CANCELLED';

export interface PointLedgerEntry {
  id: string;
  customerId: string;
  customerName?: string;
  type: PointLedgerType;
  amount: number; // positive for EARN / +ADJUSTMENT, negative for REDEEM / REVERSAL
  balanceBefore: number;
  balanceAfter: number;
  source: PointSource;
  orderId?: string;
  rewardId?: string;
  rewardName?: string;
  note: string;
  createdAt: string;
  createdBy: string; // Admin UID or 'SYSTEM'
}

export type RewardType = 'DISCOUNT' | 'PRODUCT';

export interface RewardItem {
  id: string;
  name: string;
  type: RewardType;
  pointsCost: number;
  discountValue?: number; // Rupiah amount if type is DISCOUNT
  productId?: string; // Linked menu item if type is PRODUCT
  productName?: string;
  imageUrl?: string;
  description?: string;
  stock?: number; // Optional stock limit (e.g., max 50 units)
  isActive: boolean;
  validUntil?: string;
  redeemCount: number;
  createdAt: string;
}

export interface PointRedemption {
  id: string;
  redemptionCode?: string;
  customerId: string;
  customerName: string;
  customerPhone?: string;
  rewardId: string;
  rewardName: string;
  type: RewardType;
  pointsSpent: number;
  discountAmount?: number;
  productId?: string;
  productName?: string;
  orderId?: string;
  pointsBalanceAfter?: number;
  createdAt: string;
  createdBy: string;
  status: 'COMPLETED' | 'CANCELLED';
}

