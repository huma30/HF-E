import React, { useMemo, useState } from 'react';
import { Order, OrderStatus, StoreSettings } from '../../types';
import { FirestoreService } from '../../services/firestoreService';
import { soundService } from '../../services/audioNotification';
import { ThermalReceiptModal } from '../pos/ThermalReceiptModal';
import {
  Clock,
  CheckCircle2,
  ChefHat,
  PackageCheck,
  Truck,
  CheckCheck,
  XCircle,
  Printer,
  MessageCircle,
  AlertTriangle,
  Search,
} from 'lucide-react';


type FirestoreTimestampLike = {
  seconds?: number;
  nanoseconds?: number;
  toMillis?: () => number;
  toDate?: () => Date;
};

const getOrderTimestamp = (createdAt: Order['createdAt'] | FirestoreTimestampLike | string | number | null | undefined): number => {
  if (!createdAt) return 0;

  if (typeof createdAt === 'number' && Number.isFinite(createdAt)) {
    return createdAt;
  }

  if (typeof createdAt === 'string') {
    const parsed = Date.parse(createdAt);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  if (typeof createdAt === 'object') {
    const value = createdAt as FirestoreTimestampLike;

    if (typeof value.toMillis === 'function') {
      const millis = value.toMillis();
      if (Number.isFinite(millis)) return millis;
    }

    if (typeof value.toDate === 'function') {
      const date = value.toDate();
      const millis = date?.getTime?.();
      if (Number.isFinite(millis)) return millis;
    }

    if (typeof value.seconds === 'number' && Number.isFinite(value.seconds)) {
      const nanos = typeof value.nanoseconds === 'number' && Number.isFinite(value.nanoseconds)
        ? value.nanoseconds
        : 0;
      return value.seconds * 1000 + Math.floor(nanos / 1_000_000);
    }
  }

  return 0;
};

interface AdminOrderMonitorProps {
  orders: Order[];
  settings: StoreSettings | null;
}

export const AdminOrderMonitor: React.FC<AdminOrderMonitorProps> = ({ orders, settings }) => {
  const [selectedStatusTab, setSelectedStatusTab] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });
  const [sortDirection, setSortDirection] = useState<'DESC' | 'ASC'>('DESC');
  const [activeReceiptOrder, setActiveReceiptOrder] = useState<Order | null>(null);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);

  // Status mapping
  const statusTabs: { key: string; label: string; count: number; color: string }[] = [
    { key: 'ALL', label: 'Semua', count: orders.length, color: 'bg-gray-100 text-gray-700' },
    {
      key: 'PENDING',
      label: 'Menunggu',
      count: orders.filter((o) => o.status === 'PENDING').length,
      color: 'bg-amber-100 text-amber-800',
    },
    {
      key: 'CONFIRMED',
      label: 'Dikonfirmasi',
      count: orders.filter((o) => o.status === 'CONFIRMED').length,
      color: 'bg-blue-100 text-blue-800',
    },
    {
      key: 'PREPARING',
      label: 'Dimasak',
      count: orders.filter((o) => o.status === 'PREPARING').length,
      color: 'bg-orange-100 text-orange-800',
    },
    {
      key: 'READY',
      label: 'Siap',
      count: orders.filter((o) => o.status === 'READY').length,
      color: 'bg-purple-100 text-purple-800',
    },
    {
      key: 'OUT_FOR_DELIVERY',
      label: 'Diantar',
      count: orders.filter((o) => o.status === 'OUT_FOR_DELIVERY').length,
      color: 'bg-indigo-100 text-indigo-800',
    },
    {
      key: 'COMPLETED',
      label: 'Selesai',
      count: orders.filter((o) => o.status === 'COMPLETED').length,
      color: 'bg-emerald-100 text-emerald-800',
    },
    {
      key: 'CANCELLED',
      label: 'Batal',
      count: orders.filter((o) => o.status === 'CANCELLED' || o.status === 'REFUNDED').length,
      color: 'bg-rose-100 text-rose-800',
    },
  ];

  const getLocalDateKey = (createdAt: Order['createdAt'] | FirestoreTimestampLike | string | number | null | undefined) => {
    const timestamp = getOrderTimestamp(createdAt);
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const formatOrderDateTime = (createdAt: Order['createdAt'] | FirestoreTimestampLike | string | number | null | undefined) => {
    const timestamp = getOrderTimestamp(createdAt);
    if (!timestamp) return '-';
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(timestamp));
  };

  const filteredOrders = useMemo(() => {
    const filtered = orders.filter((o) => {
      if (selectedDate && getLocalDateKey(o.createdAt) !== selectedDate) {
        return false;
      }

      if (selectedStatusTab !== 'ALL' && o.status !== selectedStatusTab) {
        if (selectedStatusTab === 'CANCELLED' && (o.status === 'CANCELLED' || o.status === 'REFUNDED')) {
          // match
        } else {
          return false;
        }
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchNum = String(o.orderNumber || '').toLowerCase().includes(q);
        const matchCust = String(o.customer?.name || '').toLowerCase().includes(q);
        const matchPhone = String(o.customer?.whatsapp || '').includes(q);
        if (!matchNum && !matchCust && !matchPhone) return false;
      }

      return true;
    });

    return [...filtered].sort((a, b) => {
      const aTime = getOrderTimestamp(a.createdAt);
      const bTime = getOrderTimestamp(b.createdAt);

      if (aTime !== bTime) {
        return sortDirection === 'DESC' ? bTime - aTime : aTime - bTime;
      }

      return sortDirection === 'DESC'
        ? String(b.id || '').localeCompare(String(a.id || ''))
        : String(a.id || '').localeCompare(String(b.id || ''));
    });
  }, [orders, selectedDate, selectedStatusTab, searchQuery, sortDirection]);

  const handleAdvanceStatus = async (order: Order) => {
    let nextStatus: OrderStatus = 'CONFIRMED';
    if (order.status === 'PENDING') nextStatus = 'CONFIRMED';
    else if (order.status === 'CONFIRMED') nextStatus = 'PREPARING';
    else if (order.status === 'PREPARING') nextStatus = 'READY';
    else if (order.status === 'READY') {
      nextStatus = order.serviceType === 'DELIVERY' ? 'OUT_FOR_DELIVERY' : 'COMPLETED';
    } else if (order.status === 'OUT_FOR_DELIVERY') {
      nextStatus = 'COMPLETED';
    }

    try {
      await FirestoreService.updateOrderStatus(order.id, nextStatus);
      soundService.playSuccessRegister();
    } catch (err) {
      alert('Gagal memperbarui status pesanan.');
    }
  };

  const handleCancelOrder = async (order: Order) => {
    const reason = prompt('Masukkan alasan pembatalan pesanan:') || 'Dibatalkan oleh staff';
    if (confirm(`Yakin ingin membatalkan pesanan ${order.orderNumber}?`)) {
      try {
        await FirestoreService.updateOrderStatus(order.id, 'CANCELLED', reason);
      } catch (err) {
        alert('Gagal membatalkan pesanan.');
      }
    }
  };

  return (
    <div className="space-y-4">
      {/* Header & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-heading font-extrabold text-xl text-[#2E1A47]">
            Monitor Pesanan Masuk
          </h2>
          <div className="flex flex-wrap items-center gap-2 mt-0.5">
            <p className="text-xs text-gray-500">
              Kelola alur dapur dan status pesanan pelanggan secara real-time
            </p>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[10px] font-extrabold text-emerald-700">
              ● LIVE • Tanggal: {selectedDate}
            </span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <label className="flex items-center gap-2 rounded-xl bg-white border border-gray-200 px-3 py-2 text-xs font-bold text-gray-600">
            <span>Tanggal</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="text-xs font-semibold text-gray-800 bg-transparent outline-none"
              title="Tampilkan pesanan pada tanggal tertentu"
            />
          </label>

          <select
            value={sortDirection}
            onChange={(e) => setSortDirection(e.target.value as 'DESC' | 'ASC')}
            className="w-full sm:w-44 text-xs font-bold px-3 py-2 rounded-xl bg-white border border-gray-200 text-gray-700 outline-none"
            title="Urutan pesanan"
          >
            <option value="DESC">Terbaru → Terlama</option>
            <option value="ASC">Terlama → Terbaru</option>
          </select>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Cari #No. Order / Pelanggan..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs pl-9 pr-3 py-2 rounded-xl bg-white border border-gray-200 focus:outline-hidden"
            />
          </div>
        </div>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
        {statusTabs.map((tab) => {
          const isSelected = selectedStatusTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setSelectedStatusTab(tab.key)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                isSelected
                  ? 'bg-[#2E1A47] text-white shadow-md shadow-[#2E1A47]/20 scale-102'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200/80'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${
                  isSelected ? 'bg-white/25 text-white' : 'bg-gray-100 text-gray-600'
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Orders List / Cards */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-gray-500">
          Menampilkan <span className="font-extrabold text-gray-700">{filteredOrders.length}</span> pesanan
          pada tanggal <span className="font-extrabold text-gray-700">{selectedDate}</span>
        </div>
        <button
          type="button"
          onClick={() => {
            const now = new Date();
            const y = now.getFullYear();
            const m = String(now.getMonth() + 1).padStart(2, '0');
            const d = String(now.getDate()).padStart(2, '0');
            setSelectedDate(`${y}-${m}-${d}`);
            setSortDirection('DESC');
          }}
          className="px-3 py-1.5 rounded-full bg-white border border-gray-200 text-[10px] font-extrabold text-gray-600 hover:bg-gray-100 transition-colors"
        >
          Hari Ini • Terbaru
        </button>
      </div>

      <div className="space-y-3">
        {filteredOrders.length === 0 ? (
          <div className="clay-card p-12 text-center text-gray-400">
            <Clock className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-xs font-semibold">Tidak ada pesanan pada filter ini.</p>
          </div>
        ) : (
          filteredOrders.map((order) => {
            const isCompleted = order.status === 'COMPLETED';
            const isCancelled = order.status === 'CANCELLED' || order.status === 'REFUNDED';
            const isNewOrder = order.status === 'PENDING' && !isCompleted && !isCancelled;

            return (
              <div
                key={order.id}
                className={[
                  'clay-card p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all',
                  isNewOrder
                    ? 'bg-emerald-50/95 border-2 border-emerald-300 shadow-md shadow-emerald-100'
                    : '',
                ].join(' ')}
              >
                {/* Left: Order Info */}
                <div className="space-y-2 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="text-[10px] font-extrabold text-gray-400 min-w-[24px] text-center">
                        #{filteredOrders.indexOf(order) + 1}
                      </span>
                      <span className="font-mono font-extrabold text-sm text-[#2E1A47] bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200/60">
                        {order.orderNumber}
                      </span>
                    </span>
                    <span className="inline-flex items-center rounded-full bg-gray-100 border border-gray-200 px-2 py-0.5 text-[10px] font-semibold text-gray-600">
                      {formatOrderDateTime(order.createdAt)}
                    </span>
                    <span
                      className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                        order.orderType === 'REWARD_REDEMPTION'
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : order.source === 'POS'
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      }`}
                    >
                      {order.orderType === 'REWARD_REDEMPTION'
                        ? '🎁 Redeem Reward'
                        : order.source === 'POS'
                        ? 'Kasir POS'
                        : 'Web Order'}
                    </span>
                    <span
                      className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                        order.status === 'PENDING'
                          ? 'bg-emerald-600 text-white animate-pulse'
                          : order.status === 'PREPARING'
                          ? 'bg-orange-100 text-orange-800'
                          : order.status === 'COMPLETED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : order.status === 'CANCELLED'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-purple-100 text-purple-800'
                      }`}
                    >
                      {order.status === 'PENDING' ? 'PESANAN BARU' : order.status}
                    </span>
                  </div>

                  <div className="text-xs">
                    <span className="font-bold text-gray-900">{order.customer.name}</span>
                    {order.customer.whatsapp && order.customer.whatsapp !== '-' && (
                      <span className="text-gray-500 ml-2">({order.customer.whatsapp})</span>
                    )}
                    <span className="text-gray-400 mx-2">•</span>
                    <span className="font-semibold text-gray-600">
                      {order.serviceType === 'DELIVERY'
                        ? `Delivery: ${order.deliveryAreaName || 'Area'} - ${order.customer.address || ''}`
                        : 'Takeaway / Dine In'}
                    </span>
                  </div>

                  {/* Items summary */}
                  <div
                    className={[
                      'text-xs text-gray-600 p-2 rounded-xl border',
                      isNewOrder
                        ? 'bg-white/80 border-emerald-200'
                        : 'bg-gray-50/80 border-gray-100',
                    ].join(' ')}
                  >
                    {order.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between py-0.5">
                        <span>
                          {item.quantity}x {item.productName}
                          {item.selectedModifiers.length > 0 && (
                            <span className="text-gray-400 text-[11px] ml-1">
                              ({item.selectedModifiers.map((m) => m.item.name).join(', ')})
                            </span>
                          )}
                        </span>
                        <span className="font-semibold text-gray-800">
                          Rp {item.lineTotal.toLocaleString('id-ID')}
                        </span>
                      </div>
                    ))}
                    {order.customer.notes && (
                      <p className="text-[11px] text-amber-700 italic mt-1 pt-1 border-t border-gray-200/50">
                        Catatan: "{order.customer.notes}"
                      </p>
                    )}
                  </div>
                </div>

                {/* Right: Actions & Total */}
                <div className="flex flex-row md:flex-col items-end justify-between md:justify-center gap-3 shrink-0 border-t md:border-t-0 pt-3 md:pt-0 border-gray-100">
                  <div className="text-left md:text-right">
                    <p className="text-[10px] text-gray-400 font-medium">Total Pembayaran</p>
                    <p className="font-heading font-extrabold text-base sm:text-lg text-[#FF4500]">
                      Rp {order.total.toLocaleString('id-ID')}
                    </p>
                    <p className="text-[10px] text-gray-500 font-medium">
                      {order.paymentMethod}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* Print Receipt button */}
                    <button
                      onClick={() => {
                        setActiveReceiptOrder(order);
                        setIsReceiptOpen(true);
                      }}
                      className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
                      title="Lihat / Cetak Struk"
                    >
                      <Printer className="w-4 h-4" />
                    </button>

                    {/* WhatsApp button if customer phone exists */}
                    {order.customer.whatsapp && order.customer.whatsapp !== '-' && (
                      <a
                        href={`https://wa.me/62${order.customer.whatsapp.replace(/^0/, '')}?text=${encodeURIComponent(
                          `Halo Kak ${order.customer.name}, pesanan ${order.orderNumber} di HUMA sedang kami siapkan ya!`
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                        title="Chat Pelanggan"
                      >
                        <MessageCircle className="w-4 h-4" />
                      </a>
                    )}

                    {/* Advance Status Button */}
                    {!isCompleted && !isCancelled && (
                      <button
                        onClick={() => handleAdvanceStatus(order)}
                        className="px-3 py-2 rounded-xl bg-[#2E1A47] hover:bg-[#FF4500] text-white text-xs font-bold transition-colors shadow-sm"
                      >
                        {order.status === 'PENDING'
                          ? 'Konfirmasi'
                          : order.status === 'CONFIRMED'
                          ? 'Masak'
                          : order.status === 'PREPARING'
                          ? 'Siap'
                          : order.status === 'READY'
                          ? order.serviceType === 'DELIVERY'
                            ? 'Kirim'
                            : 'Selesai'
                          : order.status === 'OUT_FOR_DELIVERY'
                          ? 'Selesai'
                          : 'Update'}
                      </button>
                    )}

                    {/* Cancel Order */}
                    {!isCompleted && !isCancelled && (
                      <button
                        onClick={() => handleCancelOrder(order)}
                        className="p-2 rounded-xl text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                        title="Batalkan Pesanan"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Thermal Receipt Modal */}
      <ThermalReceiptModal
        order={activeReceiptOrder}
        settings={settings}
        isOpen={isReceiptOpen}
        onClose={() => setIsReceiptOpen(false)}
      />
    </div>
  );
};
