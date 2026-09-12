import { Product, SelectedModifier, WholesaleRule, Promo, DeliveryArea, CartItem } from '../types';

export interface MixMatchBundleDetail {
  promoId: string;
  promoName: string;
  bundleCount: number;
  itemsDiscountedCount: number;
  discount: number;
  promoPricePerItem: number;
}

export interface MixMatchResult {
  discount: number;
  appliedBundles: MixMatchBundleDetail[];
}

export class PricingEngine {
  /**
   * Determine the unit price of a product based on its wholesale tier rules and quantity
   */
  public static calculateUnitPrice(product: Product, quantity: number): number {
    if (!product.wholesaleEnabled || !product.wholesaleRules || product.wholesaleRules.length === 0) {
      return product.price;
    }

    // Sort rules by minQty descending to match highest tier first
    const sortedRules = [...product.wholesaleRules].sort((a, b) => b.minQty - a.minQty);
    
    for (const rule of sortedRules) {
      if (quantity >= rule.minQty) {
        if (rule.maxQty === undefined || quantity <= rule.maxQty) {
          return rule.price;
        }
      }
    }

    return product.price;
  }

  /**
   * Calculate total extra price of selected modifiers
   */
  public static calculateModifiersPrice(selectedModifiers: SelectedModifier[]): number {
    return selectedModifiers.reduce((sum, mod) => sum + (mod.item.price || 0), 0);
  }

  /**
   * Calculate line item total
   */
  public static calculateLineTotal(
    unitPrice: number,
    modifiersPrice: number,
    quantity: number
  ): number {
    return (unitPrice + modifiersPrice) * quantity;
  }

  /**
   * Calculate Mix & Match quantity-based bundle discounts
   * Ensures:
   * - Strict compliance with minimum quantities
   * - Bundles calculated per multiple (e.g. 5 items with min 2 -> 4 items discounted, 1 item regular price)
   * - Non-destructive to normal wholesale or modifier prices
   * - No double-discounting across overlapping promos
   */
  public static calculateMixMatchDiscounts(
    items: CartItem[],
    promos: Promo[],
    allProducts?: Product[]
  ): MixMatchResult {
    if (!items || items.length === 0 || !promos || promos.length === 0) {
      return { discount: 0, appliedBundles: [] };
    }

    const activeMixPromos = promos.filter(
      (p) => p.isActive && (p.type === 'MIX_MATCH' || p.isMixMatch)
    );

    if (activeMixPromos.length === 0) {
      return { discount: 0, appliedBundles: [] };
    }

    // Create a pool of individual units to track usage and avoid double discounting
    interface ItemUnit {
      cartItemId: string;
      productId: string;
      categoryId?: string;
      unitPrice: number;
      isUsed: boolean;
    }

    const unitPool: ItemUnit[] = [];
    for (const item of items) {
      for (let i = 0; i < item.quantity; i++) {
        unitPool.push({
          cartItemId: item.cartItemId,
          productId: item.productId,
          categoryId: item.categoryId,
          unitPrice: item.unitPrice,
          isUsed: false,
        });
      }
    }

    let totalDiscount = 0;
    const appliedBundles: MixMatchBundleDetail[] = [];

    for (const promo of activeMixPromos) {
      const minQty = Math.max(1, promo.mixMatchQuantity || promo.mixMatchMinQty || 2);
      const allowSameProduct = promo.mixMatchAllowSameProduct !== false;
      const targetProductIds = promo.mixMatchProductIds || [];
      const targetCategoryIds = promo.mixMatchCategoryIds || [];

      // Find unused units matching this promo
      const matchingUnits = unitPool.filter((u) => {
        if (u.isUsed) return false;
        const matchesProduct = targetProductIds.length === 0 || targetProductIds.includes(u.productId);
        const matchesCategory =
          targetCategoryIds.length === 0 || (u.categoryId && targetCategoryIds.includes(u.categoryId));
        return matchesProduct || matchesCategory;
      });

      if (matchingUnits.length < minQty) {
        continue;
      }

      // Check allowSameProduct rule
      if (!allowSameProduct) {
        const uniqueProductCount = new Set(matchingUnits.map((u) => u.productId)).size;
        if (uniqueProductCount < minQty) {
          continue; // Does not qualify if distinct products are required
        }
      }

      // Calculate how many complete bundles can be formed
      const bundleCount = Math.floor(matchingUnits.length / minQty);
      if (bundleCount <= 0) continue;

      const itemsToDiscountCount = bundleCount * minQty;
      const selectedUnits = matchingUnits.slice(0, itemsToDiscountCount);

      // Normal price of selected units
      const normalPriceSum = selectedUnits.reduce((sum, u) => sum + u.unitPrice, 0);

      // Calculate discount based on model
      let promoDiscount = 0;
      if (promo.mixMatchDiscountType === 'FIXED') {
        const discountPerBundle = promo.mixMatchDiscountValue ?? promo.discountValue ?? promo.value ?? 0;
        promoDiscount = Math.min(normalPriceSum, discountPerBundle * bundleCount);
      } else if (promo.mixMatchDiscountType === 'PERCENTAGE') {
        const pct = promo.mixMatchDiscountValue ?? promo.discountValue ?? promo.value ?? 0;
        promoDiscount = Math.round(normalPriceSum * (pct / 100));
      } else if (promo.mixMatchDiscountType === 'FIXED_PRICE') {
        const packagePrice = promo.mixMatchDiscountValue ?? 0;
        promoDiscount = Math.max(0, normalPriceSum - packagePrice * bundleCount);
      } else {
        // Default / legacy promo price per item
        let promoPricePerItem = promo.mixMatchPromoPrice || promo.discountValue || promo.value || 0;
        if (promo.mixMatchPriceType === 'PACKAGE') {
          promoPricePerItem = Math.round(promoPricePerItem / minQty);
        }
        const totalPromoPrice = promoPricePerItem * itemsToDiscountCount;
        promoDiscount = Math.max(0, normalPriceSum - totalPromoPrice);
      }

      const effectivePricePerItem = Math.round((normalPriceSum - promoDiscount) / itemsToDiscountCount);

      if (promoDiscount > 0) {
        totalDiscount += promoDiscount;
        selectedUnits.forEach((u) => (u.isUsed = true));

        appliedBundles.push({
          promoId: promo.id,
          promoName: promo.name,
          bundleCount,
          itemsDiscountedCount: itemsToDiscountCount,
          discount: promoDiscount,
          promoPricePerItem: effectivePricePerItem,
        });
      }
    }

    return {
      discount: totalDiscount,
      appliedBundles,
    };
  }

