import React, { useState, useEffect } from 'react';
import { RewardItem, PointRedemption, Product } from '../../types';
import { FirestoreService } from '../../services/firestoreService';
import { StorageService } from '../../services/storageService';
import { ImageUploadField } from '../common/ImageUploadField';
import {
  Gift,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  X,
  RefreshCw,
  Award,
  Calendar,
  Layers,
  ShoppingBag,
  History,
  Loader2,
} from 'lucide-react';

interface AdminRewardsProps {
  products: Product[];
}

export const AdminRewards: React.FC<AdminRewardsProps> = ({ products }) => {
  const [activeTab, setActiveTab] = useState<'CATALOG' | 'REDEMPTIONS'>('CATALOG');
  const [rewards, setRewards] = useState<RewardItem[]>([]);
  const [redemptions, setRedemptions] = useState<PointRedemption[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingReward, setEditingReward] = useState<RewardItem | null>(null);

  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<'PRODUCT' | 'DISCOUNT'>('PRODUCT');
  const [formPointsCost, setFormPointsCost] = useState<number>(100);
  const [formDiscountValue, setFormDiscountValue] = useState<number>(10000);
  const [formProductId, setFormProductId] = useState<string>('');
  const [formDescription, setFormDescription] = useState('');
  const [formStock, setFormStock] = useState<string>('');
  const [formValidUntil, setFormValidUntil] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);
  const [formImageUrl, setFormImageUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveStage, setSaveStage] = useState('');

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [rewardList, redList] = await Promise.all([
        FirestoreService.getRewards(),
        FirestoreService.getPointRedemptions(undefined, 100),
      ]);
      setRewards(rewardList);
      setRedemptions(redList);
    } catch (err: any) {
      console.error('Error loading rewards:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openAddModal = () => {
    setEditingReward(null);
    setFormName('');
    setFormType('PRODUCT');
    setFormPointsCost(100);
    setFormDiscountValue(10000);
    setFormProductId(products[0]?.id || '');
    setFormDescription('');
    setFormStock('');
    setFormValidUntil('');
    setFormIsActive(true);
    setFormImageUrl('');
    setIsModalOpen(true);
  };

  const openEditModal = (r: RewardItem) => {
    setEditingReward(r);
    setFormName(r.name);
    setFormType(r.type);
    setFormPointsCost(r.pointsCost);
    setFormDiscountValue(r.discountValue || 10000);
    setFormProductId(r.productId || '');
    setFormDescription(r.description || '');
    setFormStock(r.stock !== undefined ? String(r.stock) : '');
    setFormValidUntil(r.validUntil ? r.validUntil.substring(0, 10) : '');
    setFormIsActive(r.isActive);
    setFormImageUrl(r.imageUrl || '');
    setIsModalOpen(true);
  };

  const handleSaveReward = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      alert('Nama hadiah wajib diisi.');
      return;
    }

    if (
      formType === 'PRODUCT' &&
      !formProductId &&
      !editingReward
    ) {
      alert(
        'Hadiah PRODUCT baru wajib ditautkan ke menu agar menggunakan stok master produk.'
      );
      return;
    }

    setIsSaving(true);
    setSaveStage('Menyiapkan gambar...');
    try {
      let finalImageUrl = formImageUrl.trim();
      if (finalImageUrl.startsWith('data:')) {
        setSaveStage('Mengompresi & mengunggah gambar WebP...');
        const cleanSlug = formName.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 20);
        finalImageUrl = await StorageService.uploadDataUrl(
          finalImageUrl,
          'rewards',
          `reward_${cleanSlug}_${Date.now()}.webp`
        );
      }

      setSaveStage('Menyimpan hadiah ke database...');
      const linkedProduct = products.find((p) => p.id === formProductId);

      const rewardPayload = StorageService.cleanPayload({
        id: editingReward?.id,
        name: formName.trim(),
        type: formType,
        pointsCost: Number(formPointsCost) || 50,
        discountValue: formType === 'DISCOUNT' ? Number(formDiscountValue) || 0 : undefined,
        productId: formType === 'PRODUCT' ? formProductId || undefined : undefined,
        productName: formType === 'PRODUCT' ? linkedProduct?.name || formName.trim() : undefined,
        imageUrl: finalImageUrl || undefined,
        description: formDescription.trim(),
        stock:
          formType === 'DISCOUNT' &&
          formStock.trim() !== ''
            ? Number(formStock)
            : undefined,
        validUntil: formValidUntil ? new Date(formValidUntil).toISOString() : undefined,
        isActive: formIsActive,
      });

      await FirestoreService.saveReward(rewardPayload);

      await loadData();
      setIsModalOpen(false);
      setFeedback({
        type: 'success',
        message: editingReward ? 'Hadiah berhasil diperbarui!' : 'Hadiah baru berhasil ditambahkan!',
      });
      setTimeout(() => setFeedback(null), 3500);
    } catch (err: any) {
      alert(err?.message || 'Gagal menyimpan hadiah.');
    } finally {
      setIsSaving(false);
      setSaveStage('');
    }
  };

  const handleDeleteReward = async (r: RewardItem) => {
    if (!window.confirm(`Hapus hadiah "${r.name}" dari katalog?`)) return;

    try {
      await FirestoreService.deleteReward(r.id);
      await loadData();
      setFeedback({ type: 'success', message: 'Hadiah berhasil dihapus.' });
      setTimeout(() => setFeedback(null), 3000);
    } catch (err: any) {
      alert(err?.message || 'Gagal menghapus hadiah.');
    }
  };

  const handleToggleActive = async (r: RewardItem) => {
    try {
      await FirestoreService.saveReward({ id: r.id, isActive: !r.isActive });
      await loadData();
    } catch (err: any) {
      alert(err?.message || 'Gagal mengubah status hadiah.');
    }
  };

  return (
    <div className="space-y-5 max-w-5xl pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="font-heading font-extrabold text-xl text-[#2E1A47]">
            Katalog Hadiah & Penukaran Poin
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Kelola pilihan hadiah produk, kupon potongan belanja, dan riwayat penukaran poin
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadData}
            className="p-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 transition-all shadow-xs"
            title="Segarkan Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={openAddModal}
            className="clay-button-primary py-2.5 px-4 text-xs font-bold flex items-center gap-1.5 shadow-md"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Hadiah Baru</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-2xl border flex items-center gap-2 text-xs font-bold animate-in fade-in ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-gray-200 text-xs font-bold gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('CATALOG')}
          className={`pb-2.5 px-3 border-b-2 flex items-center gap-2 transition-all ${
            activeTab === 'CATALOG'
              ? 'border-[#FF4500] text-[#FF4500]'
              : 'border-transparent text-gray-400 hover:text-gray-700'
          }`}
        >
          <Gift className="w-4 h-4" />
          <span>Katalog Hadiah ({rewards.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('REDEMPTIONS')}
          className={`pb-2.5 px-3 border-b-2 flex items-center gap-2 transition-all ${
            activeTab === 'REDEMPTIONS'
              ? 'border-[#FF4500] text-[#FF4500]'
              : 'border-transparent text-gray-400 hover:text-gray-700'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Riwayat Penukaran ({redemptions.length})</span>
        </button>
      </div>

      {/* Tab 1: Catalog List */}
      {activeTab === 'CATALOG' && (
        <div className="space-y-3">
          {loading ? (
            <div className="clay-card p-12 text-center text-gray-400">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#FF4500]" />
              <p className="text-xs mt-2">Memuat katalog hadiah...</p>
            </div>
          ) : rewards.length === 0 ? (
            <div className="clay-card p-12 text-center text-gray-400 space-y-2">
              <Gift className="w-10 h-10 mx-auto text-gray-300 stroke-[1.5]" />
              <p className="font-bold text-sm text-gray-600">Belum ada item hadiah</p>
              <p className="text-xs text-gray-400">
                Klik tombol "Tambah Hadiah Baru" untuk menyediakan pilihan reward bagi pelanggan setia.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {rewards.map((reward) => (
                <div
                  key={reward.id}
                  className={`clay-card p-4 transition-all border space-y-3 ${
                    reward.isActive ? 'hover:shadow-md' : 'opacity-60 bg-gray-50/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-heading font-extrabold text-sm text-[#2E1A47]">
                          {reward.name}
                        </h3>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                            reward.type === 'PRODUCT'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {reward.type === 'PRODUCT' ? 'PRODUK / MENU' : 'DISKON BELANJA'}
                        </span>
                      </div>

                      {reward.description && (
                        <p className="text-xs text-gray-500 line-clamp-2">{reward.description}</p>
                      )}
                    </div>

                    <div className="text-right shrink-0">
                      <span className="font-heading font-black text-base text-[#FF4500] block">
                        {reward.pointsCost}
                      </span>
                      <span className="text-[10px] text-gray-400 font-semibold">poin</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-gray-100 text-xs text-gray-500">
                    <div className="flex items-center gap-3 text-[11px]">
                      {reward.type === 'PRODUCT' &&
                      reward.productId ? (
                        (() => {
                          const linkedProduct = products.find(
                            (p) => p.id === reward.productId
                          );

                          if (!linkedProduct) {
                            return (
                              <span className="font-semibold text-red-600">
                                Produk tidak ditemukan
                              </span>
                            );
                          }

                          return (
                            <span className="font-semibold text-gray-700">
                              Stok Master:{' '}
                              <strong>
                                {linkedProduct.stockEnabled === true
                                  ? linkedProduct.stock ?? 0
                                  : 0}
                              </strong>
                            </span>
                          );
                        })()
                      ) : reward.type === 'DISCOUNT' &&
                        reward.stock !== undefined ? (
                        <span className="font-semibold text-gray-700">
                          Sisa Kuota: <strong>{reward.stock}</strong>
                        </span>
                      ) : null}
                      <span>
                        Telah Ditukar: <strong>{reward.redeemCount || 0}x</strong>
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleToggleActive(reward)}
                        className={`px-2 py-1 rounded-lg text-[10px] font-bold ${
                          reward.isActive
                            ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >
                        {reward.isActive ? 'Aktif' : 'Non-Aktif'}
                      </button>

                      <button
                        type="button"
                        onClick={() => openEditModal(reward)}
                        className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600"
                        title="Edit Hadiah"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteReward(reward)}
                        className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600"
                        title="Hapus Hadiah"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Redemptions Log */}
      {activeTab === 'REDEMPTIONS' && (
        <div className="clay-card p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-gray-100 pb-2">
            <span className="text-xs font-bold text-gray-700">
              Semua Riwayat Penukaran Poin (Terakhir 100 Data)
            </span>
          </div>

          {redemptions.length === 0 ? (
            <div className="p-8 text-center text-xs text-gray-400">
              Belum ada riwayat penukaran poin dari pelanggan.
            </div>
          ) : (
            <div className="space-y-2">
              {redemptions.map((red) => (
                <div
                  key={red.id}
                  className="p-3 bg-gray-50 rounded-2xl border border-gray-200 text-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-heading font-extrabold text-xs text-[#2E1A47]">
                        {red.customerName}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        {new Date(red.createdAt).toLocaleString('id-ID')}
                      </span>
                    </div>
                    <p className="text-gray-700 font-semibold">
                      Menukarkan hadiah: <strong>{red.rewardName}</strong>
                    </p>
                    <span className="text-[10px] text-gray-400 block">
                      Diproses oleh: {red.createdBy || 'Kasir'}
                    </span>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="font-heading font-black text-sm text-purple-700 block">
                      -{red.pointsSpent} poin
                    </span>
                    {red.discountAmount && (
                      <span className="text-[10px] text-emerald-600 font-bold block">
                        Diskon Rp {red.discountAmount.toLocaleString('id-ID')}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal Add / Edit Reward */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl p-5 sm:p-6 max-w-md w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-heading font-extrabold text-base text-[#2E1A47]">
                {editingReward ? 'Perbarui Hadiah' : 'Tambah Hadiah Baru'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveReward} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">Tipe Hadiah:</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormType('PRODUCT')}
                    className={`py-2 px-3 rounded-xl border font-bold transition-all ${
                      formType === 'PRODUCT'
                        ? 'bg-[#2E1A47] text-white border-[#2E1A47]'
                        : 'bg-white text-gray-700 border-gray-200'
                    }`}
                  >
                    Menu Makanan / Minuman
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormType('DISCOUNT')}
                    className={`py-2 px-3 rounded-xl border font-bold transition-all ${
                      formType === 'DISCOUNT'
                        ? 'bg-[#2E1A47] text-white border-[#2E1A47]'
                        : 'bg-white text-gray-700 border-gray-200'
                    }`}
                  >
                    Kupon Diskon (Rp)
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Nama Hadiah:</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Cth: Free Es Teh Manis / Diskon Rp 15.000"
                  className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 font-bold"
                />
              </div>

              {formType === 'PRODUCT' && (
                <div>
                  <label className="block font-bold text-gray-700 mb-1">
                    Tautkan ke Menu Makanan/Minuman
                    {editingReward
                      ? ' (Stok Master)'
                      : ' (Wajib untuk hadiah baru)'}:
                  </label>
                  <select
                    required={!editingReward}
                    value={formProductId}
                    onChange={(e) => {
                      setFormProductId(e.target.value);
                      const prod = products.find((p) => p.id === e.target.value);
                      if (prod && !formName) {
                        setFormName(`Gratis ${prod.name}`);
                      }
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 font-medium"
                  >
                    <option value="">-- Pilih dari Daftar Menu --</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (Rp {p.price.toLocaleString('id-ID')})
                      </option>
                    ))}
                  </select>

                  {(() => {
                    const linkedProduct = products.find(
                      (p) => p.id === formProductId
                    );

                    if (!linkedProduct) return null;

                    return (
                      <p className="mt-1 text-[10px] text-blue-600">
                        Reward PRODUCT menggunakan stok master menu:{' '}
                        <strong>{linkedProduct.stock ?? 0} unit</strong>.
                        Tidak ada stok reward terpisah.
                      </p>
                    );
                  })()}
                </div>
              )}

              {formType === 'DISCOUNT' && (
                <div>
                  <label className="block font-bold text-gray-700 mb-1">
                    Nilai Potongan Harga (Rupiah):
                  </label>
                  <div className="relative">
                    <span className="text-gray-500 absolute left-3 top-2">Rp</span>
                    <input
                      type="number"
                      step={1000}
                      min={1000}
                      required
                      value={formDiscountValue}
                      onChange={(e) => setFormDiscountValue(Number(e.target.value) || 10000)}
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-gray-50 border border-gray-200 font-bold"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Biaya Poin:</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={formPointsCost}
                    onChange={(e) => setFormPointsCost(Math.max(1, Number(e.target.value) || 50))}
                    className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 font-bold text-[#FF4500]"
                  />
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">
                    Kuota Stok (Opsional):
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={formStock}
                    onChange={(e) => setFormStock(e.target.value)}
                    placeholder="Kosongkan jika tak terbatas"
                    className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-200"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Deskripsi & Ketentuan:</label>
                <textarea
                  rows={2}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Cth: Berlaku untuk makan di tempat atau take away"
                  className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-200"
                />
              </div>

              {/* Reward Image Upload with Preset */}
              <ImageUploadField
                label="Foto / Badge Hadiah (Opsional)"
                value={formImageUrl}
                onChange={setFormImageUrl}
                onRemove={() => setFormImageUrl('')}
                aspectRatio="square"
                preset="reward"
                folder="rewards"
                helperText="Otomatis dikonversi ke WebP (maks. 600x600, < 120 KB) untuk hemat kuota."
              />

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="reward-active"
                  checked={formIsActive}
                  onChange={(e) => setFormIsActive(e.target.checked)}
                  className="w-4 h-4 text-[#FF4500] rounded-sm"
                />
                <label htmlFor="reward-active" className="text-xs font-bold text-gray-700">
                  Aktifkan Hadiah Ini di Katalog
                </label>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="py-2.5 px-4 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="clay-button-primary py-2.5 px-5 font-bold disabled:opacity-60 shadow-md flex items-center gap-2"
                >
                  {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isSaving ? (saveStage || 'Menyimpan...') : 'Simpan Hadiah'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
