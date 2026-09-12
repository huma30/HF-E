import React, { useState, useMemo } from 'react';
import { ModifierGroup, ModifierItem } from '../../types';
import { FirestoreService } from '../../services/firestoreService';
import { errorService } from '../../services/errorService';
import { Modal } from '../common/Modal';
import {
  Plus,
  Edit2,
  Trash2,
  Check,
  X,
  Layers,
  PlusCircle,
  Loader2,
  Search,
  RotateCcw,
  Sparkles,
} from 'lucide-react';

interface AdminModifierManagerProps {
  modifierGroups: ModifierGroup[];
  onRefresh: () => void;
}

export const AdminModifierManager: React.FC<AdminModifierManagerProps> = ({
  modifierGroups,
  onRefresh,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ModifierGroup | null>(null);

  // Search Engine & Filter States
  const [searchKeyword, setSearchKeyword] = useState('');
  const [filterRequirement, setFilterRequirement] = useState<'ALL' | 'REQUIRED' | 'OPTIONAL' | 'HAS_PRICE'>('ALL');

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isRequired, setIsRequired] = useState(false);
  const [minSelection, setMinSelection] = useState(0);
  const [maxSelection, setMaxSelection] = useState(1);
  const [items, setItems] = useState<ModifierItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleOpenNew = () => {
    setEditingGroup(null);
    setName('');
    setDescription('');
    setIsRequired(false);
    setMinSelection(0);
    setMaxSelection(1);
    setItems([
      { id: 'item_1', name: 'Opsi 1', price: 0, isActive: true, sortOrder: 1 },
      { id: 'item_2', name: 'Opsi 2', price: 3000, isActive: true, sortOrder: 2 },
    ]);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (g: ModifierGroup) => {
    setEditingGroup(g);
    setName(g.name);
    setDescription(g.description || '');
    setIsRequired(g.isRequired);
    setMinSelection(g.minSelection);
    setMaxSelection(g.maxSelection);
    setItems([...g.items]);
    setIsModalOpen(true);
  };

  const handleAddItemRow = () => {
    const nextIdx = items.length + 1;
    setItems((prev) => [
      ...prev,
      { id: `item_${Date.now()}`, name: `Varian Baru`, price: 0, isActive: true, sortOrder: nextIdx },
    ]);
  };

  const handleUpdateItem = (index: number, field: keyof ModifierItem, value: any) => {
    setItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('Nama grup modifier wajib diisi.');
      return;
    }

    const cleanItems = items
      .filter((it) => it.name.trim().length > 0)
      .map((it, idx) => ({
        id: it.id || `mod_${Date.now()}_${idx}`,
        name: it.name.trim(),
        price: Number(it.price) || 0,
        isActive: it.isActive !== false,
        sortOrder: idx + 1,
      }));

    if (cleanItems.length === 0) {
      alert('Harap masukkan minimal 1 opsi varian/add-on untuk grup ini.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: Omit<ModifierGroup, 'id'> = {
        name: name.trim(),
        description: description.trim(),
        isRequired,
        minSelection: isRequired ? Math.max(1, Number(minSelection) || 1) : 0,
        maxSelection: Math.max(1, Number(maxSelection) || 1),
        isActive: true,
        items: cleanItems,
      };

      if (editingGroup) {
        await FirestoreService.updateModifierGroup(editingGroup.id, payload);
      } else {
        await FirestoreService.createModifierGroup(payload);
      }

      setIsModalOpen(false);
      onRefresh();
    } catch (err: any) {
      errorService.capture(err, { action: 'saveModifierGroup', name });
      alert(err?.message || 'Gagal menyimpan grup modifier.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteGroup = async (g: ModifierGroup) => {
    if (confirm(`Hapus grup modifier "${g.name}"?`)) {
      try {
        await FirestoreService.deleteModifierGroup(g.id);
        onRefresh();
      } catch (err) {
        alert('Gagal menghapus grup modifier.');
      }
    }
  };

  // Search Engine Metrics & Computed Filtered Modifier Groups
  const countRequired = useMemo(() => modifierGroups.filter((g) => g.isRequired).length, [modifierGroups]);
  const countOptional = useMemo(() => modifierGroups.filter((g) => !g.isRequired).length, [modifierGroups]);
  const countWithPrice = useMemo(
    () => modifierGroups.filter((g) => g.items?.some((it) => it.price > 0)).length,
    [modifierGroups]
  );

  const filteredModifierGroups = useMemo(() => {
    const q = searchKeyword.trim().toLowerCase();

    return modifierGroups.filter((group) => {
      // Keyword search matches: group name, description, or any modifier item name
      if (q) {
        const nameMatch = group.name?.toLowerCase().includes(q);
        const descMatch = group.description?.toLowerCase().includes(q);
        const itemMatch = group.items?.some((it) => it.name?.toLowerCase().includes(q));

        if (!nameMatch && !descMatch && !itemMatch) {
          return false;
        }
      }

      // Requirement & Price Filters
      if (filterRequirement === 'REQUIRED' && !group.isRequired) return false;
      if (filterRequirement === 'OPTIONAL' && group.isRequired) return false;
      if (filterRequirement === 'HAS_PRICE' && !group.items?.some((it) => it.price > 0)) return false;

      return true;
    });
  }, [modifierGroups, searchKeyword, filterRequirement]);

  const isSearchFiltered = searchKeyword.trim().length > 0 || filterRequirement !== 'ALL';

  const handleResetFilters = () => {
    setSearchKeyword('');
    setFilterRequirement('ALL');
  };

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-heading font-extrabold text-xl text-[#2E1A47]">
            Manajemen Modifier & Add-on
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Atur pilihan level pedas, ekstra topping seblak, bumbu batch, atau kuah
          </p>
        </div>

        <button
          onClick={handleOpenNew}
          className="clay-button-primary py-2 px-3.5 text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah Grup Opsi</span>
        </button>
      </div>

      {/* SEARCH ENGINE & FILTER CONTROLS */}
      <div className="bg-white p-3.5 rounded-2xl border border-gray-200 shadow-xs space-y-3">
        {/* Main Search Input */}
        <div className="relative w-full">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3 pointer-events-none" />
          <input
            type="text"
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            placeholder="Cari grup modifier, bumbu, atau opsi (cth: Balado, Pedas, Keju, Kuah)..."
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

        {/* Filter Chips & Counter */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-gray-100">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setFilterRequirement('ALL')}
              className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
                filterRequirement === 'ALL'
                  ? 'bg-[#2E1A47] text-white shadow-xs'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Semua ({modifierGroups.length})
            </button>

            <button
              type="button"
              onClick={() => setFilterRequirement('REQUIRED')}
              className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
                filterRequirement === 'REQUIRED'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
              }`}
            >
              Wajib ({countRequired})
            </button>

            <button
              type="button"
              onClick={() => setFilterRequirement('OPTIONAL')}
              className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
                filterRequirement === 'OPTIONAL'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'
              }`}
            >
              Opsional ({countOptional})
            </button>

            <button
              type="button"
              onClick={() => setFilterRequirement('HAS_PRICE')}
              className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
                filterRequirement === 'HAS_PRICE'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
              }`}
            >
              Ada Biaya ({countWithPrice})
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-gray-500">
              Menampilkan <strong>{filteredModifierGroups.length}</strong> dari {modifierGroups.length} grup
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

      {/* Grid of Modifier Groups */}
      {filteredModifierGroups.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center text-gray-500 space-y-2">
          <Search className="w-10 h-10 text-gray-300 mx-auto" />
          <h4 className="font-heading font-bold text-sm text-gray-700">
            Tidak ada grup modifier yang sesuai pencarian
          </h4>
          <p className="text-xs text-gray-400 max-w-sm mx-auto">
            Coba ketik nama modifier yang berbeda (misal: "bumbu", "level", "keju") atau ganti filter.
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredModifierGroups.map((group) => (
          <div key={group.id} className="clay-card p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h4 className="font-heading font-bold text-sm text-[#2E1A47] flex items-center gap-2">
                  {group.name}
                  {group.isRequired ? (
                    <span className="text-[10px] px-2 py-0.2 rounded-full bg-rose-50 text-rose-700 font-extrabold">
                      Wajib
                    </span>
                  ) : (
                    <span className="text-[10px] px-2 py-0.2 rounded-full bg-gray-100 text-gray-600 font-semibold">
                      Opsional
                    </span>
                  )}
                </h4>
                {group.description && (
                  <p className="text-xs text-gray-500 mt-0.5">{group.description}</p>
                )}
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Maks. {group.maxSelection} pilihan
                </p>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleOpenEdit(group)}
                  className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-[#2E1A47]"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDeleteGroup(group)}
                  className="p-1.5 rounded-lg text-gray-400 hover:bg-rose-50 hover:text-rose-600"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Items tags */}
            <div className="flex flex-wrap gap-1.5 pt-1 border-t border-gray-100">
              {group.items.map((item) => (
                <span
                  key={item.id}
                  className="px-2.5 py-1 rounded-lg bg-gray-50 border border-gray-200 text-xs font-semibold text-gray-700 flex items-center gap-1.5"
                >
                  <span>{item.name}</span>
                  <span className="text-[11px] text-[#FF4500] font-extrabold">
                    {item.price > 0 ? `+Rp ${item.price.toLocaleString('id-ID')}` : 'Gratis'}
                  </span>
                </span>
              ))}
            </div>
          </div>
        ))}
        </div>
      )}

      {/* Modifier Group Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingGroup ? 'Edit Grup Modifier' : 'Tambah Grup Modifier'}
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleSave} className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Nama Grup:</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full text-xs px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:outline-hidden"
              placeholder="Cth: Level Pedas / Tambahan Topping"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Maksimal Pilihan:</label>
              <input
                type="number"
                min={1}
                value={maxSelection}
                onChange={(e) => setMaxSelection(Number(e.target.value) || 1)}
                className="w-full text-xs px-3 py-2 rounded-xl bg-gray-50 border border-gray-200"
              />
            </div>
            <div className="flex items-center pt-5">
              <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={isRequired}
                  onChange={(e) => setIsRequired(e.target.checked)}
                  className="rounded-sm text-[#FF4500]"
                />
                <span>Wajib Dipilih Pembeli</span>
              </label>
            </div>
          </div>

          {/* Items Editor */}
          <div className="bg-gray-50 p-3.5 rounded-2xl border border-gray-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <h5 className="font-heading font-bold text-xs text-[#2E1A47]">Daftar Pilihan / Opsi:</h5>
              <button
                type="button"
                onClick={handleAddItemRow}
                className="text-xs text-[#FF4500] font-bold flex items-center gap-1 hover:underline"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Tambah Opsi</span>
              </button>
            </div>

            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={item.id} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={item.name}
                    onChange={(e) => handleUpdateItem(idx, 'name', e.target.value)}
                    placeholder="Nama Varian (cth: Level 1)"
                    className="flex-1 text-xs p-2 bg-white rounded-xl border border-gray-200"
                  />
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-gray-400 font-semibold">+Rp</span>
                    <input
                      type="number"
                      value={item.price}
                      onChange={(e) => handleUpdateItem(idx, 'price', Number(e.target.value) || 0)}
                      placeholder="0"
                      className="w-24 text-xs p-2 bg-white rounded-xl border border-gray-200 font-bold"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveItem(idx)}
                    className="text-gray-400 hover:text-rose-600 p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
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
              className="clay-button-primary py-2 px-5 text-xs font-bold flex items-center gap-2 disabled:opacity-60"
            >
              {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{isSubmitting ? 'Menyimpan...' : 'Simpan Modifier'}</span>
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
