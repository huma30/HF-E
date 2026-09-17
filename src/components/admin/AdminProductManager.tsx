import React, { useState, useMemo } from 'react';
import { Product, Category, ModifierGroup, WholesaleRule } from '../../types';
import { FirestoreService } from '../../services/firestoreService';
import { StorageService } from '../../services/storageService';
import { errorService } from '../../services/errorService';
import { checkProductDuplicate, auditCatalogDuplicates, CatalogAuditResult } from '../../utils/productUtils';
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
  FileSpreadsheet,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';

interface AdminProductManagerProps {
  products: Product[];
  categories: Category[];
  modifierGroups: ModifierGroup[];
  onRefresh: () => void;
  onNavigateToTab?: (tab: 'BACKUP') => void;
}

export const AdminProductManager: React.FC<AdminProductManagerProps> = ({
  products,
  categories,
  modifierGroups,
  onRefresh,
  onNavigateToTab,
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
  const [sku, setSku] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState<number>(15000);
  const [categoryId, setCategoryId] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [isAvailable, setIsAvailable] = useState(true);
  const [isPopular, setIsPopular] = useState(false);
  const [wholesaleEnabled, setWholesaleEnabled] = useState(false);
  const [wholesaleRules, setWholesaleRules] = useState<WholesaleRule[]>([]);
  const [selectedModifierGroupIds, setSelectedModifierGroupIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStage, setSubmitStage] = useState<string>('');

  // Catalog Audit & Anti-Duplicate States
  const [auditModalOpen, setAuditModalOpen] = useState(false);
  const [auditResult, setAuditResult] = useState<CatalogAuditResult | null>(null);
  const [auditStatusMessage, setAuditStatusMessage] = useState<string | null>(null);
  const [isDeduplicating, setIsDeduplicating] = useState(false);
  const [isAutoDeleting, setIsAutoDeleting] = useState(false);
  const [autoDeleteSetting, setAutoDeleteSetting] = useState(() =>
    FirestoreService.getAutoDeleteDuplicatesSetting()
  );

  // Proactive real-time catalog audit calculation
  const catalogAudit = useMemo(() => {
    return auditCatalogDuplicates(products);
  }, [products]);

  const handleToggleAutoDeleteSetting = (enabled: boolean) => {
    setAutoDeleteSetting(enabled);
    FirestoreService.setAutoDeleteDuplicatesSetting(enabled);
  };

  // Real-time Anti-Duplicate Check
  const duplicateCheck = useMemo(() => {
    if (!name.trim()) return { isDuplicate: false };
    return checkProductDuplicate({ name, sku, id: editingProduct?.id }, products);
  }, [name, sku, editingProduct, products]);

  // Open modal for new product
  const handleOpenNew = () => {
    setEditingProduct(null);
    setName('');
    setSku('');
    setDescription('');
    setPrice(15000);
    setCategoryId(categories[0]?.id || '');
    setImageUrl('https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=80');
    setIsAvailable(true);
    setIsPopular(false);
    setWholesaleEnabled(false);
    setWholesaleRules([]);
    setSelectedModifierGroupIds([]);
    setIsModalOpen(true);
  };

  // Open modal for editing
  const handleOpenEdit = (p: Product) => {
    setEditingProduct(p);
    setName(p.name);
    setSku(p.sku || '');
    setDescription(p.description);
    setPrice(p.price);
    setCategoryId(p.categoryId);
    setImageUrl(p.imageUrl);
    setIsAvailable(p.isAvailable);
    setIsPopular(!!p.isPopular);
    setWholesaleEnabled(!!p.wholesaleEnabled);
    setWholesaleRules(p.wholesaleRules ? [...p.wholesaleRules] : []);
    setSelectedModifierGroupIds(p.modifierGroupIds ? [...p.modifierGroupIds] : []);
    setIsModalOpen(true);
  };

  // Audit Catalog for duplicates
  const handleRunAudit = () => {
    const result = auditCatalogDuplicates(products);
    setAuditResult(result);
    setAuditStatusMessage(null);
    setAuditModalOpen(true);
  };

  // Execute safe deduplication without affecting transaction history (soft disable)
  const handleExecuteDeduplication = async () => {
    if (!auditResult || auditResult.duplicateCount === 0) return;
    setIsDeduplicating(true);
    try {
      const { deactivatedCount } = await FirestoreService.cleanupDuplicateProducts(
        auditResult.duplicateProductIds,
        auditResult.canonicalMapping
      );
      setAuditStatusMessage(`Berhasil menonaktifkan ${deactivatedCount} menu duplikat dengan aman tanpa merusak riwayat transaksi terdahulu.`);
      onRefresh();
      // Re-run audit to verify clean state
      const updatedProducts = await FirestoreService.getProducts(true);
      setAuditResult(auditCatalogDuplicates(updatedProducts));
    } catch (err: any) {
      alert('Gagal membersihkan duplikat: ' + (err?.message || 'Error tidak diketahui'));
    } finally {
      setIsDeduplicating(false);
    }
  };

  // Execute permanent auto deletion of duplicate products
  const handleExecuteAutoDelete = async (specificIds?: string[], specificMapping?: Record<string, string>) => {
    const targetAudit = auditResult || catalogAudit;
    const targetIds = specificIds || targetAudit.duplicateProductIds;
    const mapping = specificMapping || targetAudit.canonicalMapping;

    if (!targetIds || targetIds.length === 0) {
      alert('Tidak ada menu duplikat yang terdeteksi dalam katalog.');
      return;
    }

    const confirmMsg = `Konfirmasi Hapus Otomatis:\n\nApakah Anda yakin ingin MENGHAPUS PERMANEN ${targetIds.length} menu duplikat dari database?\n\n• Menu utama (canonical) akan tetap utuh dan aman.\n• Database akan dibersihkan dari rekaman ganda secara permanen.`;
    if (!window.confirm(confirmMsg)) return;

    setIsAutoDeleting(true);
    try {
      const { deletedCount, deletedNames } = await FirestoreService.autoDeleteDuplicateProducts(
        targetIds,
        mapping
      );
      setAuditStatusMessage(
        `Berhasil menghapus otomatis ${deletedCount} menu duplikat secara permanen dari database. Menu canonical tetap aman.`
      );
      alert(`Berhasil menghapus otomatis ${deletedCount} menu duplikat!\n\nDaftar menu: ${deletedNames.slice(0, 5).join(', ')}${deletedNames.length > 5 ? '... dan lainnya' : ''}`);
      onRefresh();
      const updatedProducts = await FirestoreService.getProducts(true);
      setAuditResult(auditCatalogDuplicates(updatedProducts));
    } catch (err: any) {
      alert('Gagal menghapus otomatis duplikat: ' + (err?.message || 'Error tidak diketahui'));
    } finally {
      setIsAutoDeleting(false);
    }
  };

  const handleDeleteSingleDuplicate = async (dupId: string, dupName: string, canonicalId: string) => {
    if (!window.confirm(`Hapus menu duplikat "${dupName}" dari database secara permanen?`)) return;
    setIsAutoDeleting(true);
    try {
      await FirestoreService.autoDeleteDuplicateProducts([dupId], { [dupId]: canonicalId });
      alert(`Menu duplikat "${dupName}" berhasil dihapus.`);
      onRefresh();
      const updatedProducts = await FirestoreService.getProducts(true);
      setAuditResult(auditCatalogDuplicates(updatedProducts));
    } catch (err: any) {
      alert('Gagal menghapus menu duplikat: ' + (err?.message || 'Error'));
    } finally {
      setIsAutoDeleting(false);
    }
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
    if (duplicateCheck.isDuplicate) {
      alert(duplicateCheck.message || 'Menu duplikat terdeteksi!');
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
        sku: sku.trim() || undefined,
        description: description.trim(),
        price: Number(price),
        categoryId,
        imageUrl: finalImageUrl,
        isAvailable,
        isActive: true,
        isPopular,
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

        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <button
            onClick={handleRunAudit}
            className="py-2 px-3 text-xs font-bold flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-800 hover:bg-indigo-100 transition-colors shadow-2xs"
            title="Pindai katalog untuk mendeteksi dan mengamankan menu duplikat"
          >
            <ShieldAlert className="w-4 h-4 text-indigo-600" />
            <span>Audit Duplikat</span>
            {catalogAudit.duplicateCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-rose-500 text-white rounded-full text-[10px]">
                {catalogAudit.duplicateCount}
              </span>
            )}
          </button>

          {catalogAudit.duplicateCount > 0 && (
            <button
              onClick={() => handleExecuteAutoDelete()}
              disabled={isAutoDeleting}
              className="py-2 px-3 text-xs font-bold flex items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100 transition-colors shadow-2xs"
              title="Hapus otomatis semua menu duplikat dari database"
            >
              {isAutoDeleting ? (
                <Loader2 className="w-4 h-4 animate-spin text-rose-600" />
              ) : (
                <Trash2 className="w-4 h-4 text-rose-600" />
              )}
              <span>Auto Delete ({catalogAudit.duplicateCount})</span>
            </button>
          )}

          {onNavigateToTab && (
            <button
              onClick={() => onNavigateToTab('BACKUP')}
              className="py-2 px-3 text-xs font-bold flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 transition-colors shadow-2xs"
              title="Impor produk masal via Excel (.xlsx) atau CSV"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>Impor Excel / CSV</span>
            </button>
          )}

          <button
            onClick={handleOpenNew}
            className="clay-button-primary py-2 px-3.5 text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Menu Baru</span>
          </button>
        </div>
      </div>

      {/* AUTO DELETE DUPLICATE PROACTIVE ALERT BANNER */}
      {catalogAudit.duplicateCount > 0 && (
        <div className="p-3.5 bg-gradient-to-r from-rose-50 to-amber-50 border border-rose-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-start sm:items-center gap-2.5">
            <div className="p-2 bg-rose-100 text-rose-700 rounded-xl shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-rose-900">
                Terdeteksi {catalogAudit.duplicateCount} Menu Duplikat dalam {catalogAudit.groups.length} Kelompok Menu
              </p>
              <p className="text-[11px] text-rose-700">
                Menu duplikat memenuhi katalog produk. Klik &ldquo;Auto Delete Duplikat&rdquo; untuk menghapus salinan dan mempertahankan menu asli.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
            <button
              type="button"
              onClick={handleRunAudit}
              className="px-3 py-1.5 bg-white border border-rose-200 hover:bg-rose-50 text-rose-800 rounded-xl text-xs font-bold transition-all shadow-2xs"
            >
              Lihat Rincian
            </button>
            <button
              type="button"
              disabled={isAutoDeleting}
              onClick={() => handleExecuteAutoDelete()}
              className="clay-button-danger py-1.5 px-3.5 text-xs font-bold flex items-center gap-1.5 shadow-xs disabled:opacity-50"
            >
              {isAutoDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              <span>Auto Delete Semua ({catalogAudit.duplicateCount})</span>
            </button>
          </div>
        </div>
      )}

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
                  <img
                    src={p.imageUrl || '/trimmed_store.png'}
                    alt={p.name || 'Produk'}
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = '/trimmed_store.png';
                    }}
                    className="w-full h-full object-cover"
                  />
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
          {/* Anti-Duplicate Real-time Warning Banner */}
          {duplicateCheck.isDuplicate && (
            <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-xs space-y-2">
              <div className="flex items-start gap-2 text-amber-900 font-bold">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p>{duplicateCheck.message}</p>
                  <p className="text-[11px] font-normal text-amber-800 mt-0.5">
                    Sistem anti-duplikat mendeteksi kemiripan nama / SKU untuk mencegah data ganda.
                  </p>
                </div>
              </div>
              {duplicateCheck.existingProduct && (
                <div className="flex items-center gap-2 pt-1 border-t border-amber-200">
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(duplicateCheck.existingProduct!)}
                    className="px-2.5 py-1 bg-amber-700 hover:bg-amber-800 text-white rounded-lg text-[11px] font-bold transition-colors"
                  >
                    Buka Produk yang Sudah Ada
                  </button>
                  <button
                    type="button"
                    onClick={() => setName('')}
                    className="px-2.5 py-1 bg-white hover:bg-amber-100 border border-amber-300 text-amber-800 rounded-lg text-[11px] font-bold transition-colors"
                  >
                    Ganti Nama
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-gray-700 mb-1">Nama Menu:</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={`w-full text-xs px-3 py-2 rounded-xl bg-gray-50 border focus:outline-hidden transition-colors ${
                  duplicateCheck.isDuplicate ? 'border-amber-400 bg-amber-50/50' : 'border-gray-200'
                }`}
                placeholder="Cth: Seblak Komplit Prasmanan"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">SKU / Kode Menu:</label>
              <input
                type="text"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:outline-hidden uppercase"
                placeholder="Cth: SBL-01"
              />
            </div>
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
              disabled={isSubmitting || duplicateCheck.isDuplicate}
              className="clay-button-primary py-2 px-5 text-xs font-bold shadow-md flex items-center gap-2 disabled:opacity-60"
            >
              {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{isSubmitting ? (submitStage || 'Menyimpan...') : 'Simpan Menu'}</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* Catalog Audit & Safe Deduplication Modal */}
      <Modal
        isOpen={auditModalOpen}
        onClose={() => setAuditModalOpen(false)}
        title="Audit Integritas Katalog & Anti-Duplikat"
        subtitle="Analisis produk identik & deduplikasi aman tanpa merusak riwayat transaksi"
        maxWidth="max-w-xl"
      >
        <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1 text-xs">
          {auditStatusMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-900 font-semibold flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{auditStatusMessage}</span>
            </div>
          )}

          {!auditResult || auditResult.duplicateCount === 0 ? (
            <div className="p-6 bg-emerald-50/50 rounded-2xl border border-emerald-200 text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h4 className="font-heading font-bold text-sm text-emerald-900">
                Katalog 100% Bersih &amp; Unik
              </h4>
              <p className="text-gray-600 max-w-sm mx-auto">
                Tidak ditemukan menu duplikat dalam database. Seluruh {products.length} menu memiliki nama dan kode unik.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="p-3.5 bg-rose-50 rounded-2xl border border-rose-200 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold text-rose-900">
                    Ditemukan {auditResult.duplicateCount} Menu Duplikat dalam {auditResult.groups.length} Kelompok Menu
                  </p>
                  <p className="text-[11px] text-rose-800 leading-relaxed">
                    Sistem mendeteksi menu dengan nama atau SKU yang sama. Pilih <strong>&ldquo;Auto Delete Duplikat&rdquo;</strong> untuk menghapus salinan duplikat secara permanen dari database, atau <strong>&ldquo;Deaktivasi Saja&rdquo;</strong> jika ingin menyimpannya sebagai arsip nonaktif.
                  </p>
                </div>
              </div>

              {/* Auto Delete Setting Toggle */}
              <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl flex items-center justify-between">
                <div>
                  <span className="font-bold text-indigo-950 text-xs block">Auto-Delete Duplikat Otomatis</span>
                  <span className="text-[11px] text-indigo-700">Aktifkan peringatan dan pembersihan otomatis di latar belakang</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleAutoDeleteSetting(!autoDeleteSetting)}
                  className="flex items-center gap-1.5 font-bold transition-all"
                >
                  {autoDeleteSetting ? (
                    <span className="text-emerald-700 flex items-center gap-1">
                      <ToggleRight className="w-6 h-6 text-emerald-600" />
                      <span>Aktif</span>
                    </span>
                  ) : (
                    <span className="text-gray-500 flex items-center gap-1">
                      <ToggleLeft className="w-6 h-6 text-gray-400" />
                      <span>Nonaktif</span>
                    </span>
                  )}
                </button>
              </div>

              <div className="space-y-2.5 max-h-[45vh] overflow-y-auto pr-1">
                {auditResult.groups.map((grp, idx) => (
                  <div key={idx} className="p-3 bg-gray-50 rounded-xl border border-gray-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-gray-800">
                        {idx + 1}. Nama Normal: &ldquo;{grp.normalizedName}&rdquo;
                      </span>
                      <span className="px-2 py-0.5 bg-rose-100 text-rose-800 rounded-md font-bold text-[10px]">
                        {grp.items.length} Versi ({grp.duplicates.length} Duplikat)
                      </span>
                    </div>
                    <div className="space-y-1.5 pl-2.5 border-l-2 border-indigo-400">
                      <div className="flex items-center justify-between text-[11px] bg-emerald-50/80 p-2 rounded-lg border border-emerald-200">
                        <div>
                          <strong className="text-emerald-700">Canonical (Dipertahankan):</strong> {grp.canonical.name} (Rp {grp.canonical.price.toLocaleString('id-ID')})
                          <span className="text-gray-400 block text-[10px]">ID: {grp.canonical.id}</span>
                        </div>
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded-md text-[10px] shrink-0">
                          Asli
                        </span>
                      </div>
                      {grp.duplicates.map((d) => (
                        <div key={d.id} className="flex items-center justify-between text-[11px] bg-white p-2 rounded-lg border border-rose-200">
                          <div className="pr-2">
                            <strong className="text-rose-600">Duplikat:</strong> {d.name} (Rp {d.price.toLocaleString('id-ID')})
                            <span className="text-gray-400 block text-[10px]">ID: {d.id}</span>
                          </div>
                          <button
                            type="button"
                            disabled={isAutoDeleting}
                            onClick={() => handleDeleteSingleDuplicate(d.id, d.name, grp.canonical.id)}
                            className="text-rose-700 hover:text-rose-900 hover:bg-rose-50 border border-rose-200 px-2 py-1 rounded-md text-[10px] font-bold shrink-0 transition-colors flex items-center gap-1"
                            title="Hapus permanen duplikat ini"
                          >
                            <Trash2 className="w-3 h-3 text-rose-600" />
                            <span>Hapus</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-3 border-t border-gray-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                <span className="text-[11px] text-gray-500 text-center sm:text-left">
                  {auditResult.duplicateCount} menu duplikat siap dihapus atau dinonaktifkan
                </span>
                <div className="flex items-center gap-2 justify-end">
                  <button
                    type="button"
                    disabled={isDeduplicating || isAutoDeleting}
                    onClick={handleExecuteDeduplication}
                    className="py-2 px-3 text-xs font-semibold rounded-xl border border-gray-300 hover:bg-gray-100 text-gray-700 transition-colors disabled:opacity-50"
                    title="Nonaktifkan duplikat tanpa menghapus rekaman"
                  >
                    {isDeduplicating ? 'Memproses...' : 'Deaktivasi Saja'}
                  </button>
                  <button
                    type="button"
                    disabled={isAutoDeleting || isDeduplicating}
                    onClick={() => handleExecuteAutoDelete()}
                    className="clay-button-danger py-2 px-4 text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50"
                  >
                    {isAutoDeleting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                    <span>Auto Delete ({auditResult.duplicateCount} Duplikat)</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};
