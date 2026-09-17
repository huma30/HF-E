import React, { useState, useMemo } from 'react';
import {
  Product,
  Category,
  ModifierGroup,
  CartItem,
  Order,
  Promo,
  StoreSettings,
  SelectedModifier,
  BatchModifierSelection,
} from '../../types';
import { PricingEngine } from '../../services/pricingEngine';
import { PosPaymentModal } from './PosPaymentModal';
import { PosHoldOrdersModal, HeldOrder } from './PosHoldOrdersModal';
import { ThermalReceiptModal } from './ThermalReceiptModal';
import { ProductModifierModal } from '../customer/ProductModifierModal';
import { BatchModifierModal } from '../customer/BatchModifierModal';
import { useAuth } from '../../context/AuthContext';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  PauseCircle,
  PlayCircle,
  CreditCard,
  Printer,
  Sparkles,
  Store,
  ShoppingBag,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  X,
  Tag,
} from 'lucide-react';

interface PosLayoutProps {
  products: Product[];
  categories: Category[];
  modifierGroups: ModifierGroup[];
  promos?: Promo[];
  settings: StoreSettings | null;
  onExitPos: () => void;
  onOpenAdmin?: () => void;
}

export const PosLayout: React.FC<PosLayoutProps> = ({
  products,
  categories,
  modifierGroups,
  promos = [],
  settings,
  onExitPos,
  onOpenAdmin,
}) => {
  const { adminProfile, role } = useAuth();

  // POS Search & Category Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  // Active POS Cart state (distinct from customer's personal cart)
  const [posCart, setPosCart] = useState<CartItem[]>([]);
  const [discountAmount, setDiscountAmount] = useState<number>(0);

  // Batch Modifier state for categories configured with batch modifiers
  const [batchSelections, setBatchSelections] = useState<Record<string, BatchModifierSelection>>({});
  const [activeBatchCategory, setActiveBatchCategory] = useState<{
    category: Category;
    group: ModifierGroup;
    totalQty: number;
  } | null>(null);

  // Mobile cart bottom sheet state
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);

  // Modals state
  const [modifierModalProduct, setModifierModalProduct] = useState<Product | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isHoldModalOpen, setIsHoldModalOpen] = useState(false);
  const [heldOrders, setHeldOrders] = useState<HeldOrder[]>([]);

  // Last order for receipt reprint
  const [lastCompletedOrder, setLastCompletedOrder] = useState<Order | null>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);

  // Active products filter
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (!p.isActive) return false;
      if (selectedCategoryId && p.categoryId !== selectedCategoryId) return false;
      if (searchQuery.trim()) {
        const queryLower = searchQuery.toLowerCase();
        const matchesName = p.name.toLowerCase().includes(queryLower);
        const matchesDesc = p.description.toLowerCase().includes(queryLower);
        if (!matchesName && !matchesDesc) return false;
      }
      return true;
    });
  }, [products, selectedCategoryId, searchQuery]);

  // Calculations: Subtotal, Mix & Match Automatic Promo, and Total
  const subtotal = useMemo(() => {
    return posCart.reduce((sum, item) => sum + item.lineTotal, 0);
  }, [posCart]);

  // 1. Calculate Mix & Match automatic discounts using the unified PricingEngine
  const mixMatchResult = useMemo(() => {
    return PricingEngine.calculateMixMatchDiscounts(posCart, promos);
  }, [posCart, promos]);

  const mixMatchDiscount = mixMatchResult.discount;
  const mixMatchBundles = mixMatchResult.appliedBundles;

  const totalDiscount = mixMatchDiscount + discountAmount;
  const total = Math.max(0, subtotal - totalDiscount);

  // Detect which categories in POS cart require Batch Modifiers
  const batchModifierCategories = useMemo(() => {
    if (!categories || categories.length === 0 || !posCart || posCart.length === 0) return [];
    return categories
      .filter((cat) => (cat.batchModifierEnabled && cat.batchModifierGroupId) || cat.name.toLowerCase().includes('goreng'))
      .map((cat) => {
        const matchingItems = posCart.filter((it) => it.categoryId === cat.id);
        const totalQty = matchingItems.reduce((sum, it) => sum + it.quantity, 0);
        const group = modifierGroups?.find(
          (g) => g.id === cat.batchModifierGroupId || (cat.name.toLowerCase().includes('goreng') && g.name.toLowerCase().includes('bumbu'))
        );
        return {
          category: cat,
          group,
          totalQty,
        };
      })
      .filter(
        (entry): entry is { category: Category; group: ModifierGroup; totalQty: number } =>
          entry.totalQty > 0 && !!entry.group
      );
  }, [categories, posCart, modifierGroups]);

  // Helper to resolve batch category configuration and completion status
  const getBatchCategoryConfig = (entry: { category: Category; group: ModifierGroup; totalQty: number }) => {
    const isGorengan = entry.category.name.toLowerCase().includes('goreng');
    const isReq = isGorengan || entry.category.batchModifierRequired !== false;
    const minSelections =
      entry.category.batchModifierMinSelection !== undefined
        ? Math.max(isGorengan ? 1 : 0, Number(entry.category.batchModifierMinSelection))
        : entry.group.minSelection !== undefined
        ? Math.max(0, Number(entry.group.minSelection))
        : isReq
        ? 1
        : 0;

    const maxSelections =
      entry.category.batchModifierMaxSelection !== undefined
        ? Math.max(minSelections, Number(entry.category.batchModifierMaxSelection))
        : entry.group.maxSelection !== undefined
        ? Math.max(minSelections, Number(entry.group.maxSelection))
        : 99;

    const sel = batchSelections[entry.category.id];
    const selectedCount =
      sel?.selectedModifiers?.length ||
      sel?.options?.reduce((sum, o) => sum + (o.quantity ?? 1), 0) ||
      0;

    const isComplete = !isReq || selectedCount >= minSelections;

    return {
      isReq,
      minSelections,
      maxSelections,
      sel,
      selectedCount,
      isComplete,
    };
  };

  // Fast add product to POS cart
  const handleProductClick = (product: Product) => {
    if (!product.isAvailable) return;
    const prodModGroups = modifierGroups.filter(
      (g) => product.modifierGroupIds?.includes(g.id) && g.isActive
    );
    // If product has modifiers, open modifier popup
    if (prodModGroups.length > 0) {
      setModifierModalProduct(product);
    } else {
      // Direct quick add
      handleAddLineItem(product, 1, []);
    }
  };

  const handleAddLineItem = (
    product: Product,
    quantity: number,
    selectedModifiers: SelectedModifier[],
    notes?: string
  ) => {
    const safeNotes = typeof notes === 'string' ? notes.trim() : '';
    const modSignature = (selectedModifiers || [])
      .map((m) => `${m.groupId}:${m.item?.id || ''}`)
      .sort()
      .join('|');
    const cartItemId = `pos_${product.id}_${modSignature}_${safeNotes}`;
    const modifiersPrice = PricingEngine.calculateModifiersPrice(selectedModifiers || []);

    setPosCart((prev) => {
      const idx = prev.findIndex((item) => item.cartItemId === cartItemId);
      if (idx > -1) {
        const existing = prev[idx];
        const newQty = existing.quantity + quantity;
        const unitPrice = PricingEngine.calculateUnitPrice(product, newQty);
        const lineTotal = PricingEngine.calculateLineTotal(unitPrice, modifiersPrice, newQty);
        const updated = [...prev];
        updated[idx] = { ...existing, quantity: newQty, unitPrice, lineTotal };
        return updated;
      } else {
        const unitPrice = PricingEngine.calculateUnitPrice(product, quantity);
        const lineTotal = PricingEngine.calculateLineTotal(unitPrice, modifiersPrice, quantity);
        const newItem: CartItem = {
          cartItemId,
          productId: product.id,
          categoryId: product.categoryId,
          productName: product.name,
          productImage: product.imageUrl,
          basePrice: product.price,
          unitPrice,
          quantity,
          selectedModifiers,
          modifiersPrice,
          lineTotal,
          notes,
        };
        return [...prev, newItem];
      }
    });
  };

  const updateQuantity = (cartItemId: string, newQty: number) => {
    if (newQty <= 0) {
      setPosCart((prev) => {
        const nextCart = prev.filter((i) => i.cartItemId !== cartItemId);
        // Clean up batch selections if category empty
        return nextCart;
      });
      return;
    }
    setPosCart((prev) =>
      prev.map((item) => {
        if (item.cartItemId !== cartItemId) return item;
        const matchedProduct = products.find((p) => p.id === item.productId);
        const unitPrice = matchedProduct
          ? PricingEngine.calculateUnitPrice(matchedProduct, newQty)
          : item.unitPrice;
        const lineTotal = PricingEngine.calculateLineTotal(unitPrice, item.modifiersPrice, newQty);
        return { ...item, quantity: newQty, unitPrice, lineTotal };
      })
    );
  };

  // Hold Order
  const handleHoldCurrentOrder = () => {
    if (posCart.length === 0) return;
    const note = prompt('Beri catatan untuk pesanan ini (cth: Meja 3 / Kakak Baju Biru):') || 'Pesanan Parkir';
    const held: HeldOrder = {
      id: 'hold_' + Date.now(),
      note,
      items: [...posCart],
      heldAt: new Date().toISOString(),
      total,
    };
    setHeldOrders((prev) => [held, ...prev]);
    setPosCart([]);
    setDiscountAmount(0);
    setBatchSelections({});
    setIsMobileCartOpen(false);
  };

  // Recall Order
  const handleRecallOrder = (held: HeldOrder) => {
    setPosCart(held.items);
    setHeldOrders((prev) => prev.filter((h) => h.id !== held.id));
  };

  const handleDeleteHeld = (id: string) => {
    setHeldOrders((prev) => prev.filter((h) => h.id !== id));
  };

  // Validate before opening payment
  const handleOpenPayment = () => {
    if (posCart.length === 0) return;

    // Check batch modifier requirements
    for (const entry of batchModifierCategories) {
      const { isReq, minSelections, sel, selectedCount } = getBatchCategoryConfig(entry);
      if (isReq && selectedCount < minSelections) {
        try {
          alert(
            `Kategori "${entry.category.name}" wajib memilih bumbu/rasa (minimal ${minSelections} pilihan). Harap tentukan pilihan bumbu terlebih dahulu.`
          );
        } catch {
          // If browser/iframe blocks alert(), proceed to opening modal directly
        }
        setActiveBatchCategory(entry);
        return;
      }
    }

    setIsPaymentModalOpen(true);
  };

  // Render Bill / Cart component used in both desktop sidebar and mobile drawer
  const renderBillContent = (isMobileSheet = false) => {
    const totalItems = posCart.reduce((s, i) => s + i.quantity, 0);

    return (
      <div className="flex flex-col h-full justify-between">
        {/* Bill Header */}
        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-[#FF4500]" />
            <h3 className="font-heading font-extrabold text-sm text-[#2E1A47]">
              Struk Kasir ({totalItems})
            </h3>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handleHoldCurrentOrder}
              disabled={posCart.length === 0}
              className="p-1.5 rounded-lg text-gray-500 hover:text-amber-700 hover:bg-amber-50 disabled:opacity-40 transition-colors"
              title="Tahan Pesanan (Hold)"
            >
              <PauseCircle className="w-4 h-4" />
            </button>

            <button
              onClick={() => setIsHoldModalOpen(true)}
              className="relative p-1.5 rounded-lg text-gray-500 hover:text-[#2E1A47] hover:bg-purple-50 transition-colors"
              title="Panggil Pesanan (Recall)"
            >
              <PlayCircle className="w-4 h-4" />
              {heldOrders.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#FF4500] text-white text-[9px] font-extrabold flex items-center justify-center">
                  {heldOrders.length}
                </span>
              )}
            </button>

            <button
              onClick={() => {
                setPosCart([]);
                setBatchSelections({});
              }}
              disabled={posCart.length === 0}
              className="p-1.5 rounded-lg text-gray-500 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-40 transition-colors"
              title="Kosongkan Keranjang"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            {isMobileSheet && (
              <button
                onClick={() => setIsMobileCartOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors ml-1"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Bill Line Items + Batch Modifiers Section (Scrollable) */}
        <div className="flex-1 overflow-y-auto my-3 pr-1 space-y-3">
          {posCart.length === 0 ? (
            <div className="h-full min-h-[160px] flex flex-col items-center justify-center text-center text-gray-400 p-4">
              <Store className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-xs font-semibold">Pilih menu di samping untuk membuat struk.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {posCart.map((item) => (
                <div
                  key={item.cartItemId}
                  className="p-2.5 bg-gray-50/90 rounded-xl border border-gray-100 flex items-center justify-between gap-2"
                >
                  <div className="flex-1 min-w-0">
                    <h5 className="font-heading font-bold text-xs text-[#2E1A47] truncate">
                      {item.productName}
                    </h5>
                    {item.selectedModifiers.length > 0 && (
                      <p className="text-[10px] text-gray-500 truncate">
                        {item.selectedModifiers.map((m) => m.item.name).join(', ')}
                      </p>
                    )}
                    {item.notes && (
                      <p className="text-[10px] text-gray-400 italic truncate">
                        "{item.notes}"
                      </p>
                    )}
                    <p className="font-heading font-extrabold text-xs text-[#FF4500] mt-0.5">
                      Rp {item.lineTotal.toLocaleString('id-ID')}
                    </p>
                  </div>

                  {/* Quantity Stepper */}
                  <div className="flex items-center bg-white border border-gray-200 rounded-lg p-0.5 shadow-2xs">
                    <button
                      onClick={() => updateQuantity(item.cartItemId, item.quantity - 1)}
                      className="w-5 h-5 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded-sm"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-6 text-center text-xs font-bold text-[#2E1A47]">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQuantity(item.cartItemId, item.quantity + 1)}
                      className="w-5 h-5 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded-sm"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Batch Modifier Section for POS (Feature Lock 4) */}
          {batchModifierCategories.length > 0 && (
            <div className="mt-3 p-3 bg-purple-50/60 rounded-2xl border border-purple-100 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#FF4500]" />
                  <span className="font-heading font-extrabold text-[11px] text-[#2E1A47] uppercase tracking-wide">
                    Pilihan Bumbu / Rasa Kategori
                  </span>
                </div>
                <span className="text-[9px] font-bold text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded-md">
                  POS Batch
                </span>
              </div>

              <div className="space-y-1.5">
                {batchModifierCategories.map((entry) => {
                  const { isReq, minSelections, maxSelections, sel, selectedCount, isComplete } =
                    getBatchCategoryConfig(entry);
                  const groupName = entry.group.name || 'Bumbu';
                  const selectedNames =
                    sel?.selectedModifiers?.map((m) => m.modifierName) ||
                    sel?.options?.filter((o) => (o.quantity ?? 1) > 0).map((o) => o.modifierName) ||
                    [];

                  if (isComplete && selectedCount > 0) {
                    return (
                      <div
                        key={entry.category.id}
                        className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-300 flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs font-extrabold text-emerald-900 truncate">
                              ✓ {entry.category.name}: {groupName}
                            </p>
                            <p className="text-[10px] text-gray-700 truncate">
                              {selectedNames.join(', ')} ({selectedCount}/{maxSelections})
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveBatchCategory(entry)}
                          className="px-2 py-1 text-[11px] font-bold text-emerald-800 bg-white border border-emerald-300 rounded-lg hover:bg-emerald-100 transition-colors shrink-0"
                        >
                          Ubah
                        </button>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={entry.category.id}
                      className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 ${
                        isReq
                          ? 'bg-amber-50/80 border-amber-300'
                          : 'bg-gray-50 border-gray-200'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {isReq ? (
                          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                        ) : (
                          <Sparkles className="w-4 h-4 text-gray-400 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-gray-800 truncate">
                            {entry.category.name}: {groupName}
                          </p>
                          <p className="text-[10px] text-amber-700 font-medium truncate">
                            {isReq ? `Wajib dipilih (min ${minSelections})` : 'Opsional'}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveBatchCategory(entry)}
                        className={`px-2.5 py-1 text-[11px] font-bold rounded-lg shadow-2xs transition-all shrink-0 ${
                          isReq
                            ? 'bg-[#FF4500] text-white hover:bg-[#e03d00]'
                            : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        Pilih Bumbu
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Automatic Mix & Match Savings Banner (Feature Lock 3) */}
          {mixMatchDiscount > 0 && (
            <div className="p-2.5 bg-gradient-to-r from-purple-50 to-orange-50 rounded-xl border border-purple-200/80 text-xs">
              <div className="flex items-center justify-between text-[#2E1A47] font-extrabold">
                <div className="flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-[#FF4500]" />
                  <span>Promo Mix & Match Aktif</span>
                </div>
                <span className="text-emerald-700">
                  -Rp {mixMatchDiscount.toLocaleString('id-ID')}
                </span>
              </div>
              {mixMatchBundles && mixMatchBundles.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {mixMatchBundles.map((b, idx) => (
                    <span
                      key={idx}
                      className="text-[9px] bg-white/90 text-purple-900 px-1.5 py-0.5 rounded font-bold border border-purple-200"
                    >
                      {b.promoName || 'Mix & Match'} ({b.itemsDiscountedCount} pcs): -Rp {b.discount.toLocaleString('id-ID')}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bill Summary & Pay Action */}
        <div className="pt-3 border-t border-gray-100 space-y-2">
          <div className="space-y-1 text-xs text-gray-600">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span className="font-bold text-gray-900">Rp {subtotal.toLocaleString('id-ID')}</span>
            </div>

            {mixMatchDiscount > 0 && (
              <div className="flex justify-between text-emerald-700 font-semibold">
                <span>Diskon Mix & Match:</span>
                <span>-Rp {mixMatchDiscount.toLocaleString('id-ID')}</span>
              </div>
            )}

            <div className="flex justify-between items-center">
              <span>Potongan Manual Kasir:</span>
              <input
                type="number"
                placeholder="0"
                value={discountAmount || ''}
                onChange={(e) => setDiscountAmount(Math.max(0, Number(e.target.value) || 0))}
                className="w-24 text-right text-xs px-2 py-1 bg-gray-50 border border-gray-200 rounded-lg font-semibold text-rose-600 focus:outline-hidden focus:ring-1 focus:ring-[#FF4500]"
              />
            </div>

            <div className="flex justify-between text-sm font-heading font-extrabold text-[#2E1A47] pt-1 border-t border-gray-100">
              <span>Total Tagihan:</span>
              <span className="text-base text-[#FF4500]">Rp {total.toLocaleString('id-ID')}</span>
            </div>
          </div>

          {/* Pay Button */}
          <button
            id={isMobileSheet ? 'btn-pos-pay-mobile' : 'btn-pos-pay'}
            disabled={posCart.length === 0}
            onClick={handleOpenPayment}
            className="w-full clay-button-primary py-3 px-4 flex items-center justify-between text-sm font-bold shadow-lg disabled:opacity-50"
          >
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4" />
              <span>Bayar Sekarang</span>
            </div>
            <span>Rp {total.toLocaleString('id-ID')}</span>
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#F4F2F7] flex flex-col pb-20 lg:pb-0">
      {/* Top POS Header */}
      <header className="bg-[#2E1A47] text-white px-4 py-2.5 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          {settings?.logoUrl ? (
            <img
              src={settings.logoUrl}
              alt="Logo"
              className="w-8 h-8 rounded-lg object-cover shadow-xs bg-white border border-white/20 shrink-0"
            />
          ) : (
            <div className="w-8 h-8 rounded-lg bg-[#FF4500] flex items-center justify-center font-extrabold text-sm shadow-xs shrink-0">
              POS
            </div>
          )}
          <div>
            <h1 className="font-heading font-extrabold text-sm sm:text-base tracking-tight leading-none">
              {settings?.storeName || 'HUMA'} — Kasir POS
            </h1>
            <p className="text-[11px] text-gray-300 mt-0.5">
              Kasir: <span className="font-bold text-[#E1AD01]">{adminProfile?.name || 'Staff'}</span> ({role || 'CASHIER'})
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {lastCompletedOrder && (
            <button
              onClick={() => setIsReceiptModalOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Printer className="w-3.5 h-3.5 text-[#E1AD01]" />
              <span className="hidden sm:inline">Struk Terakhir</span>
            </button>
          )}

          {onOpenAdmin && (
            <button
              id="pos-open-admin-button"
              onClick={onOpenAdmin}
              className="px-3 py-1.5 rounded-xl bg-purple-500/30 hover:bg-purple-500/40 text-purple-100 border border-purple-400/40 text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs"
              title="Buka Dashboard & Manajemen Admin"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-[#E1AD01]" />
              <span>Panel Admin</span>
            </button>
          )}

          <button
            onClick={onExitPos}
            className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold flex items-center gap-1 transition-colors"
            title="Kembali ke Etalase Web"
          >
            <Store className="w-3.5 h-3.5 text-gray-300" />
            <span>Lihat Web</span>
          </button>
        </div>
      </header>

      {/* Main Split Layout: Catalog Grid (Left) + Register Bill (Right - Desktop) */}
      <div className="flex-1 flex flex-col lg:flex-row max-w-7xl w-full mx-auto p-3 sm:p-4 gap-4 overflow-hidden">
        {/* Left: Products & Search Section */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Search bar & Category scroll */}
          <div className="clay-card p-3 mb-3 space-y-2.5">
            {/* Search input */}
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Ketik nama menu atau kode..."
                className="w-full text-xs pl-9 pr-3 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:outline-hidden focus:ring-2 focus:ring-[#FF4500]/30"
              />
            </div>

            {/* Category pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              <button
                onClick={() => setSelectedCategoryId(null)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                  selectedCategoryId === null
                    ? 'bg-[#2E1A47] text-white shadow-xs'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Semua
              </button>
              {categories
                .filter((c) => c.isActive)
                .map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategoryId(cat.id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                      selectedCategoryId === cat.id
                        ? 'bg-[#FF4500] text-white shadow-xs'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {cat.name}
                  </button>
                ))}
            </div>
          </div>

          {/* Product Items Grid */}
          <div className="flex-1 overflow-y-auto pr-1">
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5">
              {filteredProducts.map((product) => {
                const prodModGroups = modifierGroups.filter(
                  (g) => product.modifierGroupIds?.includes(g.id) && g.isActive
                );
                return (
                  <button
                    key={product.id}
                    onClick={() => handleProductClick(product)}
                    className="clay-card p-2.5 text-left flex flex-col justify-between hover:border-[#2E1A47] active:scale-97 transition-all group"
                  >
                    <div className="relative h-24 sm:h-28 w-full rounded-xl overflow-hidden bg-gray-100 mb-2">
                      <img
                        src={product.imageUrl || '/trimmed_store.png'}
                        alt={product.name || 'Produk'}
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = '/trimmed_store.png';
                        }}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                      {product.wholesaleEnabled && (
                        <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded-md bg-[#E1AD01] text-[#2E1A47] text-[9px] font-extrabold shadow-xs">
                          Grosir
                        </span>
                      )}
                      {prodModGroups.length > 0 && (
                        <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded-md bg-black/60 text-white text-[9px] font-semibold">
                          +{prodModGroups.length} Opsi
                        </span>
                      )}
                    </div>

                    <div>
                      <h4 className="font-heading font-bold text-xs text-[#2E1A47] line-clamp-1">
                        {product.name}
                      </h4>
                      <p className="font-heading font-extrabold text-xs text-[#FF4500] mt-0.5">
                        Rp {product.price.toLocaleString('id-ID')}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: Cashier Register Bill Panel (Fixed on Desktop/Tablet >= lg) */}
        <div className="hidden lg:flex w-96 clay-card flex-col justify-between p-4 shadow-xl shrink-0 h-[650px] lg:h-auto overflow-hidden">
          {renderBillContent(false)}
        </div>
      </div>

      {/* Mobile Floating Cart Bar (Feature Lock 5) */}
      <div className="lg:hidden fixed bottom-3 left-3 right-3 z-40 bg-[#2E1A47] text-white p-3 rounded-2xl shadow-2xl flex items-center justify-between border border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-[#FF4500] flex items-center justify-center relative shadow-sm">
            <ShoppingBag className="w-5 h-5 text-white" />
            {posCart.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-white text-[#2E1A47] font-extrabold text-[10px] w-5 h-5 rounded-full flex items-center justify-center border-2 border-[#2E1A47]">
                {posCart.reduce((s, i) => s + i.quantity, 0)}
              </span>
            )}
          </div>
          <div>
            <p className="text-[10px] text-gray-300 font-medium">Tagihan Kasir</p>
            <p className="text-sm font-extrabold text-[#FF4500]">
              Rp {total.toLocaleString('id-ID')}
            </p>
          </div>
        </div>
        <button
          onClick={() => setIsMobileCartOpen(true)}
          className="clay-button-primary px-4 py-2 text-xs font-bold flex items-center gap-1.5"
        >
          <span>Buka Struk ({posCart.reduce((s, i) => s + i.quantity, 0)})</span>
        </button>
      </div>

      {/* Mobile Cart Bottom Sheet Drawer (Feature Lock 5) */}
      {isMobileCartOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 backdrop-blur-xs lg:hidden animate-fade-in">
          <div
            className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl p-4 shadow-2xl flex flex-col max-h-[85vh] h-auto overflow-hidden border border-gray-100"
            onClick={(e) => e.stopPropagation()}
          >
            {renderBillContent(true)}
          </div>
        </div>
      )}

      {/* Product Modifiers Dialog */}
      <ProductModifierModal
        product={modifierModalProduct}
        modifierGroups={modifierGroups}
        categories={categories}
        isOpen={!!modifierModalProduct}
        onClose={() => setModifierModalProduct(null)}
        onAddToCart={handleAddLineItem}
      />

      {/* Batch Modifier Dialog for POS (Feature Lock 4) */}
      {activeBatchCategory && (
        <BatchModifierModal
          isOpen={!!activeBatchCategory}
          onClose={() => setActiveBatchCategory(null)}
          categoryName={activeBatchCategory.category.name}
          categoryId={activeBatchCategory.category.id}
          modifierGroup={activeBatchCategory.group}
          targetQuantity={activeBatchCategory.totalQty}
          currentSelection={batchSelections[activeBatchCategory.category.id]}
          onSave={(selection) => {
            setBatchSelections((prev) => ({
              ...prev,
              [activeBatchCategory.category.id]: selection,
            }));
            setActiveBatchCategory(null);
          }}
          minSelections={activeBatchCategory.category.batchModifierMinSelection}
          maxSelections={activeBatchCategory.category.batchModifierMaxSelection}
          isRequired={activeBatchCategory.category.batchModifierRequired !== false}
        />
      )}

      {/* POS Payment Dialog */}
      <PosPaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        items={posCart}
        subtotal={subtotal}
        discount={totalDiscount}
        total={total}
        cashierName={adminProfile?.name || 'Kasir'}
        settings={settings}
        batchModifiers={Object.values(batchSelections)}
        mixMatchDiscount={mixMatchDiscount}
        onPaymentSuccess={(order) => {
          setLastCompletedOrder(order);
          setPosCart([]);
          setBatchSelections({});
          setDiscountAmount(0);
          setIsMobileCartOpen(false);
          setIsReceiptModalOpen(true);
        }}
      />

      {/* POS Hold / Recall Dialog */}
      <PosHoldOrdersModal
        isOpen={isHoldModalOpen}
        onClose={() => setIsHoldModalOpen(false)}
        heldOrders={heldOrders}
        onRecallOrder={handleRecallOrder}
        onDeleteHeldOrder={handleDeleteHeld}
      />

      {/* Thermal Receipt Preview & Print Dialog */}
      <ThermalReceiptModal
        order={lastCompletedOrder}
        settings={settings}
        isOpen={isReceiptModalOpen}
        onClose={() => setIsReceiptModalOpen(false)}
      />
    </div>
  );
};
