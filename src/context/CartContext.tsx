import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from 'react';
import {
  CartItem,
  Product,
  SelectedModifier,
  Promo,
  DeliveryArea,
  ServiceType,
  BatchModifierSelection,
} from '../types';
import { PricingEngine, MixMatchBundleDetail } from '../services/pricingEngine';

interface CartContextType {
  items: CartItem[];
  itemCount: number;
  subtotal: number;
  discount: number;
  mixMatchDiscount: number;
  mixMatchBundles: MixMatchBundleDetail[];
  deliveryFee: number;
  total: number;
  appliedPromo: Promo | null;
  availablePromos: Promo[];
  setAvailablePromos: (promos: Promo[]) => void;
  selectedDeliveryArea: DeliveryArea | null;
  serviceType: ServiceType;
  batchSelections: Record<string, BatchModifierSelection>;
  setBatchSelection: (categoryId: string, selection: BatchModifierSelection) => void;
  removeBatchSelection: (categoryId: string) => void;
  clearBatchSelections: () => void;
  addItem: (
    product: Product,
    quantity: number,
    selectedModifiers: SelectedModifier[],
    notes?: string
  ) => void;
  updateItemQuantity: (cartItemId: string, quantity: number, allProducts: Product[]) => void;
  removeItem: (cartItemId: string) => void;
  updateItemNotes: (cartItemId: string, notes: string) => void;
  clearCart: () => void;
  applyPromo: (promo: Promo | null) => { success: boolean; message?: string };
  removePromo: () => void;
  setDeliveryArea: (area: DeliveryArea | null) => void;
  setServiceType: (type: ServiceType) => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const CART_STORAGE_KEY = 'huma_cart_v3';
const BATCH_STORAGE_KEY = 'huma_batch_v1';

export const CartProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem(CART_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [appliedPromo, setAppliedPromo] = useState<Promo | null>(null);
  const [availablePromos, setAvailablePromos] = useState<Promo[]>([]);
  const [selectedDeliveryArea, setSelectedDeliveryArea] = useState<DeliveryArea | null>(null);
  const [serviceType, setServiceType] = useState<ServiceType>('DELIVERY');

  // Batch Modifiers Selections State
  const [batchSelections, setBatchSelections] = useState<Record<string, BatchModifierSelection>>(() => {
    try {
      const saved = localStorage.getItem(BATCH_STORAGE_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Persist batch selections
  useEffect(() => {
    try {
      localStorage.setItem(BATCH_STORAGE_KEY, JSON.stringify(batchSelections));
    } catch (e) {
      console.warn('Unable to persist batch selections', e);
    }
  }, [batchSelections]);

  // Safely reconcile batch selections whenever cart items are modified
  const reconcileBatchSelections = (
    currentSelections: Record<string, BatchModifierSelection>,
    currentItems: CartItem[]
  ): Record<string, BatchModifierSelection> => {
    const updated: Record<string, BatchModifierSelection> = {};

    for (const [catId, sel] of Object.entries(currentSelections)) {
      const matchingItems = currentItems.filter((it) => it.categoryId === catId);
      const newTotalQty = matchingItems.reduce((sum, it) => sum + it.quantity, 0);

      // If category has no more items in cart, drop it completely (no orphaned modifier data)
      if (newTotalQty <= 0) {
        continue;
      }

      // Preserve the user's selected flavor choices intact as long as category items exist
      updated[catId] = {
        ...sel,
      };
    }

    return updated;
  };

  const setBatchSelection = useCallback((categoryId: string, selection: BatchModifierSelection) => {
    setBatchSelections((prev) => ({
      ...prev,
      [categoryId]: selection,
    }));
  }, []);

  const removeBatchSelection = useCallback((categoryId: string) => {
    setBatchSelections((prev) => {
      const next = { ...prev };
      delete next[categoryId];
      return next;
    });
  }, []);

  const clearBatchSelections = useCallback(() => {
    setBatchSelections({});
  }, []);

  // Persist cart to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    } catch (e) {
      console.warn('Unable to persist cart locally', e);
    }
  }, [items]);

  // Derived calculations
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);

  // 1. Calculate Mix & Match automatic discounts
  const mixMatchResult = PricingEngine.calculateMixMatchDiscounts(items, availablePromos);
  const mixMatchDiscount = mixMatchResult.discount;
  const mixMatchBundles = mixMatchResult.appliedBundles;

  const rawDeliveryFee = serviceType === 'DELIVERY' && selectedDeliveryArea ? selectedDeliveryArea.deliveryFee : 0;
  
  // 2. Calculate voucher discount applied to subtotal remainder after mix & match
  const subtotalAfterMixMatch = Math.max(0, subtotal - mixMatchDiscount);
  const { discount: voucherDiscount, effectiveDeliveryFee } = PricingEngine.calculatePromoDiscount(
    appliedPromo,
    subtotalAfterMixMatch,
    rawDeliveryFee
  );

  const discount = mixMatchDiscount + voucherDiscount;
  const total = Math.max(0, subtotal - discount + effectiveDeliveryFee);

  const addItem = useCallback((
    product: Product,
    quantity: number,
    selectedModifiers: SelectedModifier[],
    notes?: string
  ) => {
    const safeNotes = typeof notes === 'string' ? notes.trim() : '';

    // Generate a signature for identical modifiers to stack items
    const modSignature = (selectedModifiers || [])
      .map((m) => `${m.groupId}:${m.item?.id || ''}`)
      .sort()
      .join('|');
    
    const cartItemId = `${product.id}_${modSignature}_${safeNotes}`;
    const modifiersPrice = PricingEngine.calculateModifiersPrice(selectedModifiers || []);

    setItems((prevItems) => {
      const existingIndex = prevItems.findIndex((item) => item.cartItemId === cartItemId);
      if (existingIndex > -1) {
        const existing = prevItems[existingIndex];
        const newQty = existing.quantity + quantity;
        const unitPrice = PricingEngine.calculateUnitPrice(product, newQty);
        const lineTotal = PricingEngine.calculateLineTotal(unitPrice, modifiersPrice, newQty);

        const updated = [...prevItems];
        updated[existingIndex] = {
          ...existing,
          quantity: newQty,
          unitPrice,
          lineTotal,
          categoryId: product.categoryId || existing.categoryId,
        };
        return updated;
      } else {
        const unitPrice = PricingEngine.calculateUnitPrice(product, quantity);
        const lineTotal = PricingEngine.calculateLineTotal(unitPrice, modifiersPrice, quantity);

        const newItem: CartItem = {
          cartItemId,
          productId: product.id,
          productName: product.name,
          productImage: product.imageUrl,
          basePrice: product.price,
          unitPrice,
          quantity,
          selectedModifiers: selectedModifiers || [],
          modifiersPrice,
          lineTotal,
          notes: safeNotes || undefined,
          categoryId: product.categoryId,
        };
        return [...prevItems, newItem];
      }
    });
  }, []);

  const updateItemQuantity = useCallback((cartItemId: string, newQty: number, allProducts: Product[]) => {
    if (newQty <= 0) {
      setItems((prev) => {
        const updatedItems = prev.filter((item) => item.cartItemId !== cartItemId);
        setBatchSelections((prevBatch) => reconcileBatchSelections(prevBatch, updatedItems));
        return updatedItems;
      });
      return;
    }

    setItems((prevItems) => {
      const updatedItems = prevItems.map((item) => {
        if (item.cartItemId !== cartItemId) return item;
        const matchedProduct = allProducts.find((p) => p.id === item.productId);
        const unitPrice = matchedProduct
          ? PricingEngine.calculateUnitPrice(matchedProduct, newQty)
          : item.unitPrice;
        const lineTotal = PricingEngine.calculateLineTotal(unitPrice, item.modifiersPrice, newQty);
        return {
          ...item,
          quantity: newQty,
          unitPrice,
          lineTotal,
          categoryId: matchedProduct?.categoryId || item.categoryId,
        };
      });

      // Automatically reconcile batch selections when item quantities change
      setBatchSelections((prevBatch) => reconcileBatchSelections(prevBatch, updatedItems));
      return updatedItems;
    });
  }, []);

  const removeItem = useCallback((cartItemId: string) => {
    setItems((prev) => {
      const updatedItems = prev.filter((item) => item.cartItemId !== cartItemId);
      // Automatically reconcile batch selections (remove orphaned category selections)
      setBatchSelections((prevBatch) => reconcileBatchSelections(prevBatch, updatedItems));
      return updatedItems;
    });
  }, []);

  const updateItemNotes = useCallback((cartItemId: string, notes: string) => {
    const safeNotes = typeof notes === 'string' ? notes.trim() : '';
    setItems((prev) =>
      prev.map((item) => (item.cartItemId === cartItemId ? { ...item, notes: safeNotes } : item))
    );
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
    setAppliedPromo(null);
    setBatchSelections({});
  }, []);

  const applyPromo = useCallback((promo: Promo | null) => {
    if (!promo) {
      setAppliedPromo(null);
      return { success: true };
    }
    const result = PricingEngine.calculatePromoDiscount(promo, subtotal, rawDeliveryFee);
    if (result.message) {
      return { success: false, message: result.message };
    }
    setAppliedPromo(promo);
    return { success: true };
  }, [subtotal, rawDeliveryFee]);

  const removePromo = useCallback(() => {
    setAppliedPromo(null);
  }, []);

  const contextValue = useMemo<CartContextType>(
    () => ({
      items,
      itemCount,
      subtotal,
      discount,
      mixMatchDiscount,
      mixMatchBundles,
      deliveryFee: effectiveDeliveryFee,
      total,
      appliedPromo,
      availablePromos,
      setAvailablePromos,
      selectedDeliveryArea,
      serviceType,
      batchSelections,
      setBatchSelection,
      removeBatchSelection,
      clearBatchSelections,
      addItem,
      updateItemQuantity,
      removeItem,
      updateItemNotes,
      clearCart,
      applyPromo,
      removePromo,
      setDeliveryArea: setSelectedDeliveryArea,
      setServiceType,
    }),
    [
      items,
      itemCount,
      subtotal,
      discount,
      mixMatchDiscount,
      mixMatchBundles,
      effectiveDeliveryFee,
      total,
      appliedPromo,
      availablePromos,
      setAvailablePromos,
      selectedDeliveryArea,
      serviceType,
      batchSelections,
      setBatchSelection,
      removeBatchSelection,
      clearBatchSelections,
      addItem,
      updateItemQuantity,
      removeItem,
      updateItemNotes,
      clearCart,
      applyPromo,
      removePromo,
      setSelectedDeliveryArea,
      setServiceType,
    ]
  );

  return (
    <CartContext.Provider value={contextValue}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};
