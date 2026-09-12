import React, { useState } from 'react';
import { Promo, PromoType, Category, Product } from '../../types';
import { FirestoreService } from '../../services/firestoreService';
import { errorService } from '../../services/errorService';
import { Modal } from '../common/Modal';
import { Plus, Edit2, Trash2, Tag, Percent, Sparkles, Check, X, Loader2, Layers } from 'lucide-react';

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

  // Mix & Match Configuration
  const [mixMatchQuantity, setMixMatchQuantity] = useState<number>(10);
  const [mixMatchDiscountType, setMixMatchDiscountType] = useState<'FIXED' | 'PERCENTAGE' | 'FIXED_PRICE'>('FIXED');
  const [mixMatchDiscountValue, setMixMatchDiscountValue] = useState<number>(2000);
  const [mixMatchCategoryIds, setMixMatchCategoryIds] = useState<string[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleOpenNew = () => {
    setEditingPromo(null);
    setCode('PROMO' + Math.floor(100 + Math.random() * 900));
    setName('Promo Spesial HUMA');
    setDiscountType('FIXED');
    setDiscountValue(5000);
    setMinOrderAmount(30000);
    setMaxDiscountAmount(10000);
    setIsActive(true);
    setMixMatchQuantity(10);
    setMixMatchDiscountType('FIXED');
    setMixMatchDiscountValue(2000);
    setMixMatchCategoryIds(categories.slice(0, 1).map((c) => c.id));
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
    setMixMatchQuantity(p.mixMatchQuantity || 10);
    setMixMatchDiscountType(p.mixMatchDiscountType || 'FIXED');
    setMixMatchDiscountValue(p.mixMatchDiscountValue ?? 2000);
    setMixMatchCategoryIds(p.mixMatchCategoryIds || []);
    setIsModalOpen(true);
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
    if (discountType !== 'MIX_MATCH' && Number(discountValue) <= 0) {
      alert('Nilai diskon promo harus lebih dari 0.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: Omit<Promo, 'id'> = {
        code: cleanCode,
        name: name.trim(),
        type: discountType,
        value: Number(discountValue),
        minPurchase: Number(minOrderAmount) || 0,
        maxDiscount: discountType === 'PERCENTAGE' ? Number(maxDiscountAmount) || 0 : 0,
        discountType,
        discountValue: Number(discountValue),
        minOrderAmount: Number(minOrderAmount) || 0,
        maxDiscountAmount: discountType === 'PERCENTAGE' ? Number(maxDiscountAmount) || 0 : 0,
        usedCount: editingPromo ? editingPromo.usedCount : 0,
        isActive,
        // Mix & Match specifics
        mixMatchQuantity: discountType === 'MIX_MATCH' ? Number(mixMatchQuantity) || 10 : undefined,
        mixMatchDiscountType: discountType === 'MIX_MATCH' ? mixMatchDiscountType : undefined,
        mixMatchDiscountValue: discountType === 'MIX_MATCH' ? Number(mixMatchDiscountValue) || 0 : undefined,
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
                    <div className="space-y-0.5">
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[10px] font-bold">
                        <Layers className="w-2.5 h-2.5" />
                        Mix & Match {p.mixMatchQuantity || 10} pcs
                      </span>
                      <p className="text-[11px] text-gray-500 mt-1">
                        Diskon:{' '}
                        <strong className="text-gray-900">
                          {p.mixMatchDiscountType === 'FIXED_PRICE'
                            ? `Harga Rp ${(p.mixMatchDiscountValue || 0).toLocaleString('id-ID')}`
                            : p.mixMatchDiscountType === 'PERCENTAGE'
                            ? `${p.mixMatchDiscountValue}%`
                            : `Potongan Rp ${(p.mixMatchDiscountValue || 0).toLocaleString('id-ID')}`}
                        </strong>
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

          {/* Conditional Mix & Match Settings */}
          {discountType === 'MIX_MATCH' ? (
            <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
                <Layers className="w-3.5 h-3.5 text-amber-600" />
                <span>Pengaturan Mix & Match (Paket Campur)</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">
                    Target Kuantiti (Pcs):
                  </label>
                  <input
                    type="number"
                    min="2"
                    value={mixMatchQuantity}
                    onChange={(e) => setMixMatchQuantity(Number(e.target.value) || 2)}
                    className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 font-bold"
                    placeholder="10"
                  />
                  <p className="text-[10px] text-gray-500 mt-0.5">Cth: Tiap kelipatan 10 pcs</p>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">
                    Model Diskon Paket:
                  </label>
                  <select
                    value={mixMatchDiscountType}
                    onChange={(e) => setMixMatchDiscountType(e.target.value as any)}
                    className="w-full text-xs px-2 py-1.5 rounded-lg bg-white border border-gray-200"
                  >
                    <option value="FIXED">Potongan Rp (Hemat)</option>
                    <option value="FIXED_PRICE">Harga Paket Pas</option>
                    <option value="PERCENTAGE">Diskon Persen (%)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">
                  Nilai Diskon / Harga Paket:
                </label>
                <input
                  type="number"
                  value={mixMatchDiscountValue}
                  onChange={(e) => setMixMatchDiscountValue(Number(e.target.value) || 0)}
                  className="w-full text-xs px-3 py-2 rounded-lg bg-white border border-gray-200 font-bold text-[#FF4500]"
                  placeholder="2000"
                />
                <p className="text-[10px] text-gray-500 mt-0.5">
                  {mixMatchDiscountType === 'FIXED' && 'Nominal potongan yang dikurangkan per paket'}
                  {mixMatchDiscountType === 'FIXED_PRICE' && 'Total harga tetap per paket kuantiti'}
                  {mixMatchDiscountType === 'PERCENTAGE' && 'Persentase diskon per paket'}
                </p>
              </div>

              {categories.length > 0 && (
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">
                    Kategori Menu yang Berlaku:
                  </label>
                  <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-1.5 bg-white rounded-lg border border-gray-200">
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
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    Kosongkan jika berlaku untuk seluruh kategori menu.
                  </p>
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
