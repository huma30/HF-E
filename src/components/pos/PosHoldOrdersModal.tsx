import React from 'react';
import { CartItem, OrderGroup } from '../../types';
import { Modal } from '../common/Modal';
import { Clock, Play, Trash2, ShoppingBag } from 'lucide-react';

export interface HeldOrder {
  id: string;
  note: string;
  items: CartItem[];
  groups?: OrderGroup[];
  heldAt: string;
  total: number;
}

interface PosHoldOrdersModalProps {
  isOpen: boolean;
  onClose: () => void;
  heldOrders: HeldOrder[];
  onRecallOrder: (order: HeldOrder) => void;
  onDeleteHeldOrder: (id: string) => void;
}

export const PosHoldOrdersModal: React.FC<PosHoldOrdersModalProps> = ({
  isOpen,
  onClose,
  heldOrders,
  onRecallOrder,
  onDeleteHeldOrder,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Daftar Pesanan Ditahan (Hold)"
      subtitle="Panggil kembali pesanan yang sedang diparkir"
      maxWidth="max-w-md"
    >
      <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
        {heldOrders.length === 0 ? (
          <div className="py-8 text-center text-gray-400">
            <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-xs font-semibold">Tidak ada pesanan yang ditahan saat ini.</p>
          </div>
        ) : (
          heldOrders.map((held) => (
            <div
              key={held.id}
              className="p-3 bg-gray-50 rounded-2xl border border-gray-200 flex items-center justify-between gap-3"
            >
              <div>
                <div className="flex items-center gap-1.5 font-bold text-xs text-[#2E1A47]">
                  <span>{held.note || 'Pesanan Parkir'}</span>
                  <span className="text-[10px] text-gray-400 font-normal">
                    • {new Date(held.heldAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  {(held.groups?.reduce((sum, group) => sum + group.items.reduce((s, item) => s + item.quantity, 0), 0) || 0) + held.items.reduce((s, item) => s + item.quantity, 0)} item • Rp {held.total.toLocaleString('id-ID')}
                </p>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    onRecallOrder(held);
                    onClose();
                  }}
                  className="px-3 py-1.5 bg-[#2E1A47] hover:bg-[#FF4500] text-white rounded-xl text-xs font-bold flex items-center gap-1 transition-colors"
                >
                  <Play className="w-3 h-3 fill-white" />
                  <span>Recall</span>
                </button>
                <button
                  onClick={() => onDeleteHeldOrder(held.id)}
                  className="p-1.5 text-gray-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                  title="Hapus"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </Modal>
  );
};
