import React, { useState } from 'react';
import { Banner } from '../../types';
import { FirestoreService } from '../../services/firestoreService';
import { StorageService } from '../../services/storageService';
import { errorService } from '../../services/errorService';
import { Modal } from '../common/Modal';
import { ImageUploadField } from '../common/ImageUploadField';
import { Plus, Edit2, Trash2, Image as ImageIcon, Check, X, Loader2 } from 'lucide-react';

interface AdminBannerManagerProps {
  banners: Banner[];
  onRefresh: () => void;
}

export const AdminBannerManager: React.FC<AdminBannerManagerProps> = ({ banners, onRefresh }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null);

  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [ctaText, setCtaText] = useState('Pesan Sekarang');
  const [isActive, setIsActive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStage, setSubmitStage] = useState('');

  const handleOpenNew = () => {
    setEditingBanner(null);
    setTitle('Spesial Promo Baru');
    setSubtitle('Nikmati sensasi kelezatan kuliner lokal HUMA');
    setImageUrl('https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=1200&auto=format&fit=crop&q=80');
    setCtaText('Pesan Sekarang');
    setIsActive(true);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (b: Banner) => {
    setEditingBanner(b);
    setTitle(b.title);
    setSubtitle(b.subtitle || '');
    setImageUrl(b.imageUrl);
    setCtaText(b.ctaText || 'Pesan Sekarang');
    setIsActive(b.isActive);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      alert('Judul banner wajib diisi.');
      return;
    }
    if (!imageUrl.trim()) {
      alert('Gambar banner wajib diisi atau diunggah.');
      return;
    }

    setIsSubmitting(true);
    setSubmitStage('Menyiapkan banner...');
    try {
      let finalImageUrl = imageUrl.trim();
      if (finalImageUrl.startsWith('data:')) {
        setSubmitStage('Mengompresi & mengunggah banner WebP...');
        const cleanSlug = title.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 20);
        finalImageUrl = await StorageService.uploadDataUrl(
          finalImageUrl,
          'banners',
          `banner_${cleanSlug}_${Date.now()}.webp`
        );
      }

      setSubmitStage('Menyimpan banner ke database...');
      const payload: Omit<Banner, 'id'> = StorageService.cleanPayload({
        title: title.trim(),
        subtitle: subtitle.trim(),
        imageUrl: finalImageUrl,
        ctaText: ctaText.trim() || 'Pesan Sekarang',
        sortOrder: editingBanner?.sortOrder || (banners.length + 1),
        isActive,
      });

      if (editingBanner) {
        await FirestoreService.updateBanner(editingBanner.id, payload);
      } else {
        await FirestoreService.createBanner(payload);
      }

      setIsModalOpen(false);
      onRefresh();
    } catch (err: any) {
      errorService.capture(err, { action: 'saveBanner', title });
      alert(err?.message || 'Gagal menyimpan banner promo.');
    } finally {
      setIsSubmitting(false);
      setSubmitStage('');
    }
  };

  const handleDelete = async (b: Banner) => {
    if (confirm(`Hapus banner "${b.title}"?`)) {
      try {
        await FirestoreService.deleteBanner(b.id);
        onRefresh();
      } catch (err) {
        alert('Gagal menghapus banner.');
      }
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading font-extrabold text-xl text-[#2E1A47]">
            Banner Slider Promo
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Banner promosi yang tampil di halaman beranda pelanggan
          </p>
        </div>

        <button
          onClick={handleOpenNew}
          className="clay-button-primary py-2 px-3.5 text-xs font-bold flex items-center gap-1.5 shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah Banner</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {banners.map((b) => (
          <div key={b.id} className="clay-card overflow-hidden p-0">
            <div className="relative h-40 w-full bg-gray-100">
              <img src={b.imageUrl} alt={b.title} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent p-4 flex flex-col justify-end text-white">
                <h4 className="font-heading font-extrabold text-base">{b.title}</h4>
                <p className="text-xs text-gray-200 mt-0.5">{b.subtitle}</p>
              </div>
            </div>

            <div className="p-3 flex items-center justify-between bg-white text-xs">
              <span
                className={`font-bold px-2 py-0.5 rounded-full ${
                  b.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'
                }`}
              >
                {b.isActive ? 'Aktif' : 'Nonaktif'}
              </span>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleOpenEdit(b)}
                  className="p-1.5 rounded-lg text-gray-600 hover:bg-gray-100"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(b)}
                  className="p-1.5 rounded-lg text-gray-400 hover:bg-rose-50 hover:text-rose-600"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingBanner ? 'Edit Banner Promo' : 'Tambah Banner Promo'}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Judul Banner:</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full text-xs px-3 py-2 rounded-xl bg-gray-50 border border-gray-200"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Subjudul / Deskripsi:</label>
            <input
              type="text"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              className="w-full text-xs px-3 py-2 rounded-xl bg-gray-50 border border-gray-200"
            />
          </div>

          <div>
            <ImageUploadField
              label="Gambar Banner Promo"
              helperText="Unggah foto atau masukkan link gambar banner (resolusi rekomendasi: 1200x500px, maks 3MB)"
              value={imageUrl}
              onChange={setImageUrl}
              aspectRatio="banner"
              preset="banner"
              folder="banners"
            />
          </div>

          <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded-sm text-[#2E1A47]"
            />
            <span>Tampilkan di Beranda</span>
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
              <span>{isSubmitting ? (submitStage || 'Menyimpan...') : 'Simpan Banner'}</span>
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
