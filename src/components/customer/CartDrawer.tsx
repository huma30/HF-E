import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Plus,
  Minus,
  Trash2,
  ShoppingBag,
  ArrowRight,
  Tag,
  Check,
  AlertCircle,
  MessageCircle,
  ChevronRight,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { Product, Promo, StoreSettings, Category, ModifierGroup } from '../../types';
import { BatchModifierModal } from './BatchModifierModal';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onProceedToCheckout: () => void;
  allProducts: Product[];
  availablePromos: Promo[];
  settings?: StoreSettings | null;
  categories?: Category[];
  modifierGroups?: ModifierGroup[];
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  onProceedToCheckout,
  allProducts,
  availablePromos,
  settings,
  categories = [],
  modifierGroups = [],
}) => {
  const {
    items,
    itemCount,
    subtotal,
    discount,
    mixMatchDiscount,
    mixMatchBundles,
    deliveryFee,
    total,
    appliedPromo,
    updateItemQuantity,
    removeItem,
    clearCart,
    applyPromo,
    removePromo,
    serviceType,
    batchSelections,
    setBatchSelection,
  } = useCart();

  const [promoInput, setPromoInput] = useState('');
  const [promoError, setPromoError] = useState<string | null>(null);
  const [batchValidationError, setBatchValidationError] = useState<string | null>(null);

  // Active category for BatchModifierModal
  const [activeBatchCategory, setActiveBatchCategory] = useState<{
    category: Category;
    group: ModifierGroup;
    totalQty: number;
  } | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);

  // Detect which categories in cart require Batch Modifiers
  const batchModifierCategories = useMemo(() => {
    if (!categories || categories.length === 0 || !items || items.length === 0) return [];
    return categories
      .filter((cat) => (cat.batchModifierEnabled && cat.batchModifierGroupId) || cat.name.toLowerCase().includes('goreng'))
      .map((cat) => {
        const matchingItems = items.filter((it) => {
          if (it.categoryId) return it.categoryId === cat.id;
          const product = allProducts?.find((p) => p.id === it.productId);
          return product?.categoryId === cat.id;
        });
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
  }, [categories, items, modifierGroups, allProducts]);

  // Helper to resolve batch category configuration and completion status
  const getBatchCategoryConfig = useCallback((entry: { category: Category; group: ModifierGroup; totalQty: number }) => {
    const isGorengan = entry.category.name.toLowerCase().includes('goreng');
    const isReq = isGorengan || entry.category.batchModifierRequired !== false;
    const minSelections = entry.category.batchModifierMinSelection !== undefined
      ? Math.max(isGorengan ? 1 : 0, Number(entry.category.batchModifierMinSelection))
      : (entry.group.minSelection !== undefined ? Math.max(1, Number(entry.group.minSelection)) : (isReq ? 1 : 0));
    const effectiveMin = isReq ? Math.max(1, minSelections) : minSelections;

    const maxSelections = entry.category.batchModifierMaxSelection !== undefined && Number(entry.category.batchModifierMaxSelection) > 0
      ? Number(entry.category.batchModifierMaxSelection)
      : (entry.group.maxSelection !== undefined && Number(entry.group.maxSelection) > 0 ? Number(entry.group.maxSelection) : 2);
    const effectiveMax = Math.max(effectiveMin, maxSelections);

    const sel = batchSelections[entry.category.id];
    const selectedCount = sel
      ? (sel.selectedModifiers?.length ?? sel.options?.filter((o) => (o.quantity ?? 1) > 0).length ?? 0)
      : 0;

    const isComplete = isReq
      ? selectedCount >= effectiveMin && selectedCount <= effectiveMax
      : selectedCount <= effectiveMax;

    return {
      isReq,
      minSelections: effectiveMin,
      maxSelections: effectiveMax,
      sel,
      selectedCount,
      isComplete,
    };
  }, [batchSelections]);

  // Explicit Bumbu Status (Section E: NOT_REQUIRED | REQUIRED_NOT_SELECTED | SELECTED)
  const bumbuStatus = useMemo((): 'NOT_REQUIRED' | 'REQUIRED_NOT_SELECTED' | 'SELECTED' => {
    if (batchModifierCategories.length === 0) return 'NOT_REQUIRED';
    const hasIncomplete = batchModifierCategories.some((entry) => {
      const { isComplete } = getBatchCategoryConfig(entry);
      return !isComplete;
    });
    return hasIncomplete ? 'REQUIRED_NOT_SELECTED' : 'SELECTED';
  }, [batchModifierCategories, getBatchCategoryConfig]);

  const hasIncompleteBatchModifiers = bumbuStatus === 'REQUIRED_NOT_SELECTED';

  // Clear validation error when all batch modifiers are complete or not required
  useEffect(() => {
    if (bumbuStatus !== 'REQUIRED_NOT_SELECTED') {
      setBatchValidationError(null);
    }
  }, [bumbuStatus]);

  // Guarded checkout proceed handler
  const handleProceedCheckout = () => {
    if (items.length === 0 || isNavigating) return;

    // Strict validation: if bumbu is required but incomplete, BLOCK checkout
    if (bumbuStatus === 'REQUIRED_NOT_SELECTED') {
      setBatchValidationError('Bumbu belum dipilih. Silakan pilih bumbu terlebih dahulu sebelum melanjutkan.');
      const firstIncomplete = batchModifierCategories.find((entry) => {
        const { isComplete } = getBatchCategoryConfig(entry);
        return !isComplete;
      });
      if (firstIncomplete) {
        setActiveBatchCategory(firstIncomplete);
      }
      return;
    }

    setIsNavigating(true);
    setBatchValidationError(null);
    try {
      onProceedToCheckout();
    } finally {
      setTimeout(() => setIsNavigating(false), 500);
    }
  };

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleApplyPromoCode = (e: React.FormEvent) => {
    e.preventDefault();
    setPromoError(null);
    const cleaned = promoInput.trim().toUpperCase();
    if (!cleaned) return;

    const matched = availablePromos.find(
      (p) => p?.code && String(p.code).trim().toUpperCase() === cleaned && p.isActive
    );
    if (!matched) {
      setPromoError('Kode promo tidak ditemukan atau sudah tidak aktif.');
      return;
    }

    const res = applyPromo(matched);
    if (!res.success) {
      setPromoError(res.message || 'Syarat promo belum terpenuhi.');
    } else {
      setPromoInput('');
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Backdrop with fade animation */}
          <motion.div
            key="cart-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="fixed inset-0 bg-black/50 backdrop-blur-xs"
            onClick={onClose}
          />

          <div className="fixed inset-y-0 right-0 w-full max-w-md flex pointer-events-none z-50 justify-end">
            {/* Drawer with spring slide-in and drag-to-dismiss gesture */}
            <motion.div
              key="cart-drawer-panel"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={{ right: 0.7, left: 0 }}
              onDragEnd={(_, info) => {
                if (info.offset.x > 75 || info.velocity.x > 300) {
                  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
                    try {
                      navigator.vibrate(15);
                    } catch {}
                  }
                  onClose();
                }
              }}
              className="relative w-full h-full bg-white shadow-2xl flex flex-col justify-between pointer-events-auto touch-pan-y overflow-hidden"
            >
              {/* Header */}
              <div className="p-4 sm:p-5 border-b border-gray-100 flex items-center justify-between bg-[#FBFBFC]">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-[#2E1A47] text-white flex items-center justify-center shadow-xs">
                    <ShoppingBag className="w-4 h-4 text-[#FF4500]" />
                  </div>
                  <div>
                    <h3 className="font-heading font-extrabold text-base text-[#2E1A47]">
                      Keranjang Belanja
                    </h3>
                    <p className="text-[11px] text-gray-500 font-medium">
                      {itemCount} item terpilih
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {items.length > 0 && (
                    <button
                      onClick={clearCart}
                      className="text-xs text-rose-600 hover:text-rose-700 font-semibold px-2 py-1 rounded-lg hover:bg-rose-50 transition-colors"
                    >
                      Kosongkan
                    </button>
                  )}
                  <button
                    onClick={onClose}
                    className="p-1.5 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Items List (Scrollable) */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
                {items.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6">
                    <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 mb-3">
                      <ShoppingBag className="w-8 h-8" />
                    </div>
                    <h4 className="font-heading font-bold text-base text-gray-800">
                      Keranjang Masih Kosong
                    </h4>
                    <p className="text-xs text-gray-500 max-w-xs mt-1">
                      Pilih menu favoritmu seperti Seblak Spesial atau Mie Jebew untuk mulai jajan.
                    </p>
                  </div>
                ) : (
                  <AnimatePresence initial={false}>
                    {items.map((item) => (
                      <motion.div
                        key={item.cartItemId}
                        layout
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.18 }}
                        className="p-3 bg-gray-50/80 rounded-2xl border border-gray-100 flex gap-3 relative"
                      >
                        <img
                          src={item.productImage}
                          alt={item.productName}
                          className="w-16 h-16 rounded-xl object-cover shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-1">
                            <h5 className="font-heading font-bold text-xs sm:text-sm text-[#2E1A47] truncate">
                              {item.productName}
                            </h5>
                            <button
                              onClick={() => removeItem(item.cartItemId)}
                              className="text-gray-400 hover:text-rose-600 transition-colors p-0.5"
                              title="Hapus menu"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Selected Modifiers list */}
                          {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {item.selectedModifiers.map((mod, idx) => (
                                <span
                                  key={idx}
                                  className="text-[10px] bg-purple-50 text-[#2E1A47] px-1.5 py-0.5 rounded-md font-medium border border-purple-100/80"
                                >
                                  {mod.item.name}
                                  {mod.item.price > 0 && ` (+${mod.item.price.toLocaleString('id-ID')})`}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Item Notes */}
                          {item.notes && (
                            <p className="text-[10px] text-gray-400 italic mt-0.5 truncate">
                              "{item.notes}"
                            </p>
                          )}

                          {/* Price & Quantity Controls */}
                          <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-gray-200/50">
                            <span className="font-bold text-xs text-[#2E1A47]">
                              Rp {item.lineTotal.toLocaleString('id-ID')}
                            </span>

                            <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg p-0.5 shadow-2xs">
                              <button
                                onClick={() => updateItemQuantity(item.cartItemId, item.quantity - 1, allProducts)}
                                className="w-5 h-5 flex items-center justify-center text-gray-500 hover:text-gray-800 rounded-sm hover:bg-gray-100 transition-colors"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="text-xs font-bold text-gray-800 min-w-4 text-center">
                                {item.quantity}
                              </span>
                              <button
                                onClick={() => updateItemQuantity(item.cartItemId, item.quantity + 1, allProducts)}
                                className="w-5 h-5 flex items-center justify-center text-gray-500 hover:text-gray-800 rounded-sm hover:bg-gray-100 transition-colors"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                )}
              </div>

              {/* Footer Section */}
              {items.length > 0 && (
                <div className="p-4 sm:p-5 border-t border-gray-100 bg-[#FBFBFC] space-y-3">
                  {/* Batch Modifiers (Pilihan Bumbu) Section - Relocated right above Kupon / Kode Promo */}
                  {batchModifierCategories.length > 0 && (
                    <div id="section-batch-modifiers" className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Sparkles className="w-4 h-4 text-[#FF4500]" />
                          <h5 className="font-heading font-extrabold text-xs text-[#2E1A47] uppercase tracking-wide">
                            Pilihan Bumbu & Rasa
                          </h5>
                        </div>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            bumbuStatus === 'SELECTED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : batchValidationError
                              ? 'bg-rose-100 text-rose-800 animate-pulse'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {bumbuStatus === 'SELECTED' ? 'Sudah Lengkap' : 'Wajib Dipilih'}
                        </span>
                      </div>

                      <div className="space-y-2">
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
                                className="p-3 bg-emerald-50/80 rounded-xl border border-emerald-300 shadow-2xs flex items-center justify-between gap-2"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                                  <div className="min-w-0">
                                    <p className="text-xs font-extrabold text-emerald-900 truncate">
                                      ✓ {groupName} sudah dipilih ({selectedCount}/{maxSelections})
                                    </p>
                                    <p className="text-[11px] text-gray-700 font-medium truncate">
                                      {groupName}: {selectedNames.join(', ')}
                                    </p>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setActiveBatchCategory(entry)}
                                  className="px-2.5 py-1 text-xs font-bold text-emerald-800 bg-white border border-emerald-300 rounded-lg hover:bg-emerald-100 transition-colors shrink-0"
                                >
                                  Ubah
                                </button>
                              </div>
                            );
                          }

                          // Optional with 0 chosen
                          if (!isReq && selectedCount === 0) {
                            return (
                              <div
                                key={entry.category.id}
                                className="p-3 bg-gray-50 rounded-xl border border-gray-200 flex items-center justify-between gap-2"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <Sparkles className="w-4 h-4 text-gray-400 shrink-0" />
                                  <div className="min-w-0">
                                    <p className="text-xs font-bold text-gray-700 truncate">
                                      {groupName} (Opsional • 0/{maxSelections})
                                    </p>
                                    <p className="text-[11px] text-gray-500 font-medium truncate">
                                      Belum memilih bumbu
                                    </p>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setActiveBatchCategory(entry)}
                                  className="px-2.5 py-1 text-xs font-bold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors shrink-0"
                                >
                                  Pilih Bumbu
                                </button>
                              </div>
                            );
                          }

                          // Incomplete required bumbu (Wording matches Section R: e.g. "Bumbu (Wajib • 0/2)")
                          return (
                            <div
                              key={entry.category.id}
                              className={`p-3 bg-amber-50/80 rounded-xl border ${
                                batchValidationError ? 'border-rose-400 ring-2 ring-rose-200' : 'border-amber-300'
                              } shadow-2xs flex items-center justify-between gap-2`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 animate-pulse" />
                                <div className="min-w-0">
                                  <p className="text-xs font-extrabold text-amber-900">
                                    {groupName} ({isReq ? 'Wajib' : 'Opsional'} • {selectedCount}/{maxSelections})
                                  </p>
                                  <p className="text-[11px] text-amber-800 font-medium truncate">
                                    {selectedCount === 0
                                      ? `Belum memilih ${groupName.toLowerCase()} (wajib pilih minimal ${minSelections})`
                                      : `Pilih minimal ${minSelections} dan maksimal ${maxSelections} ${groupName.toLowerCase()}`}
                                  </p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => setActiveBatchCategory(entry)}
                                className="clay-button-primary px-3 py-1.5 text-xs font-extrabold whitespace-nowrap shadow-xs shrink-0"
                              >
                                {selectedCount > 0 ? 'Lengkapi Bumbu' : 'Pilih Bumbu'}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Promo Code Input */}
                  <div>
                    {appliedPromo ? (
                      <div className="flex items-center justify-between p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs">
                        <div className="flex items-center gap-1.5 text-emerald-800 font-bold">
                          <Check className="w-4 h-4 text-emerald-600" />
                          <span>Promo: {appliedPromo.code}</span>
                        </div>
                        <button
                          onClick={removePromo}
                          className="text-xs text-rose-600 hover:text-rose-800 font-semibold"
                        >
                          Hapus
                        </button>
                      </div>
                    ) : (
                      <form onSubmit={handleApplyPromoCode} className="space-y-1">
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <Tag className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-2.5" />
                            <input
                              type="text"
                              placeholder="Kupon / Kode Promo"
                              value={promoInput}
                              onChange={(e) => setPromoInput(e.target.value)}
                              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-gray-200 uppercase font-bold focus:outline-hidden focus:border-[#2E1A47] bg-white"
                            />
                          </div>
                          <button
                            type="submit"
                            className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-[#2E1A47] rounded-xl text-xs font-bold transition-colors"
                          >
                            Pakai
                          </button>
                        </div>
                        {promoError && (
                          <div className="flex items-center gap-1 text-[11px] text-rose-600 mt-1">
                            <AlertCircle className="w-3 h-3 shrink-0" />
                            <span>{promoError}</span>
                          </div>
                        )}
                      </form>
                    )}
                  </div>

                  {/* Price Breakdown */}
                  <div className="space-y-1.5 text-xs text-gray-600 pt-1">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500">Subtotal</span>
                      <span className="font-semibold text-gray-900 shrink-0 whitespace-nowrap">
                        Rp {subtotal.toLocaleString('id-ID')}
                      </span>
                    </div>
                    {discount > 0 && (
                      <div className="flex justify-between items-center text-emerald-600 font-semibold">
                        <span className="truncate pr-2">Diskon Promo {mixMatchDiscount > 0 ? '(Mix & Match)' : ''}</span>
                        <span className="shrink-0 whitespace-nowrap">-Rp {discount.toLocaleString('id-ID')}</span>
                      </div>
                    )}
                    {serviceType === 'DELIVERY' && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-500">Ongkos Kirim (estimasi)</span>
                        <span className="font-semibold text-gray-900 shrink-0 whitespace-nowrap">
                          {deliveryFee === 0 ? 'Gratis' : `Rp ${deliveryFee.toLocaleString('id-ID')}`}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between items-center text-sm font-heading font-extrabold text-[#2E1A47] pt-2 border-t border-gray-100">
                      <span>Total Bayar</span>
                      <span className="text-base text-[#FF4500] shrink-0 whitespace-nowrap">
                        Rp {total.toLocaleString('id-ID')}
                      </span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="space-y-2 pt-1">
                    {/* Primary: Checkout & Order */}
                    <button
                      id="btn-proceed-checkout"
                      onClick={handleProceedCheckout}
                      disabled={isNavigating}
                      className={`w-full py-3 px-4 flex items-center justify-between text-xs sm:text-sm font-bold shadow-lg rounded-2xl transition-all ${
                        bumbuStatus === 'REQUIRED_NOT_SELECTED'
                          ? 'bg-amber-500 hover:bg-amber-600 text-white cursor-pointer ring-2 ring-amber-300'
                          : 'clay-button-primary'
                      }`}
                    >
                      <span className="flex items-center gap-1.5 min-w-0 pr-2">
                        <MessageCircle className={`w-4 h-4 shrink-0 ${bumbuStatus === 'REQUIRED_NOT_SELECTED' ? 'text-white' : 'text-emerald-300'}`} />
                        <span className="truncate">
                          {bumbuStatus === 'REQUIRED_NOT_SELECTED' ? 'Lengkapi Pilihan Bumbu Dahulu' : 'Lanjut ke Pesan Sekarang'}
                        </span>
                      </span>
                      <div className="flex items-center gap-1 shrink-0 whitespace-nowrap">
                        <span>Rp {total.toLocaleString('id-ID')}</span>
                        <ArrowRight className="w-4 h-4" />
                      </div>
                    </button>
                  </div>
                </div>
              )}

              {/* Batch Modifier Modal */}
              {activeBatchCategory && (
                <BatchModifierModal
                  isOpen={!!activeBatchCategory}
                  onClose={() => setActiveBatchCategory(null)}
                  categoryId={activeBatchCategory.category.id}
                  categoryName={activeBatchCategory.category.name}
                  modifierGroup={activeBatchCategory.group}
                  isRequired={activeBatchCategory.category.batchModifierRequired !== false}
                  minSelections={activeBatchCategory.category.batchModifierMinSelection}
                  maxSelections={activeBatchCategory.category.batchModifierMaxSelection}
                  targetQuantity={activeBatchCategory.totalQty}
                  currentSelection={batchSelections[activeBatchCategory.category.id]}
                  mode={activeBatchCategory.category.batchModifierMode || 'POOL'}
                  onSave={(selection) => {
                    setBatchSelection(activeBatchCategory.category.id, selection);
                    setActiveBatchCategory(null);
                    setBatchValidationError(null);
                  }}
                />
              )}
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
};
