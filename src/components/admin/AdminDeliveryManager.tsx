import React, { useState } from 'react';
import { DeliveryArea } from '../../types';
import { FirestoreService } from '../../services/firestoreService';
import { errorService } from '../../services/errorService';
import { Modal } from '../common/Modal';
import { Plus, Edit2, Trash2, MapPin, Clock, Check, X, Loader2 } from 'lucide-react';

interface AdminDeliveryManagerProps {
  deliveryAreas: DeliveryArea[];
  onRefresh: () => void;
}

export const AdminDeliveryManager: React.FC<AdminDeliveryManagerProps> = ({
  deliveryAreas,
  onRefresh,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingArea, setEditingArea] = useState<DeliveryArea | null>(null);

  const [name, setName] = useState('');
  const [deliveryFee, setDeliveryFee] = useState<number>(0);
  const [minOrderAmount, setMinOrderAmount] = useState<number>(15000);
  const [estimatedMinutes, setEstimatedMinutes] = useState<number>(20);
  const [isActive, setIsActive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleOpenNew = () => {
    setEditingArea(null);
    setName('');
    setDeliveryFee(2000);
    setMinOrderAmount(20000);
    setEstimatedMinutes(25);
    setIsActive(true);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (a: DeliveryArea) => {
    setEditingArea(a);
    setName(a.name);
    setDeliveryFee(a.deliveryFee);
    setMinOrderAmount(a.minOrderAmount);
    setEstimatedMinutes(a.estimatedDeliveryMinutes);
    setIsActive(a.isActive);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('Nama area pengantaran wajib diisi.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: Omit<DeliveryArea, 'id'> = {
        name: name.trim(),
        deliveryFee: Number(deliveryFee) || 0,
        minOrderAmount: Number(minOrderAmount) || 0,
        estimatedDeliveryMinutes: Math.max(1, Number(estimatedMinutes) || 20),
        isActive,
      };

      if (editingArea) {
        await FirestoreService.updateDeliveryArea(editingArea.id, payload);
      } else {
        await FirestoreService.createDeliveryArea(payload);
      }

      setIsModalOpen(false);
      onRefresh();
    } catch (err: any) {
      errorService.capture(err, { action: 'saveDeliveryArea', name });
      alert(err?.message || 'Gagal menyimpan area pengantaran.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (a: DeliveryArea) => {
    if (confirm(`Hapus area pengantaran "${a.name}"?`)) {
      try {
        await FirestoreService.deleteDeliveryArea(a.id);
        onRefresh();
      } catch (err) {
        alert('Gagal menghapus area pengantaran.');
      }
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading font-extrabold text-xl text-[#2E1A47]">
            Zona & Ongkos Pengantaran
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Tentukan tarif ongkir, estimasi waktu antar, dan batas minimal pembelian
          </p>
        </div>

        <button
          onClick={handleOpenNew}
          className="clay-button-primary py-2 px-3.5 text-xs font-bold flex items-center gap-1.5 shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah Area</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {deliveryAreas.map((a) => (
          <div key={a.id} className="clay-card p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="font-heading font-bold text-sm text-[#2E1A47] flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-[#FF4500]" />
                  <span>{a.name}</span>
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    a.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {a.isActive ? 'Aktif' : 'Nonaktif'}
                </span>
              </div>

              <div className="mt-3 space-y-1 text-xs text-gray-600">
                <div className="flex justify-between">
                  <span>Ongkos Kirim:</span>
                  <span className="font-bold text-[#FF4500]">
                    {a.deliveryFee === 0 ? 'Gratis' : `Rp ${a.deliveryFee.toLocaleString('id-ID')}`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Min. Pesanan:</span>
                  <span className="font-semibold text-gray-800">
                    Rp {a.minOrderAmount.toLocaleString('id-ID')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Estimasi Sampai:</span>
                  <span className="font-semibold text-gray-800">
                    ±{a.estimatedDeliveryMinutes} Menit
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-3 pt-2 border-t border-gray-100 flex justify-end gap-1.5">
              <button
                onClick={() => handleOpenEdit(a)}
                className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-[#2E1A47]"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleDelete(a)}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-rose-50 hover:text-rose-600"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingArea ? 'Edit Area Pengantaran' : 'Tambah Area Pengantaran'}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Nama Area / Blok:</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Cth: Perum Gina Blok A-C (Internal)"
              className="w-full text-xs px-3 py-2 rounded-xl bg-gray-50 border border-gray-200"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Ongkos Kirim (Rp):</label>
              <input
                type="number"
                value={deliveryFee}
                onChange={(e) => setDeliveryFee(Number(e.target.value) || 0)}
                placeholder="0 untuk gratis"
                className="w-full text-xs px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Min. Belanja (Rp):</label>
              <input
                type="number"
                value={minOrderAmount}
                onChange={(e) => setMinOrderAmount(Number(e.target.value) || 0)}
                className="w-full text-xs px-3 py-2 rounded-xl bg-gray-50 border border-gray-200"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              Estimasi Pengantaran (Menit):
            </label>
            <input
              type="number"
              value={estimatedMinutes}
              onChange={(e) => setEstimatedMinutes(Number(e.target.value) || 20)}
              className="w-full text-xs px-3 py-2 rounded-xl bg-gray-50 border border-gray-200"
            />
          </div>

          <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded-sm text-[#2E1A47]"
            />
            <span>Area Layanan Aktif</span>
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
              <span>{isSubmitting ? 'Menyimpan...' : 'Simpan Area'}</span>
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
