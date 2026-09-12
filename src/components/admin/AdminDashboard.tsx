import React, { useMemo } from 'react';
import { Order, Product } from '../../types';
import {
  TrendingUp,
  ShoppingBag,
  CheckCircle,
  XCircle,
  Banknote,
  Truck,
  Store,
  Globe,
  Award,
} from 'lucide-react';

interface AdminDashboardProps {
  orders: Order[];
  products: Product[];
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ orders, products }) => {
  const todayStr = new Date().toISOString().substring(0, 10);

  // Filter today's orders
  const todayOrders = useMemo(() => {
    return orders.filter((o) => (o.createdAt || '').startsWith(todayStr));
  }, [orders, todayStr]);

  // Key KPI metrics
  const totalRevenue = useMemo(() => {
    return todayOrders
      .filter((o) => o.status !== 'CANCELLED' && o.status !== 'REFUNDED')
      .reduce((sum, o) => sum + o.total, 0);
  }, [todayOrders]);

  const completedCount = useMemo(() => {
    return todayOrders.filter((o) => o.status === 'COMPLETED').length;
  }, [todayOrders]);

  const cancelledCount = useMemo(() => {
    return todayOrders.filter((o) => o.status === 'CANCELLED' || o.status === 'REFUNDED').length;
  }, [todayOrders]);

  const averageOrderValue = useMemo(() => {
    const validOrders = todayOrders.filter((o) => o.status !== 'CANCELLED' && o.status !== 'REFUNDED');
    if (validOrders.length === 0) return 0;
    return Math.round(totalRevenue / validOrders.length);
  }, [todayOrders, totalRevenue]);

  // Channel breakdown
  const posCount = todayOrders.filter((o) => o.source === 'POS').length;
  const webCount = todayOrders.filter((o) => o.source === 'WEB').length;
  const deliveryCount = todayOrders.filter((o) => o.serviceType === 'DELIVERY').length;

  // Payment method breakdown
  const paymentBreakdown = useMemo(() => {
    const map: Record<string, number> = { CASH: 0, QRIS: 0, BANK_TRANSFER: 0, COD: 0, MULTI: 0 };
    todayOrders.forEach((o) => {
      if (o.status !== 'CANCELLED') {
        map[o.paymentMethod] = (map[o.paymentMethod] || 0) + o.total;
      }
    });
    return map;
  }, [todayOrders]);

  // Top Selling Products
  const topProducts = useMemo(() => {
    const counts: Record<string, { name: string; qty: number; revenue: number }> = {};
    orders.forEach((o) => {
      if (o.status !== 'CANCELLED' && Array.isArray(o.items)) {
        o.items.forEach((item) => {
          if (!counts[item.productId]) {
            counts[item.productId] = { name: item.productName || 'Menu', qty: 0, revenue: 0 };
          }
          counts[item.productId].qty += item.quantity || 1;
          counts[item.productId].revenue += item.lineTotal || 0;
        });
      }
    });
    return Object.values(counts).sort((a, b) => b.qty - a.qty).slice(0, 5);
  }, [orders]);

  return (
    <div className="space-y-6">
      {/* Top Welcome & KPI Header */}
      <div>
        <h2 className="font-heading font-extrabold text-xl sm:text-2xl text-[#2E1A47]">
          Ringkasan Operasional Hari Ini
        </h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Data real-time pesanan HUMA ({new Date().toLocaleDateString('id-ID', { dateStyle: 'full' })})
        </p>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Revenue */}
        <div className="clay-card p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-gray-500 text-xs">
            <span>Pendapatan Hari Ini</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="font-heading font-extrabold text-lg sm:text-2xl text-[#2E1A47]">
              Rp {totalRevenue.toLocaleString('id-ID')}
            </span>
            <p className="text-[11px] text-emerald-600 font-semibold mt-0.5">
              {todayOrders.length} transaksi tercatat
            </p>
          </div>
        </div>

        {/* Total Orders & Completed */}
        <div className="clay-card p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-gray-500 text-xs">
            <span>Pesanan Selesai</span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-[#2E1A47] flex items-center justify-center">
              <CheckCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="font-heading font-extrabold text-lg sm:text-2xl text-[#2E1A47]">
              {completedCount}
            </span>
            <p className="text-[11px] text-gray-500 font-semibold mt-0.5">
              dari {todayOrders.length} total pesanan
            </p>
          </div>
        </div>

        {/* Average Order Value */}
        <div className="clay-card p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-gray-500 text-xs">
            <span>Rata-Rata Order (AOV)</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-[#E1AD01] flex items-center justify-center">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="font-heading font-extrabold text-lg sm:text-2xl text-[#2E1A47]">
              Rp {averageOrderValue.toLocaleString('id-ID')}
            </span>
            <p className="text-[11px] text-gray-500 font-semibold mt-0.5">per transaksi</p>
          </div>
        </div>

        {/* Cancelled Orders */}
        <div className="clay-card p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-gray-500 text-xs">
            <span>Pesanan Dibatalkan</span>
            <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <XCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="font-heading font-extrabold text-lg sm:text-2xl text-rose-600">
              {cancelledCount}
            </span>
            <p className="text-[11px] text-gray-400 mt-0.5">batal / refund</p>
          </div>
        </div>
      </div>

      {/* Breakdown Row: Channel Breakdown & Payment Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Channel Breakdown */}
        <div className="clay-card p-5 space-y-4">
          <h3 className="font-heading font-bold text-sm text-[#2E1A47]">
            Distribusi Saluran Penjualan
          </h3>
          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
              <div className="flex items-center gap-2.5 font-semibold text-gray-700">
                <Store className="w-4 h-4 text-[#2E1A47]" />
                <span>Kasir POS (Toko Fisik)</span>
              </div>
              <span className="font-bold text-[#2E1A47]">{posCount} Pesanan</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
              <div className="flex items-center gap-2.5 font-semibold text-gray-700">
                <Globe className="w-4 h-4 text-[#FF4500]" />
                <span>Pemesanan Web & WhatsApp</span>
              </div>
              <span className="font-bold text-[#FF4500]">{webCount} Pesanan</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
              <div className="flex items-center gap-2.5 font-semibold text-gray-700">
                <Truck className="w-4 h-4 text-emerald-600" />
                <span>Delivery Antar ke Rumah</span>
              </div>
              <span className="font-bold text-emerald-700">{deliveryCount} Pesanan</span>
            </div>
          </div>
        </div>

        {/* Payment Methods */}
        <div className="clay-card p-5 space-y-4">
          <h3 className="font-heading font-bold text-sm text-[#2E1A47]">
            Metode Pembayaran (Volume Hari Ini)
          </h3>
          <div className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between p-2.5 bg-gray-50 rounded-xl">
              <span className="font-semibold text-gray-700">Tunai (Cash / COD)</span>
              <span className="font-bold text-gray-900">
                Rp {((paymentBreakdown['CASH'] || 0) + (paymentBreakdown['COD'] || 0)).toLocaleString('id-ID')}
              </span>
            </div>
            <div className="flex items-center justify-between p-2.5 bg-gray-50 rounded-xl">
              <span className="font-semibold text-gray-700">QRIS</span>
              <span className="font-bold text-blue-700">
                Rp {(paymentBreakdown['QRIS'] || 0).toLocaleString('id-ID')}
              </span>
            </div>
            <div className="flex items-center justify-between p-2.5 bg-gray-50 rounded-xl">
              <span className="font-semibold text-gray-700">Transfer Bank</span>
              <span className="font-bold text-purple-700">
                Rp {(paymentBreakdown['BANK_TRANSFER'] || 0).toLocaleString('id-ID')}
              </span>
            </div>
            <div className="flex items-center justify-between p-2.5 bg-gray-50 rounded-xl">
              <span className="font-semibold text-gray-700">Split Payment (Multi)</span>
              <span className="font-bold text-amber-700">
                Rp {(paymentBreakdown['MULTI'] || 0).toLocaleString('id-ID')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Top 5 Best Seller Products */}
      <div className="clay-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-heading font-bold text-sm text-[#2E1A47] flex items-center gap-1.5">
            <Award className="w-4 h-4 text-[#E1AD01]" />
            <span>Menu Terlaris (Best Seller)</span>
          </h3>
          <span className="text-xs text-gray-400">Total Akumulasi</span>
        </div>

        {topProducts.length === 0 ? (
          <p className="text-xs text-gray-400 py-4 text-center">Belum ada transaksi menu.</p>
        ) : (
          <div className="space-y-2">
            {topProducts.map((p, idx) => (
              <div
                key={p.name}
                className="flex items-center justify-between p-3 bg-gray-50/80 rounded-xl text-xs"
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-[#2E1A47] text-white flex items-center justify-center font-bold text-[11px]">
                    {idx + 1}
                  </span>
                  <span className="font-semibold text-gray-800">{p.name}</span>
                </div>
                <div className="text-right">
                  <span className="font-extrabold text-[#FF4500]">{p.qty} terjual</span>
                  <span className="text-gray-400 block text-[10px]">
                    Rp {p.revenue.toLocaleString('id-ID')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
