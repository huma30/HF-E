import React, { useState } from 'react';
import { Category, ModifierGroup } from '../../types';
import { FirestoreService } from '../../services/firestoreService';
import { errorService } from '../../services/errorService';
import { Modal } from '../common/Modal';
import { Plus, Edit2, Trash2, Tag, Check, X, Loader2, Sparkles } from 'lucide-react';

interface AdminCategoryManagerProps {
  categories: Category[];
  modifierGroups?: ModifierGroup[];
  onRefresh: () => void;
}

export const AdminCategoryManager: React.FC<AdminCategoryManagerProps> = ({
  categories,
  modifierGroups = [],
  onRefresh,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [icon, setIcon] = useState('🍲');
  const [sortOrder, setSortOrder] = useState(1);
  const [isActive, setIsActive] = useState(true);

  // Batch Modifier Configuration
  const [batchModifierEnabled, setBatchModifierEnabled] = useState(false);
  const [batchModifierGroupId, setBatchModifierGroupId] = useState('');
  const [batchModifierMode, setBatchModifierMode] = useState<'PER_ITEM' | 'POOL' | 'UNIFORM'>('POOL');
  const [batchModifierRequired, setBatchModifierRequired] = useState(true);
  const [batchModifierMinSelection, setBatchModifierMinSelection] = useState<number>(1);
  const [batchModifierMaxSelection, setBatchModifierMaxSelection] = useState<number>(2);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleOpenNew = () => {
    setEditingCategory(null);
    setName('');
    setSlug('');
    setIcon('🍲');
    setSortOrder(categories.length + 1);
    setIsActive(true);
    setBatchModifierEnabled(false);
    setBatchModifierGroupId(modifierGroups[0]?.id || '');
    setBatchModifierMode('POOL');
    setBatchModifierRequired(true);
    setBatchModifierMinSelection(1);
    setBatchModifierMaxSelection(2);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (c: Category) => {
    setEditingCategory(c);
    setName(c.name);
    setSlug(c.slug);
    setIcon(c.icon || c.iconName || '🍲');
    setSortOrder(c.sortOrder);
    setIsActive(c.isActive);
    setBatchModifierEnabled(!!c.batchModifierEnabled);
    setBatchModifierGroupId(c.batchModifierGroupId || modifierGroups[0]?.id || '');
    setBatchModifierMode(c.batchModifierMode || 'POOL');
    setBatchModifierRequired(c.batchModifierRequired !== false);
    setBatchModifierMinSelection(
      c.batchModifierMinSelection !== undefined
        ? Number(c.batchModifierMinSelection)
        : (c.batchModifierRequired !== false ? 1 : 0)
    );
    setBatchModifierMaxSelection(
      c.batchModifierMaxSelection !== undefined && Number(c.batchModifierMaxSelection) > 0
        ? Number(c.batchModifierMaxSelection)
        : 2
    );
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('Nama kategori wajib diisi.');
      return;
    }

    if (batchModifierEnabled) {
      if (!batchModifierGroupId) {
        alert('Pilih Grup Modifier Bumbu terlebih dahulu.');
        return;
      }
      const safeMin = batchModifierRequired ? Math.max(1, Number(batchModifierMinSelection) || 1) : Math.max(0, Number(batchModifierMinSelection) || 0);
      const safeMax = Math.max(1, Number(batchModifierMaxSelection) || 1);
      if (safeMin > safeMax) {
        alert(`Batas minimal (${safeMin}) tidak boleh lebih besar dari batas maksimal (${safeMax}).`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const generatedSlug = slug.trim() || name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const safeMin = batchModifierRequired ? Math.max(1, Number(batchModifierMinSelection) || 1) : Math.max(0, Number(batchModifierMinSelection) || 0);
      const safeMax = Math.max(safeMin, Math.max(1, Number(batchModifierMaxSelection) || 2));

      const payload: Omit<Category, 'id'> = {
        name: name.trim(),
        slug: generatedSlug,
        icon: icon.trim() || '🍲',
        iconName: icon.trim() || '🍲',
        sortOrder: Number(sortOrder) || 1,
        isActive,
        batchModifierEnabled,
        batchModifierGroupId: batchModifierEnabled ? batchModifierGroupId : undefined,
        batchModifierMode: batchModifierEnabled ? batchModifierMode : undefined,
        batchModifierRequired: batchModifierEnabled ? batchModifierRequired : undefined,
        batchModifierMinSelection: batchModifierEnabled ? safeMin : undefined,
        batchModifierMaxSelection: batchModifierEnabled ? safeMax : undefined,
      };

      if (editingCategory) {
        await FirestoreService.updateCategory(editingCategory.id, payload);
      } else {
        await FirestoreService.createCategory(payload);
      }

      setIsModalOpen(false);
      onRefresh();
    } catch (err: any) {
      errorService.capture(err, { action: 'saveCategory', name });
      alert(err?.message || 'Gagal menyimpan kategori.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (c: Category) => {
    if (confirm(`Hapus kategori "${c.name}"?`)) {
      try {
        await FirestoreService.deleteCategory(c.id);
        onRefresh();
      } catch (err) {
        alert('Gagal menghapus kategori.');
      }
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading font-extrabold text-xl text-[#2E1A47]">
            Manajemen Kategori
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Atur urutan, pengelompokan menu, dan pilihan bumbu massal (Batch Modifier)
          </p>
        </div>

        <button
          onClick={handleOpenNew}
          className="clay-button-primary py-2 px-3.5 text-xs font-bold flex items-center gap-1.5 shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah Kategori</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {categories.map((c) => (
          <div
            key={c.id}
            className="clay-card p-4 flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center">
                {c.icon || '🍲'}
              </span>
              <div>
                <div className="flex items-center gap-1.5">
                  <h4 className="font-heading font-bold text-sm text-[#2E1A47]">{c.name}</h4>
                  {c.batchModifierEnabled && (
                    <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-[10px] font-bold rounded-md flex items-center gap-0.5">
                      <Sparkles className="w-2.5 h-2.5" />
                      Bumbu Massal ({c.batchModifierRequired !== false ? 'Wajib' : 'Opsional'} • 0/{c.batchModifierMaxSelection ?? 2})
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-gray-400">
                  Urutan ke-{c.sortOrder} • {c.isActive ? 'Aktif' : 'Nonaktif'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => handleOpenEdit(c)}
                className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-[#2E1A47]"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleDelete(c)}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-rose-50 hover:text-rose-600"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingCategory ? 'Edit Kategori' : 'Tambah Kategori'}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Nama Kategori:</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full text-xs px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:outline-hidden"
              placeholder="Cth: Aneka Gorengan / Seblak"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Icon / Emoji:</label>
              <input
                type="text"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-center text-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Nomor Urut:</label>
              <input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value) || 1)}
                className="w-full text-xs px-3 py-2 rounded-xl bg-gray-50 border border-gray-200"
              />
            </div>
          </div>

          {/* Batch Modifier Section */}
          <div className="p-3 bg-purple-50/70 border border-purple-200 rounded-xl space-y-2.5">
            <label className="flex items-center gap-2 text-xs font-bold text-[#2E1A47] cursor-pointer">
              <input
                type="checkbox"
                checked={batchModifierEnabled}
                onChange={(e) => setBatchModifierEnabled(e.target.checked)}
                className="rounded-sm text-[#2E1A47]"
              />
              <span className="flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-[#FF4500]" />
                Aktifkan Pilihan Bumbu Massal (Batch Modifier)
              </span>
            </label>
            <p className="text-[11px] text-gray-500">
              Pelanggan memilih bumbu/rasa sekaligus untuk seluruh produk dalam kategori ini saat checkout.
            </p>

            {batchModifierEnabled && (
              <div className="pt-2 border-t border-purple-200/60 space-y-2">
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">
                    Grup Modifier Bumbu:
                  </label>
                  <select
                    value={batchModifierGroupId}
                    onChange={(e) => setBatchModifierGroupId(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-xl bg-white border border-gray-200 font-semibold"
                  >
                    <option value="">-- Pilih Grup Modifier --</option>
                    {modifierGroups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name} ({g.items.length} opsi)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 mb-1">
                      Mode Alokasi:
                    </label>
                    <select
                      value={batchModifierMode}
                      onChange={(e) => setBatchModifierMode(e.target.value as 'PER_ITEM' | 'POOL')}
                      className="w-full text-xs px-2.5 py-1.5 rounded-xl bg-white border border-gray-200"
                    >
                      <option value="POOL">Jatah Pool Bebas (Checkbox)</option>
                      <option value="PER_ITEM">1 pcs = 1 bumbu</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 mb-1">
                      Sifat Pilihan:
                    </label>
                    <select
                      value={batchModifierRequired ? 'REQUIRED' : 'OPTIONAL'}
                      onChange={(e) => {
                        const isReq = e.target.value === 'REQUIRED';
                        setBatchModifierRequired(isReq);
                        if (isReq && batchModifierMinSelection === 0) {
                          setBatchModifierMinSelection(1);
                        }
                      }}
                      className="w-full text-xs px-2.5 py-1.5 rounded-xl bg-white border border-gray-200"
                    >
                      <option value="REQUIRED">Wajib Dipilih (Min. 1)</option>
                      <option value="OPTIONAL">Opsional (Boleh 0)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 mb-1">
                      Minimal Pilihan (Min):
                    </label>
                    <input
                      type="number"
                      min={batchModifierRequired ? 1 : 0}
                      max={batchModifierMaxSelection || 10}
                      value={batchModifierMinSelection}
                      onChange={(e) => setBatchModifierMinSelection(Math.max(batchModifierRequired ? 1 : 0, Number(e.target.value) || 0))}
                      className="w-full text-xs px-3 py-2 rounded-xl bg-white border border-gray-200 font-semibold"
                    />
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {batchModifierRequired ? 'Wajib minimal 1 pilihan' : '0 = bebas / opsional'}
                    </p>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 mb-1">
                      Maksimal Pilihan (Max):
                    </label>
                    <input
                      type="number"
                      min={Math.max(1, batchModifierMinSelection)}
                      max={20}
                      value={batchModifierMaxSelection}
                      onChange={(e) => setBatchModifierMaxSelection(Math.max(1, Number(e.target.value) || 1))}
                      className="w-full text-xs px-3 py-2 rounded-xl bg-white border border-gray-200 font-semibold"
                    />
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      Batas jumlah opsi yang bisa dicentang customer
                    </p>
                  </div>
                </div>

                <div className="p-2.5 bg-purple-100/60 rounded-xl border border-purple-200 text-[11px] text-[#2E1A47]">
                  <p className="font-bold flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-[#FF4500]" />
                    Pratinjau Pengaturan:
                  </p>
                  <p className="text-[11px] text-gray-600 mt-0.5">
                    Customer akan melihat badge <strong>{batchModifierRequired ? 'Wajib' : 'Opsional'}</strong> dengan counter <strong>0/{batchModifierMaxSelection}</strong>. Tombol simpan aktif bila customer memilih antara <strong>{batchModifierMinSelection}</strong> hingga <strong>{batchModifierMaxSelection}</strong> bumbu.
                  </p>
                </div>
              </div>
            )}
          </div>

          <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded-sm text-[#2E1A47]"
            />
            <span>Aktifkan Kategori</span>
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
              <span>{isSubmitting ? 'Menyimpan...' : 'Simpan Kategori'}</span>
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
