import React, { useState, useMemo } from 'react';
import {
  Product,
  Category,
  ModifierGroup,
  CartItem,
  Order,
  StoreSettings,
  SelectedModifier,
  Promo,
  OrderGroup,
} from '../../types';
import { PricingEngine } from '../../services/pricingEngine';
import { PosPaymentModal } from './PosPaymentModal';
import { PosHoldOrdersModal, HeldOrder } from './PosHoldOrdersModal';
import { ThermalReceiptModal } from './ThermalReceiptModal';
import { ProductModifierModal } from '../customer/ProductModifierModal';
import { BatchModifierModal } from '../customer/BatchModifierModal';
import { OrderGroupModal } from '../customer/OrderGroupModal';
import { OrderEngine } from '../../services/orderEngine';
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
  Layers,
  ShoppingBag,
  ShieldCheck,
} from 'lucide-react';

interface PosLayoutProps {
  products: Product[];
  categories: Category[];
  modifierGroups: ModifierGroup[];
  settings: StoreSettings | null;
  promos: Promo[];
  onExitPos: () => void;
  onOpenAdmin?: () => void;
}

export const PosLayout: React.FC<PosLayoutProps> = ({
  products,
  categories,
  modifierGroups,
  settings,
  promos,
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
  const [mobilePosTab, setMobilePosTab] = useState<'PRODUCTS' | 'ORDER'>('PRODUCTS');

  // Modals state
  const [modifierModalProduct, setModifierModalProduct] = useState<Product | null>(null);
  const [batchModifierProduct, setBatchModifierProduct] = useState<Product | null>(null);
  const [activeOrderGroupCategory, setActiveOrderGroupCategory] = useState<Category | null>(null);
  const [editingOrderGroup, setEditingOrderGroup] = useState<OrderGroup | null>(null);
  const [orderGroups, setOrderGroups] = useState<OrderGroup[]>([]);
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

  // Calculations
  const groupedSubtotal = useMemo(
    () => orderGroups.reduce((sum, group) => sum + OrderEngine.calculateGroupSubtotal(group), 0),
    [orderGroups]
  );
  const subtotal = useMemo(() => {
    return posCart.reduce((sum, item) => sum + item.lineTotal, 0) + groupedSubtotal;
  }, [posCart, groupedSubtotal]);

  // Automatic Mix & Match quantity-based promotion
  const mixMatchItems = useMemo(
    () => [...posCart, ...OrderEngine.flattenGroups(orderGroups)],
    [posCart, orderGroups]
  );
  const mixMatchResult = useMemo(() => {
    return PricingEngine.calculateMixMatchDiscounts(mixMatchItems, promos);
  }, [mixMatchItems, promos]);

  const mixMatchDiscount = mixMatchResult.discount;
  const mixMatchGroupDiscounts = mixMatchResult.groupDiscounts || {};
  const totalDiscount = mixMatchDiscount + discountAmount;
  const total = Math.max(0, subtotal - totalDiscount);

  // Fast add product to POS cart
  const handleProductClick = (product: Product) => {
    if (!product.isAvailable) return;
    const category = categories.find((c) => c.id === product.categoryId);
    if (OrderEngine.getOrderingConfig(category).groupingEnabled) {
      setActiveOrderGroupCategory(category || null);
      return;
    }
    const isBatchCategory =
      category?.batchModifierEnabled === true &&
      !!category.batchModifierGroupId;

    if (isBatchCategory) {
      setBatchModifierProduct(product);
      return;
    }

    const prodModGroups = modifierGroups.filter(
      (g) => product.modifierGroupIds?.includes(g.id) && g.isActive
    );

    if (prodModGroups.length > 0) {
      setModifierModalProduct(product);
    } else {
      handleAddLineItem(product, 1, []);
    }
  };

  const handleAddLineItem = (
    product: Product,
    quantity: number,
    selectedModifiers: SelectedModifier[],
    notes?: string,
    batchModifiers: import('../../types').BatchModifierSelection[] = []
  ) => {
    const safeNotes = typeof notes === 'string' ? notes.trim() : '';
    const modSignature = (selectedModifiers || [])
      .map((m) => `${m.groupId}:${m.item?.id || ''}`)
      .sort()
      .join('|');
    const batchSignature = (batchModifiers || [])
      .map((b) => `${b.categoryId}:${b.modifierGroupId}:${(b.selectedModifiers || []).map((m) => m.modifierId).sort().join(',')}`)
      .sort()
      .join('|');
    const cartItemId = `pos_${product.id}_${modSignature}_${batchSignature}_${safeNotes}`;
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
          productName: product.name,
          productImage: product.imageUrl,
          basePrice: product.price,
          unitPrice,
          quantity,
          selectedModifiers,
          modifiersPrice,
          lineTotal,
          notes,
          categoryId: product.categoryId,
          batchModifiers: batchModifiers.length > 0 ? batchModifiers : undefined,
        };
        return [...prev, newItem];
      }
    });
  };

  const updateQuantity = (cartItemId: string, newQty: number) => {
    if (newQty <= 0) {
      setPosCart((prev) => prev.filter((i) => i.cartItemId !== cartItemId));
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
  const handleAddOrderGroup = (group: OrderGroup) => {
    setOrderGroups((prev) => [...prev, group]);
  };

  const handleUpdateOrderGroup = (groupId: string, patch: Partial<Pick<OrderGroup, 'categoryId' | 'items' | 'modifiers' | 'note'>>) => {
    setOrderGroups((prev) => prev.map((group) => group.id === groupId ? OrderEngine.updateGroup(group, patch) : group));
  };

  const handleDeleteOrderGroup = (groupId: string) => {
    setOrderGroups((prev) => OrderEngine.deleteGroup(prev, groupId));
  };

  const handleHoldCurrentOrder = () => {
    if (posCart.length === 0 && orderGroups.length === 0) return;
    const note = prompt('Beri catatan untuk pesanan ini (cth: Meja 3 / Kakak Baju Biru):') || 'Pesanan Parkir';
    const held: HeldOrder = {
      id: 'hold_' + Date.now(),
      note,
      items: [...posCart],
      groups: orderGroups.map((group) => ({ ...group, items: group.items.map((item) => ({ ...item })), modifiers: group.modifiers.map((modifier) => ({ ...modifier })) })),
      heldAt: new Date().toISOString(),
      total,
    };
    setHeldOrders((prev) => [held, ...prev]);
    setPosCart([]);
    setOrderGroups([]);
    setDiscountAmount(0);
  };

  // Recall Order
  const handleRecallOrder = (held: HeldOrder) => {
    setPosCart(held.items);
    setOrderGroups(held.groups || []);
    setHeldOrders((prev) => prev.filter((h) => h.id !== held.id));
  };

  const handleDeleteHeld = (id: string) => {
    setHeldOrders((prev) => prev.filter((h) => h.id !== id));
  };

  return (
    <div className="min-h-screen bg-[#F4F2F7] flex flex-col">
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

      {/* Main Split Layout: Catalog Grid (Left) + Register Bill (Right) */}
      <div className="flex-1 flex flex-col lg:flex-row max-w-7xl w-full mx-auto p-3 sm:p-4 gap-4 overflow-hidden">
        {/* Mobile POS navigation */}
        <div className="lg:hidden sticky top-0 z-20 flex gap-2 mb-2">
          <button
            onClick={() => setMobilePosTab('PRODUCTS')}
            className={`flex-1 py-2.5 rounded-xl text-xs font-extrabold transition-all ${
              mobilePosTab === 'PRODUCTS'
                ? 'bg-[#2E1A47] text-white shadow-md'
                : 'bg-white text-gray-600 border border-gray-200'
            }`}
          >
            Menu
          </button>
          <button
            onClick={() => setMobilePosTab('ORDER')}
            className={`flex-1 py-2.5 rounded-xl text-xs font-extrabold transition-all ${
              mobilePosTab === 'ORDER'
                ? 'bg-[#FF4500] text-white shadow-md'
                : 'bg-white text-gray-600 border border-gray-200'
            }`}
          >
            Pesanan ({posCart.reduce((s, i) => s + i.quantity, 0)})
          </button>
        </div>
        {/* Left: Products & Search Section */}
        <div className={`flex-1 flex flex-col min-w-0 ${mobilePosTab === 'ORDER' ? 'hidden lg:flex' : 'flex'}`}>
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
                        src={product.imageUrl}
                        alt={product.name}
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

        {/* Right: Cashier Register Bill Panel */}
        <div className={`${mobilePosTab === 'PRODUCTS' ? 'hidden lg:flex' : 'flex'} w-full lg:w-96 clay-card flex-col justify-between p-4 shadow-xl shrink-0 h-[calc(100vh-120px)] lg:h-auto`}>
          {/* Mobile back button */}
          <button
            onClick={() => setMobilePosTab('PRODUCTS')}
            className="lg:hidden mb-3 w-full py-2 rounded-xl bg-gray-100 text-[#2E1A47] text-xs font-bold"
          >
            ← Kembali ke Menu
          </button>

          {/* Bill Header */}
          <div className="flex items-center justify-between pb-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-[#FF4500]" />
              <h3 className="font-heading font-extrabold text-sm text-[#2E1A47]">
                Struk Kasir ({posCart.reduce((s, i) => s + i.quantity, 0)})
              </h3>
            </div>

            {/* Hold / Recall buttons */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleHoldCurrentOrder}
                disabled={posCart.length === 0 && orderGroups.length === 0}
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
                onClick={() => setPosCart([])}
                disabled={posCart.length === 0}
                className="p-1.5 rounded-lg text-gray-500 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-40 transition-colors"
                title="Kosongkan Keranjang"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Bill Line Items (Scrollable) */}
          <div className="flex-1 overflow-y-auto my-3 pr-1 space-y-2">
            {posCart.length === 0 && orderGroups.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 p-4">
                <Store className="w-10 h-10 mb-2 opacity-30" />
                <p className="text-xs font-semibold">Pilih menu di samping untuk membuat struk.</p>
              </div>
            ) : (
              <>
                {orderGroups.map((group, index) => (
                  <div key={group.id} className="p-2.5 bg-purple-50/70 rounded-xl border border-purple-100">
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-[10px] font-extrabold text-purple-700">GROUP {index + 1}</div>
                      <div className="flex gap-1">
                        <button type="button" onClick={() => {
                          const category = categories.find((c) => c.id === group.categoryId);
                          if (category) { setEditingOrderGroup(group); setActiveOrderGroupCategory(category); }
                        }} className="text-[10px] font-bold px-2 py-1 bg-white rounded-lg border">Edit</button>
                        <button type="button" onClick={() => handleDeleteOrderGroup(group.id)} className="text-[10px] font-bold px-2 py-1 bg-white rounded-lg border border-rose-100 text-rose-600">Hapus</button>
                      </div>
                    </div>
                    {group.items.map((item) => (
                      <div key={item.id} className="flex justify-between text-xs py-0.5">
                        <span>{item.name} × {item.quantity}</span><span>Rp {item.subtotal.toLocaleString('id-ID')}</span>
                      </div>
                    ))}
                    {group.modifiers.length > 0 && <div className="text-[10px] text-purple-700 mt-1">Bumbu: {group.modifiers.map((m) => m.name).join(', ')}</div>}
                    <div className="text-right mt-1">
                      {mixMatchGroupDiscounts[group.id] > 0 && (
                        <div className="text-[10px] text-emerald-700 font-extrabold">
                          Mix & Match -Rp {mixMatchGroupDiscounts[group.id].toLocaleString('id-ID')}
                        </div>
                      )}
                      <div className="text-xs font-extrabold text-[#2E1A47]">
                        Rp {Math.max(0, group.subtotal - (mixMatchGroupDiscounts[group.id] || 0)).toLocaleString('id-ID')}
                      </div>
                    </div>
                  </div>
                ))}
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
              </>
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
                <div className="flex justify-between text-emerald-600 font-semibold">
                  <span>Diskon Mix & Match:</span>
                  <span>- Rp {mixMatchDiscount.toLocaleString('id-ID')}</span>
                </div>
              )}

              <div className="flex justify-between items-center">
                <span>Potongan Kasir:</span>
                <input
                  type="number"
                  placeholder="0"
                  value={discountAmount || ''}
                  onChange={(e) => setDiscountAmount(Math.max(0, Number(e.target.value) || 0))}
                  className="w-24 text-right text-xs px-2 py-1 bg-gray-50 border border-gray-200 rounded-lg font-semibold text-rose-600"
                />
              </div>
              <div className="flex justify-between text-sm font-heading font-extrabold text-[#2E1A47] pt-1 border-t border-gray-100">
                <span>Total Tagihan:</span>
                <span className="text-base text-[#FF4500]">Rp {total.toLocaleString('id-ID')}</span>
              </div>
            </div>

            {/* Pay Button */}
            <button
              id="btn-pos-pay"
              disabled={posCart.length === 0 && orderGroups.length === 0}
              onClick={() => setIsPaymentModalOpen(true)}
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
      </div>

      {/* Modifiers Dialog */}
      <ProductModifierModal
        product={modifierModalProduct}
        modifierGroups={modifierGroups}
        categories={categories}
        isOpen={!!modifierModalProduct}
        onClose={() => setModifierModalProduct(null)}
        onAddToCart={handleAddLineItem}
      />

      {/* Batch Modifier Dialog */}
      {batchModifierProduct && (() => {
        const category = categories.find((c) => c.id === batchModifierProduct.categoryId);
        const group = category?.batchModifierGroupId
          ? modifierGroups.find((g) => g.id === category.batchModifierGroupId)
          : undefined;

        if (!category || !group) return null;

        return (
          <BatchModifierModal
            isOpen={!!batchModifierProduct}
            onClose={() => setBatchModifierProduct(null)}
            categoryId={category.id}
            categoryName={category.name}
            modifierGroup={group}
            isRequired={category.batchModifierRequired !== false}
            minSelections={category.batchModifierMinSelection}
            maxSelections={category.batchModifierMaxSelection}
            targetQuantity={1}
            mode={category.batchModifierMode || 'POOL'}
            onSave={(selection) => {
              handleAddLineItem(
                batchModifierProduct,
                1,
                [],
                undefined,
                [selection]
              );
              setBatchModifierProduct(null);
            }}
          />
        );
      })()}

      <OrderGroupModal
        isOpen={!!activeOrderGroupCategory}
        category={activeOrderGroupCategory}
        products={products}
        modifierGroups={modifierGroups}
        promos={promos}
        orderGroups={orderGroups}
        existingGroup={editingOrderGroup}
        onClose={() => { setActiveOrderGroupCategory(null); setEditingOrderGroup(null); }}
        onSave={(group) => {
          if (editingOrderGroup) handleUpdateOrderGroup(group.id, group);
          else handleAddOrderGroup(group);
        }}
      />

      {/* POS Payment Dialog */}
      <PosPaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        items={posCart}
        groups={orderGroups}
        subtotal={subtotal}
        discount={discountAmount}
        total={total}
        cashierName={adminProfile?.name || 'Kasir'}
        settings={settings}
        onPaymentSuccess={(order) => {
          setLastCompletedOrder(order);
          setPosCart([]);
          setDiscountAmount(0);
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