  /**
   * Validate and calculate promo discount
   */
  public static calculatePromoDiscount(
    promo: Promo | null,
    subtotal: number,
    deliveryFee: number
  ): { discount: number; effectiveDeliveryFee: number; message?: string } {
    if (!promo || !promo.isActive) {
      return { discount: 0, effectiveDeliveryFee: deliveryFee };
    }

    // Mix & Match is evaluated through bundle analysis
    if (promo.type === 'MIX_MATCH' || promo.isMixMatch) {
      return { discount: 0, effectiveDeliveryFee: deliveryFee };
    }

    if (promo.minPurchase > 0 && subtotal < promo.minPurchase) {
      return {
        discount: 0,
        effectiveDeliveryFee: deliveryFee,
        message: `Minimal belanja Rp ${promo.minPurchase.toLocaleString('id-ID')} untuk promo ini.`,
      };
    }

    let discount = 0;
    let effectiveDeliveryFee = deliveryFee;

    if (promo.type === 'FREE_DELIVERY') {
      discount = deliveryFee;
      effectiveDeliveryFee = 0;
    } else if (promo.type === 'PERCENTAGE') {
      const rawDiscount = Math.round((subtotal * promo.value) / 100);
      if (promo.maxDiscount && promo.maxDiscount > 0) {
        discount = Math.min(rawDiscount, promo.maxDiscount);
      } else {
        discount = rawDiscount;
      }
    } else if (promo.type === 'FIXED') {
      discount = Math.min(promo.value, subtotal);
    }

    return {
      discount,
      effectiveDeliveryFee,
    };
  }

  /**
   * Validate cash payment amount
   */
  public static validateCashPayment(
    total: number,
    amountPaid: number
  ): { isValid: boolean; change: number; message?: string } {
    if (amountPaid < total) {
      return {
        isValid: false,
        change: 0,
        message: `Nominal pembayaran kurang Rp ${(total - amountPaid).toLocaleString('id-ID')}.`,
      };
    }

    return {
      isValid: true,
      change: amountPaid - total,
    };
  }
}
