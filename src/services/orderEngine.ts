import {
  BatchModifierSelection,
  CartItem,
  Category,
  Order,
  OrderGroup,
  OrderGroupItem,
  OrderGroupModifier,
  Product,
  SelectedModifier,
} from '../types';
import { PricingEngine } from './pricingEngine';

export interface CreateOrderGroupInput {
  categoryId: string;
  items: OrderGroupItem[];
  modifiers?: OrderGroupModifier[];
  note?: string;
  id?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface GroupValidationResult {
  valid: boolean;
  errors: string[];
}

export interface OrderCalculation {
  subtotal: number;
  discount: number;
  deliveryFee: number;
  total: number;
}

const nowIso = () => new Date().toISOString();

export class OrderEngine {
  /**
   * Resolve the explicit new Order Group configuration.
   * Legacy Batch Modifier remains a separate feature so existing categories
   * keep their previous behavior until an admin explicitly enables Order Group.
   */
  public static getOrderingConfig(category?: Category | null) {
    return category?.orderingConfig || {
      groupingEnabled: false,
      modifierEnabled: false,
      modifierScope: 'group' as const,
    };
  }

  public static createGroup(input: CreateOrderGroupInput): OrderGroup {
    const timestamp = nowIso();
    const group: OrderGroup = {
      id: input.id || `group_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      categoryId: input.categoryId,
      items: input.items.map((item) => ({ ...item })),
      modifiers: (input.modifiers || []).map((modifier) => ({
        ...modifier,
        quantity: Math.max(1, modifier.quantity || 1),
      })),
      subtotal: 0,
      note: input.note?.trim() || undefined,
      createdAt: input.createdAt || timestamp,
      updatedAt: input.updatedAt || timestamp,
    };

    return this.recalculateGroup(group);
  }

  public static updateGroup(
    group: OrderGroup,
    patch: Partial<Pick<OrderGroup, 'categoryId' | 'items' | 'modifiers' | 'note'>>
  ): OrderGroup {
    return this.recalculateGroup({
      ...group,
      ...patch,
      items: patch.items ? patch.items.map((item) => ({ ...item })) : group.items,
      modifiers: patch.modifiers
        ? patch.modifiers.map((modifier) => ({ ...modifier }))
        : group.modifiers,
      note: patch.note?.trim() || undefined,
      updatedAt: nowIso(),
    });
  }

  public static deleteGroup(groups: OrderGroup[], groupId: string): OrderGroup[] {
    return groups.filter((group) => group.id !== groupId);
  }

  public static recalculateGroup(group: OrderGroup): OrderGroup {
    const itemSubtotal = group.items.reduce((sum, item) => sum + Math.max(0, item.subtotal), 0);
    const modifierSubtotal = group.modifiers.reduce(
      (sum, modifier) => sum + Math.max(0, modifier.price) * Math.max(1, modifier.quantity || 1),
      0
    );

    return {
      ...group,
      subtotal: Math.max(0, itemSubtotal + modifierSubtotal),
    };
  }

  public static calculateGroupSubtotal(group: OrderGroup): number {
    return this.recalculateGroup(group).subtotal;
  }

  public static calculateOrderSubtotal(groups: OrderGroup[]): number {
    return groups.reduce((sum, group) => sum + this.calculateGroupSubtotal(group), 0);
  }

  /**
   * Keep the legacy flat item representation synchronized for existing
   * reports/receipts while groups[] remains the canonical relationship.
   */
  public static flattenGroups(groups: OrderGroup[]): CartItem[] {
    return groups.flatMap((group) =>
      group.items.map((item) => ({
        cartItemId: item.id,
        productId: item.productId,
        productName: item.name,
        productImage: item.productImage || '',
        basePrice: item.basePrice,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        selectedModifiers: item.selectedModifiers || [],
        modifiersPrice: item.modifiersPrice || 0,
        lineTotal: item.subtotal,
        notes: item.notes,
        categoryId: group.categoryId,
        mixMatchEligible: item.mixMatchEligible,
        orderGroupId: group.id,
      }))
    );
  }

  public static calculateOrderTotal(
    groups: OrderGroup[],
    discount = 0,
    deliveryFee = 0
  ): OrderCalculation {
    const subtotal = this.calculateOrderSubtotal(groups);
    const safeDiscount = Math.min(Math.max(0, discount), subtotal);
    const safeDelivery = Math.max(0, deliveryFee);

    return {
      subtotal,
      discount: safeDiscount,
      deliveryFee: safeDelivery,
      total: Math.max(0, subtotal - safeDiscount + safeDelivery),
    };
  }

  public static validateGroup(
    group: OrderGroup,
    category?: Category | null
  ): GroupValidationResult {
    const errors: string[] = [];

    if (!group.id) errors.push('Order Group membutuhkan id.');
    if (!group.categoryId) errors.push('Order Group membutuhkan categoryId.');
    if (!group.items || group.items.length === 0) {
      errors.push('Order Group harus memiliki minimal satu item.');
    }

    for (const item of group.items || []) {
      if (!item.productId) errors.push('Setiap item group harus memiliki productId.');
      if (!item.name) errors.push('Setiap item group harus memiliki nama.');
      if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
        errors.push(`Quantity item ${item.name || item.productId} harus lebih dari 0.`);
      }
    }

    if (category && group.categoryId !== category.id) {
      errors.push('Category Order Group tidak sesuai dengan category konfigurasi.');
    }

    const config = this.getOrderingConfig(category);
    if (config.groupingEnabled && config.modifierEnabled) {
      const required = config.modifierRequired ?? (category?.batchModifierRequired === true);

      if (required && (!group.modifiers || group.modifiers.length === 0)) {
        errors.push('Modifier/bumbu wajib dipilih untuk Order Group ini.');
      }
    }

    return { valid: errors.length === 0, errors };
  }

  public static buildGroupItem(
    product: Product,
    quantity: number,
    selectedModifiers: SelectedModifier[] = [],
    notes?: string
  ): OrderGroupItem {
    const safeQuantity = Math.max(1, Math.floor(quantity));
    const modifiersPrice = PricingEngine.calculateModifiersPrice(selectedModifiers);
    const unitPrice = PricingEngine.calculateUnitPrice(product, safeQuantity);
    const subtotal = PricingEngine.calculateLineTotal(unitPrice, modifiersPrice, safeQuantity);

    return {
      id: `group_item_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      productId: product.id,
      name: product.name,
      productImage: product.imageUrl,
      basePrice: product.price,
      unitPrice,
      quantity: safeQuantity,
      selectedModifiers: selectedModifiers || [],
      modifiersPrice,
      subtotal,
      notes: notes?.trim() || undefined,
      mixMatchEligible: product.mixMatchEligible !== false,
    };
  }

