import React, { useState } from 'react';
import { Promo, PromoType, Category, Product } from '../../types';
import { FirestoreService } from '../../services/firestoreService';
import { errorService } from '../../services/errorService';
import { Modal } from '../common/Modal';
import { Plus, Edit2, Trash2, Tag, Percent, Sparkles, Check, X, Loader2, Layers, Search, CheckSquare, Square } from 'lucide-react';

interface AdminPromoManagerProps {
  promos: Promo[];
  categories?: Category[];
  products?: Product[];
  onRefresh: () => void;
}

export const AdminPromoManager: React.FC<AdminPromoManagerProps> = ({
  promos,
  categories = [],
  products = [],
  onRefresh,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPromo, setEditingPromo] = useState<Promo | null>(null);

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [discountType, setDiscountType] = useState<PromoType>('FIXED');
  const [discountValue, setDiscountValue] = useState<number>(5000);
  const [minOrderAmount, setMinOrderAmount] = useState<number>(30000);
  const [maxDiscountAmount, setMaxDiscountAmount] = useState<number>(10000);
  const [isActive, setIsActive] = useState(true);

  // Mix & Match Quantity-Based Pricing Configuration
  const [mixMatchMinQty, setMixMatchMinQty] = useState<number>(2);
  const [mixMatchPromoPrice, setMixMatchPromoPrice] = useState<number>(1500);
  const [mixMatchProductIds, setMixMatchProductIds] = useState<string[]>([]);
  const [mixMatchCategoryIds, setMixMatchCategoryIds] = useState<string[]>([]);
  const [productSearch, setProductSearch] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleOpenNew = () => {
    setEditingPromo(null);
    setCode('PROMO' + Math.floor(100 + Math.random() * 900));
    setName('Mix & Match Spesial');
    setDiscountType('MIX_MATCH');
    setDiscountValue(1500);
    setMinOrderAmount(0);
    setMaxDiscountAmount(0);
    setIsActive(true);
    setMixMatchMinQty(2);
    setMixMatchPromoPrice(1500);
    // Preselect all products or first few active products if available
    setMixMatchProductIds(products.slice(0, 4).map((p) => p.id));
    setMixMatchCategoryIds([]);
    setProductSearch('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (p: Promo) => {
    setEditingPromo(p);
    setCode(p.code);
    setName(p.name);
    setDiscountType(p.discountType || p.type || 'FIXED');
    setDiscountValue(p.discountValue ?? p.value ?? 0);
    setMinOrderAmount(p.minOrderAmount ?? p.minPurchase ?? 0);
    setMaxDiscountAmount(p.maxDiscountAmount ?? p.maxDiscount ?? 0);
    setIsActive(p.isActive);
    setMixMatchMinQty(p.mixMatchMinQty ?? p.mixMatchQuantity ?? 2);
    setMixMatchPromoPrice(p.mixMatchPromoPrice ?? p.mixMatchDiscountValue ?? p.discountValue ?? p.value ?? 1500);
    setMixMatchProductIds(p.mixMatchProductIds || []);
    setMixMatchCategoryIds(p.mixMatchCategoryIds || []);
    setProductSearch('');
    setIsModalOpen(true);
  };

  const handleToggleProduct = (prodId: string) => {
    setMixMatchProductIds((prev) =>
      prev.includes(prodId) ? prev.filter((id) => id !== prodId) : [...prev, prodId]
    );
  };

  const handleSelectAllProducts = () => {
    if (mixMatchProductIds.length === products.length) {
      setMixMatchProductIds([]);
    } else {
      setMixMatchProductIds(products.map((p) => p.id));
    }
  };

  const handleToggleCategory = (catId: string) => {
    setMixMatchCategoryIds((prev) =>
      prev.includes(catId) ? prev.filter((id) => id !== catId) : [...prev, catId]
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = code.trim().toUpperCase().replace(/\s+/g, '');
    if (!cleanCode) {
      alert('Kode promo wajib diisi.');
      return;
    }
    if (!name.trim()) {
      alert('Nama promo wajib diisi.');
      return;
    }

    if (discountType === 'MIX_MATCH') {
      if (mixMatchMinQty < 1) {
        alert('Minimal kuantiti produk harus minimal 1.');
        return;
      }
      if (mixMatchPromoPrice < 0) {
        alert('Harga promo per item tidak boleh negatif.');
        return;
      }
      if (mixMatchProductIds.length === 0 && mixMatchCategoryIds.length === 0) {
        alert('Pilih minimal 1 produk eligible untuk promo Mix & Match.');
        return;
      }
    } else if (Number(discountValue) <= 0) {
      alert('Nilai diskon promo harus lebih dari 0.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: Omit<Promo, 'id'> = {
        code: cleanCode,
        name: name.trim(),
        type: discountType,
        value: discountType === 'MIX_MATCH' ? Number(mixMatchPromoPrice) : Number(discountValue),
        minPurchase: Number(minOrderAmount) || 0,
        maxDiscount: discountType === 'PERCENTAGE' ? Number(maxDiscountAmount) || 0 : 0,
        discountType,
        discountValue: discountType === 'MIX_MATCH' ? Number(mixMatchPromoPrice) : Number(discountValue),
        minOrderAmount: Number(minOrderAmount) || 0,
        maxDiscountAmount: discountType === 'PERCENTAGE' ? Number(maxDiscountAmount) || 0 : 0,
        usedCount: editingPromo ? editingPromo.usedCount : 0,
        isActive,
        // Mix & Match Quantity-Based Pricing settings (Single Source of Truth)
        isMixMatch: discountType === 'MIX_MATCH',
        mixMatchMinQty: discountType === 'MIX_MATCH' ? Number(mixMatchMinQty) : undefined,
        mixMatchQuantity: discountType === 'MIX_MATCH' ? Number(mixMatchMinQty) : undefined, // Alias for backward compatibility
        mixMatchPromoPrice: discountType === 'MIX_MATCH' ? Number(mixMatchPromoPrice) : undefined,
        mixMatchDiscountType: discountType === 'MIX_MATCH' ? 'FIXED_PRICE' : undefined,
        mixMatchDiscountValue: discountType === 'MIX_MATCH' ? Number(mixMatchPromoPrice) : undefined,
        mixMatchProductIds: discountType === 'MIX_MATCH' ? mixMatchProductIds : undefined,
        mixMatchCategoryIds: discountType === 'MIX_MATCH' ? mixMatchCategoryIds : undefined,
      };

      if (editingPromo) {
        await FirestoreService.updatePromo(editingPromo.id, payload);
      } else {
        await FirestoreService.createPromo(payload);
      }

      setIsModalOpen(false);
      onRefresh();
    } catch (err: any) {
      errorService.capture(err, { action: 'savePromo', code: cleanCode });
      alert(err?.message || 'Gagal menyimpan promo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (p: Promo) => {
    if (confirm(`Hapus kode promo "${p.code}"?`)) {
      try {
        await FirestoreService.deletePromo(p.id);
        onRefresh();
      } catch (err) {
        alert('Gagal menghapus promo.');
      }
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading font-extrabold text-xl text-[#2E1A47]">
            Voucher & Promo Otomatis
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Kelola diskon nominal, persentase, gratis ongkir, dan Mix & Match kuantiti
          </p>
        </div>

        <button
          onClick={handleOpenNew}
          className="clay-button-primary py-2 px-3.5 text-xs font-bold flex items-center gap-1.5 shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>Buat Promo Baru</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {promos.map((p) => {
          const promoType = p.discountType || p.type;
          return (
            <div
              key={p.id}
              className={`clay-card p-4 flex flex-col justify-between border ${
                p.isActive ? 'border-purple-200' : 'border-gray-200 opacity-60'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="px-2.5 py-1 rounded-lg bg-purple-100 text-[#2E1A47] font-mono font-black text-xs tracking-wider">
                    {p.code}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      p.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {p.isActive ? 'Aktif' : 'Nonaktif'}
                  </span>
                </div>

                <h4 className="font-heading font-bold text-sm text-[#2E1A47] mt-2">{p.name}</h4>

                <div className="mt-2 text-xs text-gray-600">
                  {promoType === 'MIX_MATCH' ? (
                    <div className="space-y-1">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 text-[10px] font-extrabold tracking-wide">
                        <Layers className="w-2.5 h-2.5 text-amber-700" />
                        Min. {p.mixMatchMinQty ?? p.mixMatchQuantity ?? 2} pcs
                      </span>
                      <p className="text-[11px] text-gray-600 mt-0.5">
                        Harga Promo:{' '}
                        <strong className="text-emerald-700 font-extrabold text-xs">
                          Rp {(p.mixMatchPromoPrice ?? p.mixMatchDiscountValue ?? p.discountValue ?? p.value ?? 0).toLocaleString('id-ID')} / pcs
                        </strong>
                      </p>
                      <p className="text-[10px] text-gray-400">
                        {p.mixMatchProductIds && p.mixMatchProductIds.length > 0
                          ? `${p.mixMatchProductIds.length} produk eligible`
                          : p.mixMatchCategoryIds && p.mixMatchCategoryIds.length > 0
                          ? `${p.mixMatchCategoryIds.length} kategori eligible`
                          : 'Semua produk menu'}
                      </p>
                    </div>
                  ) : (
                    <p>
                      Potongan:{' '}
                      <strong className="text-gray-900">
                        {promoType === 'PERCENTAGE'
                          ? `${p.discountValue ?? p.value}%`
                          : promoType === 'FREE_DELIVERY'
                          ? 'Gratis Ongkir'
                          : `Rp ${(p.discountValue ?? p.value ?? 0).toLocaleString('id-ID')}`}
                      </strong>
                    </p>
                  )}
                  {promoType !== 'MIX_MATCH' && (
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Min. Belanja: Rp {(p.minOrderAmount ?? p.minPurchase ?? 0).toLocaleString('id-ID')}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-gray-100 flex justify-end gap-1.5">
                <button
                  onClick={() => handleOpenEdit(p)}
                  className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-[#2E1A47]"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(p)}
                  className="p-1.5 rounded-lg text-gray-400 hover:bg-rose-50 hover:text-rose-600"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingPromo ? 'Edit Kode Promo' : 'Buat Kode Promo'}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Kode Voucher:</label>
            <input
              type="text"
              required
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Cth: MIX10 / JUMBO10"
              className="w-full text-xs px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 uppercase font-mono font-bold"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Nama Promo:</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Cth: Promo Mix 10 Gorengan"
              className="w-full text-xs px-3 py-2 rounded-xl bg-gray-50 border border-gray-200"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Tipe Diskon:</label>
            <select
              value={discountType}
              onChange={(e) => setDiscountType(e.target.value as PromoType)}
              className="w-full text-xs px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 font-semibold"
            >
              <option value="FIXED">Nominal Tetap (Rp)</option>
              <option value="PERCENTAGE">Persentase (%)</option>
              <option value="FREE_DELIVERY">Gratis Ongkir</option>
              <option value="MIX_MATCH">Mix & Match Kuantiti (Paket Campur)</option>
            </select>
          </div>

          {/* Conditional Mix & Match Settings (Quantity-Based Pricing) */}
          {discountType === 'MIX_MATCH' ? (
            <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
                  <Layers className="w-3.5 h-3.5 text-amber-600" />
                  <span>Mix & Match Quantity-Based Pricing</span>
                </div>
                <span className="text-[10px] font-semibold text-amber-800 bg-amber-200/70 px-2 py-0.5 rounded-full">
                  Semua item eligible dapat harga promo
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">
                    Minimal Kuantiti (Qty):
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={mixMatchMinQty}
                    onChange={(e) => setMixMatchMinQty(Math.max(1, Number(e.target.value) || 1))}
                    className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 font-bold"
                    placeholder="2"
                  />
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    Jika total kuantiti produk eligible &gt;= nilai ini, promo aktif.
                  </p>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">
                    Harga Promo / pcs (Rp):
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={mixMatchPromoPrice}
                    onChange={(e) => setMixMatchPromoPrice(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 font-bold text-[#FF4500]"
                    placeholder="1500"
                  />
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    Harga per pcs yang dibayarkan untuk tiap item eligible.
                  </p>
                </div>
              </div>

              {/* Product Eligibility Selector */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[11px] font-bold text-gray-700">
                    Produk Eligible ({mixMatchProductIds.length} terpilih):
                  </label>
                  <button
                    type="button"
                    onClick={handleSelectAllProducts}
                    className="text-[10px] font-bold text-purple-700 hover:text-purple-900 underline"
                  >
                    {mixMatchProductIds.length === products.length ? 'Batal Pilih Semua' : 'Pilih Semua Produk'}
                  </button>
                </div>

                {products.length > 6 && (
                  <div className="relative mb-2">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Cari produk eligible..."
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      className="w-full text-xs pl-8 pr-2.5 py-1 rounded-lg bg-white border border-gray-200 placeholder:text-gray-400"
                    />
                  </div>
                )}

                <div className="max-h-40 overflow-y-auto p-2 bg-white rounded-lg border border-gray-200 space-y-1 divide-y divide-gray-100">
                  {products
                    .filter((prod) => {
                      if (!productSearch.trim()) return true;
                      return prod.name.toLowerCase().includes(productSearch.toLowerCase());
                    })
                    .map((prod) => {
                      const isSelected = mixMatchProductIds.includes(prod.id);
                      return (
                        <div
                          key={prod.id}
                          onClick={() => handleToggleProduct(prod.id)}
                          className={`pt-1 first:pt-0 flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer text-xs transition-colors ${
                            isSelected ? 'bg-purple-50 text-purple-950 font-bold' : 'hover:bg-gray-50 text-gray-700'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-purple-600 shrink-0" />
                            ) : (
                              <Square className="w-4 h-4 text-gray-300 shrink-0" />
                            )}
                            <span className="truncate max-w-[200px]">{prod.name}</span>
                          </div>
                          <span className="text-[11px] font-mono text-gray-500">
                            Rp {prod.price.toLocaleString('id-ID')}
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Optional Category Eligibility as fallback/convenience */}
              {categories.length > 0 && (
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">
                    Atau Pilih Kategori Utuh:
                  </label>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1.5 bg-white rounded-lg border border-gray-200">
                    {categories.map((cat) => {
                      const isSelected = mixMatchCategoryIds.includes(cat.id);
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => handleToggleCategory(cat.id)}
                          className={`px-2 py-1 rounded-md text-[11px] font-bold flex items-center gap-1 transition-colors ${
                            isSelected
                              ? 'bg-[#2E1A47] text-white'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          <span>{cat.icon || '🍲'}</span>
                          <span>{cat.name}</span>
                          {isSelected && <Check className="w-2.5 h-2.5" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Nilai Diskon:
                  </label>
                  <input
                    type="number"
                    value={discountValue}
                    onChange={(e) => setDiscountValue(Number(e.target.value) || 0)}
                    className="w-full text-xs px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Minimal Belanja (Rp):</label>
                  <input
                    type="number"
                    value={minOrderAmount}
                    onChange={(e) => setMinOrderAmount(Number(e.target.value) || 0)}
                    className="w-full text-xs px-3 py-2 rounded-xl bg-gray-50 border border-gray-200"
                  />
                </div>
              </div>
            </>
          )}

          <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded-sm text-[#2E1A47]"
            />
            <span>Promo Aktif</span>
          </label>

          <div className="pt-3 border-t border-gray-100 flex justify-end gap-2">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="clay-button-primary py-2 px-5 text-xs font-bold flex items-center gap-2 disabled:opacity-60"
            >
              {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{isSubmitting ? 'Menyimpan...' : 'Simpan Promo'}</span>
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
