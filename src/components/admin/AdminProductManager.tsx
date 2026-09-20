import React, { useState, useMemo } from 'react';
import { Product, Category, ModifierGroup, WholesaleRule } from '../../types';
import { FirestoreService } from '../../services/firestoreService';
import { StorageService } from '../../services/storageService';
import { errorService } from '../../services/errorService';
import { Modal } from '../common/Modal';
import { ImageUploadField } from '../common/ImageUploadField';
import {
  Plus,
  Edit2,
  Trash2,
  Image as ImageIcon,
  Tag,
  Layers,
  Check,
  X,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  Flame,
  Loader2,
  Search,
  SlidersHorizontal,
  ArrowUpDown,
  RotateCcw,
} from 'lucide-react';

interface AdminProductManagerProps {
  products: Product[];
  categories: Category[];
  modifierGroups: ModifierGroup[];
  onRefresh: () => void;
}

export const AdminProductManager: React.FC<AdminProductManagerProps> = ({
  products,
  categories,
  modifierGroups,
  onRefresh,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Search & Filter Engine States
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('ALL');
  const [activeQuickFilter, setActiveQuickFilter] = useState<'ALL' | 'WHOLESALE' | 'POPULAR' | 'OUT_OF_STOCK'>('ALL');
  const [sortOption, setSortOption] = useState<'DEFAULT' | 'PRICE_LOW' | 'PRICE_HIGH' | 'NAME_AZ'>('DEFAULT');

  // Form states
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState<number>(15000);
  const [categoryId, setCategoryId] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [isAvailable, setIsAvailable] = useState(true);
  const [isPopular, setIsPopular] = useState(false);
  const [mixMatchEligible, setMixMatchEligible] = useState(true);
  const [wholesaleEnabled, setWholesaleEnabled] = useState(false);
  const [wholesaleRules, setWholesaleRules] = useState<WholesaleRule[]>([]);
  const [selectedModifierGroupIds, setSelectedModifierGroupIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStage, setSubmitStage] = useState<string>('');

  // Open modal for new product
  const handleOpenNew = () => {
    setEditingProduct(null);
    setName('');
    setDescription('');
    setPrice(15000);
    setCategoryId(categories[0]?.id || '');
    setImageUrl('https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=80');
    setIsAvailable(true);
    setIsPopular(false);
    setMixMatchEligible(true);
    setWholesaleEnabled(false);
    setWholesaleRules([]);
    setSelectedModifierGroupIds([]);
    setIsModalOpen(true);
  };

  // Open modal for editing
  const handleOpenEdit = (p: Product) => {
    setEditingProduct(p);
    setName(p.name);
    setDescription(p.description);
    setPrice(p.price);
    setCategoryId(p.categoryId);
    setImageUrl(p.imageUrl);
    setIsAvailable(p.isAvailable);
    setIsPopular(!!p.isPopular);
    setMixMatchEligible(p.mixMatchEligible !== false);
    setWholesaleEnabled(!!p.wholesaleEnabled);
    setWholesaleRules(p.wholesaleRules ? [...p.wholesaleRules] : []);
    setSelectedModifierGroupIds(p.modifierGroupIds ? [...p.modifierGroupIds] : []);
    setIsModalOpen(true);
  };

  // Wholesale rule manager inside form
  const handleAddWholesaleRule = () => {
    setWholesaleRules((prev) => [
      ...prev,
      { minQty: (prev[prev.length - 1]?.maxQty || 4) + 1, maxQty: 10, price: Math.max(1000, price - 2000) },
    ]);
  };

  const handleUpdateRule = (index: number, field: keyof WholesaleRule, value: any) => {
    setWholesaleRules((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleRemoveRule = (index: number) => {
    setWholesaleRules((prev) => prev.filter((_, i) => i !== index));
  };

  // Toggle modifier group selection
  const handleToggleModGroup = (groupId: string) => {
    setSelectedModifierGroupIds((prev) =>
      prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId]
    );
  };

  // Submit save
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('Nama produk wajib diisi.');
      return;
    }
    if (!categoryId) {
      alert('Silakan pilih kategori produk.');
      return;
    }
    if (Number(price) <= 0) {
      alert('Harga produk harus lebih dari Rp 0.');
      return;
    }

    setIsSubmitting(true);
    setSubmitStage('Menyiapkan gambar...');
    try {
      let finalImageUrl = imageUrl.trim();
      // If image is a local base64 Data URL, upload to Firebase Storage with WebP compression
      if (finalImageUrl.startsWith('data:')) {
        setSubmitStage('Mengompresi & mengunggah foto WebP...');
        const cleanSlug = name.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 20);
        finalImageUrl = await StorageService.uploadDataUrl(
          finalImageUrl,
          'products',
          `prod_${cleanSlug}_${Date.now()}.webp`
        );
      }
      if (!finalImageUrl) {
        finalImageUrl = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=80';
      }

      setSubmitStage('Menyimpan data produk ke database...');
      const payload: Omit<Product, 'id'> = StorageService.cleanPayload({
        name: name.trim(),
        description: description.trim(),
        price: Number(price),
        categoryId,
        imageUrl: finalImageUrl,
        isAvailable,
        isActive: true,
        isPopular,
        mixMatchEligible,
        wholesaleEnabled,
        wholesaleRules: wholesaleEnabled ? wholesaleRules : [],
        modifierGroupIds: selectedModifierGroupIds,
        sortOrder: editingProduct?.sortOrder || (products.length + 1),
      });

      if (editingProduct) {
        await FirestoreService.updateProduct(editingProduct.id, payload);
      } else {
        await FirestoreService.createProduct(payload);
      }

      setIsModalOpen(false);
      onRefresh();
    } catch (err: any) {
      errorService.capture(err, { action: 'saveProduct', name });
      alert(err?.message || 'Gagal menyimpan produk. Periksa koneksi atau hak akses.');
    } finally {
      setIsSubmitting(false);
      setSubmitStage('');
    }
  };

  // Quick toggle availability
  const handleToggleAvailability = async (p: Product) => {
    try {
      await FirestoreService.updateProduct(p.id, { isAvailable: !p.isAvailable });
      onRefresh();
    } catch (err) {
      alert('Gagal mengubah ketersediaan produk.');
    }
  };

  // Delete product
  const handleDelete = async (p: Product) => {
    if (confirm(`Hapus menu "${p.name}"?`)) {
      try {
        await FirestoreService.deleteProduct(p.id);
        onRefresh();
      } catch (err) {
        alert('Gagal menghapus produk.');
      }
    }
  };

  // Search Engine Metrics & Computed Filtered Products
  const countWholesale = useMemo(() => products.filter((p) => p.wholesaleEnabled).length, [products]);
  const countPopular = useMemo(() => products.filter((p) => p.isPopular).length, [products]);
  const countOutOfStock = useMemo(() => products.filter((p) => !p.isAvailable).length, [products]);

  const filteredAndSortedProducts = useMemo(() => {
    const q = searchKeyword.trim().toLowerCase();

    return products
      .filter((p) => {
        // Keyword Search Filter
        if (q) {
          const cat = categories.find((c) => c.id === p.categoryId);
          const catName = cat?.name?.toLowerCase() || '';
          const nameMatch = p.name?.toLowerCase().includes(q);
          const descMatch = p.description?.toLowerCase().includes(q);
          const catMatch = catName.includes(q);
          const priceMatch = String(p.price).includes(q);
          const wholesaleMatch = p.wholesaleEnabled && (
            'grosir'.includes(q) ||
            p.wholesaleRules?.some((r) => String(r.price).includes(q) || String(r.minQty).includes(q))
          );

          if (!nameMatch && !descMatch && !catMatch && !priceMatch && !wholesaleMatch) {
            return false;
          }
        }

        // Category Filter
        if (selectedCategoryFilter !== 'ALL' && p.categoryId !== selectedCategoryFilter) {
          return false;
        }

        // Quick Filter Tabs
        if (activeQuickFilter === 'WHOLESALE' && !p.wholesaleEnabled) return false;
        if (activeQuickFilter === 'POPULAR' && !p.isPopular) return false;
        if (activeQuickFilter === 'OUT_OF_STOCK' && p.isAvailable) return false;

        return true;
      })
      .sort((a, b) => {
        if (sortOption === 'PRICE_LOW') return a.price - b.price;
        if (sortOption === 'PRICE_HIGH') return b.price - a.price;
        if (sortOption === 'NAME_AZ') return a.name.localeCompare(b.name, 'id');
        return 0; // DEFAULT preserve original sort
      });
  }, [products, categories, searchKeyword, selectedCategoryFilter, activeQuickFilter, sortOption]);

  const isSearchFiltered =
    searchKeyword.trim().length > 0 ||
    selectedCategoryFilter !== 'ALL' ||
    activeQuickFilter !== 'ALL' ||
    sortOption !== 'DEFAULT';

  const handleResetFilters = () => {
    setSearchKeyword('');
    setSelectedCategoryFilter('ALL');
    setActiveQuickFilter('ALL');
    setSortOption('DEFAULT');
  };

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-heading font-extrabold text-xl text-[#2E1A47]">
            Katalog Produk & Menu
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Kelola harga normal, harga grosir bertingkat, dan pilihan add-on
          </p>
        </div>

        <button
          onClick={handleOpenNew}
          className="clay-button-primary py-2 px-3.5 text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah Menu Baru</span>
        </button>
      </div>

      {/* SEARCH ENGINE & FILTER CONTROLS */}
      <div className="bg-white p-3.5 rounded-2xl border border-gray-200 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row gap-2.5">
          {/* Main Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3 pointer-events-none" />
            <input
              type="text"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              placeholder="Cari menu, rasa, grosir, atau kategori..."
              className="w-full pl-9 pr-9 py-2 rounded-xl bg-gray-50 border border-gray-200 text-xs text-gray-900 placeholder:text-gray-400 focus:outline-hidden focus:ring-2 focus:ring-[#2E1A47]/30 focus:bg-white transition-all font-medium"
            />
            {searchKeyword && (
              <button
                type="button"
                onClick={() => setSearchKeyword('')}
                className="absolute right-2.5 top-2.5 p-0.5 rounded-full hover:bg-gray-200 text-gray-400 hover:text-gray-700 transition-colors"
                title="Hapus pencarian"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Category Dropdown Filter */}
          <div className="w-full md:w-56 shrink-0">
            <select
              value={selectedCategoryFilter}
              onChange={(e) => setSelectedCategoryFilter(e.target.value)}
              className="w-full py-2 px-3 rounded-xl bg-gray-50 border border-gray-200 text-xs text-gray-800 font-semibold focus:outline-hidden focus:ring-2 focus:ring-[#2E1A47]/30 focus:bg-white"
            >
              <option value="ALL">Semua Kategori ({categories.length})</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name} ({products.filter((p) => p.categoryId === cat.id).length})
                </option>
              ))}
            </select>
          </div>

          {/* Sort Option Dropdown */}
          <div className="w-full md:w-48 shrink-0">
            <div className="relative">
              <select
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value as any)}
                className="w-full py-2 pl-3 pr-8 rounded-xl bg-gray-50 border border-gray-200 text-xs text-gray-800 font-semibold focus:outline-hidden focus:ring-2 focus:ring-[#2E1A47]/30 focus:bg-white appearance-none"
              >
                <option value="DEFAULT">Urutan Default</option>
                <option value="PRICE_LOW">Harga: Terendah</option>
                <option value="PRICE_HIGH">Harga: Tertinggi</option>
                <option value="NAME_AZ">Nama: A - Z</option>
              </select>
              <ArrowUpDown className="w-3.5 h-3.5 text-gray-400 absolute right-2.5 top-2.5 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Quick Filter Chips & Result Counter */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-gray-100">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveQuickFilter('ALL')}
              className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
                activeQuickFilter === 'ALL'
                  ? 'bg-[#2E1A47] text-white shadow-xs'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Semua ({products.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveQuickFilter('WHOLESALE')}
              className={`px-3 py-1 rounded-full text-xs font-bold transition-all flex items-center gap-1 ${
                activeQuickFilter === 'WHOLESALE'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
              }`}
            >
              <Layers className="w-3 h-3" />
              <span>Grosir Aktif ({countWholesale})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveQuickFilter('POPULAR')}
              className={`px-3 py-1 rounded-full text-xs font-bold transition-all flex items-center gap-1 ${
                activeQuickFilter === 'POPULAR'
                  ? 'bg-[#FF4500] text-white shadow-xs'
                  : 'bg-orange-50 text-orange-800 hover:bg-orange-100 border border-orange-200'
              }`}
            >
              <Flame className="w-3 h-3" />
              <span>Favorit ({countPopular})</span>
            </button>

            {countOutOfStock > 0 && (
              <button
                type="button"
                onClick={() => setActiveQuickFilter('OUT_OF_STOCK')}
                className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
                  activeQuickFilter === 'OUT_OF_STOCK'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                }`}
              >
                Habis/Kosong ({countOutOfStock})
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-gray-500">
              Menampilkan <strong>{filteredAndSortedProducts.length}</strong> dari {products.length} menu
            </span>
            {isSearchFiltered && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="text-[11px] font-bold text-[#FF4500] hover:underline flex items-center gap-0.5"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Products Grid / Table */}
      {filteredAndSortedProducts.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center text-gray-500 space-y-2">
          <Search className="w-10 h-10 text-gray-300 mx-auto" />
          <h4 className="font-heading font-bold text-sm text-gray-700">
            Tidak ada menu yang sesuai pencarian
          </h4>
          <p className="text-xs text-gray-400 max-w-sm mx-auto">
            Tidak ditemukan menu dengan kata kunci atau filter yang Anda pilih. Silakan sesuaikan pencarian.
          </p>
          <button
            type="button"
            onClick={handleResetFilters}
            className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Semua Filter</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredAndSortedProducts.map((p) => {
          const cat = categories.find((c) => c.id === p.categoryId);
          return (
            <div
              key={p.id}
              className={`clay-card p-3 flex flex-col justify-between relative ${
                !p.isAvailable ? 'opacity-70 bg-gray-50' : ''
              }`}
            >
              <div>
                <div className="relative h-32 w-full rounded-xl overflow-hidden bg-gray-100 mb-2">
                  <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
                  <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/60 text-white text-[10px] font-bold">
                    {cat?.name || 'Kategori'}
                  </span>
                  {p.isPopular && (
                    <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-[#FF4500] text-white text-[10px] font-extrabold flex items-center gap-0.5">
                      <Flame className="w-3 h-3" /> Favorit
                    </span>
                  )}
                </div>

                <h4 className="font-heading font-bold text-sm text-[#2E1A47] line-clamp-1">{p.name}</h4>
                <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">{p.description}</p>

                <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-between">
                  <div>
                    <span className="font-heading font-extrabold text-[#2E1A47] text-sm">
                      Rp {p.price.toLocaleString('id-ID')}
                    </span>
                    {p.wholesaleEnabled && (
                      <p className="text-[10px] text-amber-700 font-semibold">
                        Grosir aktif ({p.wholesaleRules?.length || 0} tier)
                      </p>
                    )}
                  </div>

                  <button
                    onClick={() => handleToggleAvailability(p)}
                    className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                      p.isAvailable
                        ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                        : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                    }`}
                  >
                    {p.isAvailable ? 'Tersedia' : 'Habis'}
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-3 pt-2 border-t border-gray-100 flex items-center justify-end gap-1.5">
                <button
                  onClick={() => handleOpenEdit(p)}
                  className="p-1.5 rounded-lg text-gray-600 hover:bg-gray-100 hover:text-[#2E1A47] transition-colors"
                  title="Edit Menu"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(p)}
                  className="p-1.5 rounded-lg text-gray-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                  title="Hapus Menu"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
        </div>
      )}

      {/* Edit / Create Product Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingProduct ? 'Edit Menu' : 'Tambah Menu Baru'}
        subtitle="Konfigurasi harga, gambar, varian, dan grosir"
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleSaveProduct} className="space-y-4 max-h-[78vh] overflow-y-auto pr-1">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Nama Menu:</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full text-xs px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:outline-hidden"
              placeholder="Cth: Seblak Komplit Prasmanan"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Harga Satuan (Rp):</label>
              <input
                type="number"
                required
                value={price}
                onChange={(e) => setPrice(Number(e.target.value) || 0)}
                className="w-full text-xs px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:outline-hidden font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Kategori:</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:outline-hidden"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Deskripsi Menu:</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full text-xs p-2.5 rounded-xl bg-gray-50 border border-gray-200 focus:outline-hidden"
              placeholder="Jelaskan cita rasa atau isian..."
            />
          </div>

          {/* Image preview & upload with automatic WebP optimizer */}
          <ImageUploadField
            label="Foto Menu Produk"
            value={imageUrl}
            onChange={setImageUrl}
            onRemove={() => setImageUrl('')}
            aspectRatio="square"
            preset="product"
            folder="products"
            helperText="Foto otomatis dikonversi ke WebP (maks. 800x800, < 150 KB) untuk menghemat storage dan mempercepat tampilan pelanggan."
          />

          {/* Wholesale Tier Pricing Section */}
          <div className="bg-amber-50/70 p-3.5 rounded-2xl border border-amber-200/80 space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <h5 className="font-heading font-bold text-xs text-[#2E1A47] flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-amber-700" />
                  <span>Harga Grosir Bertingkat (Tier Pricing)</span>
                </h5>
                <p className="text-[11px] text-gray-500">
                  Otomatis diskon bertahap berdasarkan jumlah pembelian
                </p>
              </div>

              <button
                type="button"
                onClick={() => setWholesaleEnabled(!wholesaleEnabled)}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  wholesaleEnabled ? 'bg-amber-600 text-white shadow-xs' : 'bg-gray-200 text-gray-600'
                }`}
              >
                {wholesaleEnabled ? 'Aktif' : 'Nonaktif'}
              </button>
            </div>

            {wholesaleEnabled && (
              <div className="space-y-2 pt-2 border-t border-amber-200/60">
                {wholesaleRules.map((rule, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs">
                    <input
                      type="number"
                      placeholder="Min"
                      value={rule.minQty}
                      onChange={(e) => handleUpdateRule(idx, 'minQty', Number(e.target.value) || 0)}
                      className="w-16 p-1.5 bg-white rounded-lg border border-gray-200 text-center font-bold"
                    />
                    <span>–</span>
                    <input
                      type="number"
                      placeholder="Max"
                      value={rule.maxQty || ''}
                      onChange={(e) =>
                        handleUpdateRule(idx, 'maxQty', e.target.value ? Number(e.target.value) : undefined)
                      }
                      className="w-16 p-1.5 bg-white rounded-lg border border-gray-200 text-center font-bold"
                    />
                    <span>pcs: Rp</span>
                    <input
                      type="number"
                      value={rule.price}
                      onChange={(e) => handleUpdateRule(idx, 'price', Number(e.target.value) || 0)}
                      className="flex-1 p-1.5 bg-white rounded-lg border border-gray-200 font-bold text-[#FF4500]"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveRule(idx)}
                      className="text-gray-400 hover:text-rose-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={handleAddWholesaleRule}
                  className="text-xs text-amber-800 font-bold hover:underline flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah Tingkatan Grosir</span>
                </button>
              </div>
            )}
          </div>

          {/* Mix & Match Eligibility */}
          <div className="bg-emerald-50/70 p-3.5 rounded-2xl border border-emerald-200/80 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h5 className="font-heading font-bold text-xs text-[#2E1A47]">
                  Mix & Match Eligible
                </h5>
                <p className="text-[11px] text-gray-500">
                  Produk ini boleh ikut paket Mix & Match otomatis.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMixMatchEligible((prev) => !prev)}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  mixMatchEligible ? 'bg-emerald-600 text-white shadow-xs' : 'bg-gray-200 text-gray-600'
                }`}
                aria-pressed={mixMatchEligible}
              >
                {mixMatchEligible ? 'Eligible' : 'Tidak'}
              </button>
            </div>
          </div>

          {/* Modifiers Links */}
          <div className="bg-gray-50 p-3.5 rounded-2xl border border-gray-100 space-y-2">
            <h5 className="font-heading font-bold text-xs text-[#2E1A47]">
              Pilihan Add-on / Modifiers yang Diizinkan:
            </h5>
            <div className="grid grid-cols-2 gap-1.5">
              {modifierGroups.map((g) => {
                const isSelected = selectedModifierGroupIds.includes(g.id);
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => handleToggleModGroup(g.id)}
                    className={`p-2 rounded-xl text-left text-xs border flex items-center justify-between transition-all ${
                      isSelected
                        ? 'bg-white border-[#2E1A47] text-[#2E1A47] font-bold shadow-2xs'
                        : 'bg-white/60 border-gray-200 text-gray-600'
                    }`}
                  >
                    <span>{g.name}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-[#2E1A47]" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Popular & Available Toggles */}
          <div className="flex gap-4 pt-1">
            <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
              <input
                type="checkbox"
                checked={isPopular}
                onChange={(e) => setIsPopular(e.target.checked)}
                className="rounded-sm text-[#FF4500]"
              />
              <span>Tandai Menu Favorit</span>
            </label>

            <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
              <input
                type="checkbox"
                checked={isAvailable}
                onChange={(e) => setIsAvailable(e.target.checked)}
                className="rounded-sm text-[#2E1A47]"
              />
              <span>Stok Tersedia</span>
            </label>
          </div>

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
              className="clay-button-primary py-2 px-5 text-xs font-bold shadow-md flex items-center gap-2 disabled:opacity-60"
            >
              {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{isSubmitting ? (submitStage || 'Menyimpan...') : 'Simpan Menu'}</span>
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