  /**
   * Convert the current legacy order shape into a display/calculation-compatible
   * grouped representation without mutating the stored legacy data.
   */
  public static normalizeOrder(order: Order): Order {
    if (order.groups && order.groups.length > 0) {
      return {
        ...order,
        groups: order.groups.map((group) => this.recalculateGroup(group)),
      };
    }

    if (!order.items || order.items.length === 0) {
      return { ...order, groups: [] };
    }

    const legacyBatch = order.batchModifiers || [];
    const grouped = new Map<string, CartItem[]>();

    for (const item of order.items) {
      const key = item.categoryId || 'uncategorized';
      const current = grouped.get(key) || [];
      current.push(item);
      grouped.set(key, current);
    }

    const groups: OrderGroup[] = [];
    for (const [categoryId, items] of grouped.entries()) {
      const batch = legacyBatch.find((selection) => selection.categoryId === categoryId);
      const modifiers = this.legacyBatchToGroupModifiers(batch);

      groups.push(
        this.createGroup({
          categoryId,
          items: items.map((item) => this.legacyCartItemToGroupItem(item)),
          modifiers,
        })
      );
    }

    return {
      ...order,
      groups,
    };
  }

  private static legacyCartItemToGroupItem(item: CartItem): OrderGroupItem {
    return {
      id: item.cartItemId,
      productId: item.productId,
      name: item.productName,
      productImage: item.productImage,
      basePrice: item.basePrice,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      selectedModifiers: item.selectedModifiers || [],
      modifiersPrice: item.modifiersPrice || 0,
      subtotal: item.lineTotal,
      notes: item.notes,
      mixMatchEligible: item.mixMatchEligible,
    };
  }

  private static legacyBatchToGroupModifiers(
    selection?: BatchModifierSelection
  ): OrderGroupModifier[] {
    if (!selection) return [];

    const selected = selection.selectedModifiers || [];
    return selected.map((modifier) => ({
      modifierId: modifier.modifierId,
      name: modifier.modifierName,
      groupId: selection.modifierGroupId,
      groupName: selection.modifierGroupName,
      price: modifier.price || 0,
      quantity: 1,
    }));
  }
}
