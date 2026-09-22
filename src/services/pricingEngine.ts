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
  /** Discount allocated to canonical Order Groups by group id. */
  groupDiscounts?: Record<string, number>;
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
   * Calculate Mix & Match Quantity-Based Pricing discounts.
   *
   * Default rule:
   * - Minimum eligible quantity must be reached.
   * - Only complete bundles (multiples of mixMatchBundleQty) receive promo price.
   * - Leftover eligible units stay at normal price.
   * - Eligibility is calculated across the whole transaction, including every Order Group.
   *
   * Legacy compatibility:
   * - mixMatchRule='ALL_ELIGIBLE' preserves the previous behavior where all
   *   eligible units receive promo once the minimum quantity is reached.
   *
   * The product's base price in the catalog is never overwritten.
   */
  public static calculateMixMatchDiscounts(
    items: CartItem[],
    promos: Promo[],
    _allProducts?: Product[]
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

    // Create a pool of individual units to track usage and avoid double discounting across multiple promos
    interface ItemUnit {
      cartItemId: string;
      productId: string;
      categoryId?: string;
      unitPrice: number;
      orderGroupId?: string;
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
          orderGroupId: item.orderGroupId,
          isUsed: false,
        });
      }
    }

    let totalDiscount = 0;
    const appliedBundles: MixMatchBundleDetail[] = [];
    const groupDiscounts: Record<string, number> = {};

    for (const promo of activeMixPromos) {
      const minQty = Math.max(1, promo.mixMatchMinQty ?? promo.mixMatchQuantity ?? 2);
      const bundleQty = Math.max(1, promo.mixMatchBundleQty ?? promo.mixMatchMinQty ?? promo.mixMatchQuantity ?? 2);
      const rule = promo.mixMatchRule ?? 'FULL_MULTIPLES';
      const allowSameProduct = promo.mixMatchAllowSameProduct !== false;
      const targetProductIds = promo.mixMatchProductIds || [];
      const targetCategoryIds = promo.mixMatchCategoryIds || [];

      // Determine eligible units (Explicit Product IDs first as source of truth, fallback to categories if legacy)
      const matchingUnits = unitPool.filter((u) => {
        if (u.isUsed) return false;
        if (targetProductIds.length > 0) {
          return targetProductIds.includes(u.productId);
        }
        if (targetCategoryIds.length > 0) {
          return !!(u.categoryId && targetCategoryIds.includes(u.categoryId));
        }
        return false;
      });

      // If eligibleQuantity < minQuantity, promo is NOT active
      if (matchingUnits.length < minQty) {
        continue;
      }

      // Check allowSameProduct rule if configured
      if (!allowSameProduct) {
        const uniqueProductCount = new Set(matchingUnits.map((u) => u.productId)).size;
        if (uniqueProductCount < minQty) {
          continue;
        }
      }

      // FULL_MULTIPLES is the default: only complete bundles receive promo price.
      // Example bundleQty=2: 3 eligible units -> 2 promo + 1 normal.
      const qualifiedQuantity = rule === 'ALL_ELIGIBLE'
        ? matchingUnits.length
        : Math.floor(matchingUnits.length / bundleQty) * bundleQty;

      if (qualifiedQuantity <= 0) continue;

      const selectedUnits = matchingUnits.slice(0, qualifiedQuantity);
      const eligibleQuantity = selectedUnits.length;

      // Sum of regular prices of all eligible units
      const normalPriceSum = selectedUnits.reduce((sum, u) => sum + u.unitPrice, 0);

      // Determine promo price per item (Contract: promoPricePerItem)
      let promoDiscount = 0;
      let effectivePromoPricePerItem = 0;

      if (promo.mixMatchPromoPrice !== undefined && promo.mixMatchPromoPrice !== null) {
        // Contract primary mode: explicit promo price per item (e.g., Rp 1.500 / pcs)
        effectivePromoPricePerItem = Number(promo.mixMatchPromoPrice);
        const totalPromoCost = effectivePromoPricePerItem * eligibleQuantity;
        promoDiscount = Math.max(0, normalPriceSum - totalPromoCost);
      } else if (promo.mixMatchDiscountType === 'FIXED_PRICE') {
        // Compatibility mode with legacy FIXED_PRICE
        const pricePerUnit = promo.mixMatchDiscountValue ?? 0;
        effectivePromoPricePerItem = pricePerUnit;
        const totalPromoCost = pricePerUnit * eligibleQuantity;
        promoDiscount = Math.max(0, normalPriceSum - totalPromoCost);
      } else if (promo.mixMatchDiscountType === 'PERCENTAGE') {
        // Compatibility mode with percentage
        const pct = promo.mixMatchDiscountValue ?? promo.discountValue ?? promo.value ?? 0;
        promoDiscount = Math.round(normalPriceSum * (pct / 100));
        effectivePromoPricePerItem = Math.round((normalPriceSum - promoDiscount) / eligibleQuantity);
      } else if (promo.mixMatchDiscountType === 'FIXED') {
        // Compatibility mode with fixed deduction per unit
        const discountPerUnit = promo.mixMatchDiscountValue ?? promo.discountValue ?? promo.value ?? 0;
        promoDiscount = Math.min(normalPriceSum, discountPerUnit * eligibleQuantity);
        effectivePromoPricePerItem = Math.round((normalPriceSum - promoDiscount) / eligibleQuantity);
      } else {
        // Fallback default: use discountValue or value as promo price per item
        effectivePromoPricePerItem = promo.discountValue ?? promo.value ?? 0;
        const totalPromoCost = effectivePromoPricePerItem * eligibleQuantity;
        promoDiscount = Math.max(0, normalPriceSum - totalPromoCost);
      }

      if (promoDiscount > 0) {
        totalDiscount += promoDiscount;

        // Keep grouped ordering synchronized with the same promo calculation.
        // Discount is allocated proportionally to each canonical Order Group.
        const groupedUnits = selectedUnits.filter((u) => !!u.orderGroupId);
        if (groupedUnits.length > 0 && normalPriceSum > 0) {
          const groupedNormalTotals: Record<string, number> = {};
          groupedUnits.forEach((u) => {
            const groupId = u.orderGroupId!;
            groupedNormalTotals[groupId] = (groupedNormalTotals[groupId] || 0) + u.unitPrice;
          });

          const entries = Object.entries(groupedNormalTotals);
          let allocated = 0;
          entries.forEach(([groupId, groupNormal], index) => {
            const groupDiscount =
              index === entries.length - 1
                ? Math.max(0, promoDiscount - allocated)
                : Math.round((promoDiscount * groupNormal) / normalPriceSum);
            allocated += groupDiscount;
            groupDiscounts[groupId] = (groupDiscounts[groupId] || 0) + groupDiscount;
          });
        }
        // Mark these units as used so they are not double-discounted by subsequent promos
        selectedUnits.forEach((u) => (u.isUsed = true));

        appliedBundles.push({
          promoId: promo.id,
          promoName: promo.name,
          bundleCount: rule === 'ALL_ELIGIBLE' ? 1 : Math.floor(eligibleQuantity / bundleQty),
          itemsDiscountedCount: eligibleQuantity,
          discount: promoDiscount,
          promoPricePerItem: effectivePromoPricePerItem,
        });
      }
    }

    return {
      discount: totalDiscount,
      appliedBundles,
      groupDiscounts,
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
