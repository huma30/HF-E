import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  Product,
  Category,
  ModifierGroup,
  Order,
  Promo,
  DeliveryArea,
  Banner,
  StoreSettings,
} from '../../types';
import { AdminDashboard } from './AdminDashboard';
import { AdminOrderMonitor } from './AdminOrderMonitor';
import { AdminProductManager } from './AdminProductManager';
import { AdminCategoryManager } from './AdminCategoryManager';
import { AdminModifierManager } from './AdminModifierManager';
import { AdminPromoManager } from './AdminPromoManager';
import { AdminDeliveryManager } from './AdminDeliveryManager';
import { AdminBannerManager } from './AdminBannerManager';
import { AdminSettings } from './AdminSettings';
import { AdminAuditLogs } from './AdminAuditLogs';
import { AdminBackupImport } from './AdminBackupImport';
import { AdminCustomers } from './AdminCustomers';
import { AdminRewards } from './AdminRewards';
import {
  LayoutDashboard,
  ClipboardList,
  UtensilsCrossed,
  Tags,
  Layers,
  TicketPercent,
  MapPin,
  Image as ImageIcon,
  Settings,
  ShieldAlert,
  Database,
  Calculator,
  LogOut,
  Store,
  ChevronRight,
  Menu,
  X,
  Users,
  Award,
} from 'lucide-react';

interface AdminLayoutProps {
  products: Product[];
  categories: Category[];
  modifierGroups: ModifierGroup[];
  orders: Order[];
  promos: Promo[];
  deliveryAreas: DeliveryArea[];
  banners: Banner[];
  settings: StoreSettings | null;
  onRefreshData: () => void;
  onOpenPos: () => void;
  onBackToStorefront: () => void;
}

type AdminTab =
  | 'DASHBOARD'
  | 'ORDERS'
  | 'PRODUCTS'
  | 'CATEGORIES'
  | 'MODIFIERS'
  | 'PROMOS'
  | 'CUSTOMERS'
  | 'REWARDS'
  | 'DELIVERY'
  | 'BANNERS'
  | 'SETTINGS'
  | 'AUDIT'
  | 'BACKUP';

export const AdminLayout: React.FC<AdminLayoutProps> = ({
  products,
  categories,
  modifierGroups,
  orders,
  promos,
  deliveryAreas,
  banners,
  settings,
  onRefreshData,
  onOpenPos,
  onBackToStorefront,
}) => {
  const { adminProfile, role, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>('DASHBOARD');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const navItems: { id: AdminTab; label: string; icon: any; roles?: string[] }[] = [
    { id: 'DASHBOARD', label: 'Dashboard & KPI', icon: LayoutDashboard },
    { id: 'ORDERS', label: 'Monitor Pesanan', icon: ClipboardList },
    { id: 'PRODUCTS', label: 'Menu & Grosir', icon: UtensilsCrossed },
    { id: 'CATEGORIES', label: 'Kategori Menu', icon: Tags },
    { id: 'MODIFIERS', label: 'Opsi & Modifier', icon: Layers },
    { id: 'PROMOS', label: 'Voucher Promo', icon: TicketPercent },
    { id: 'CUSTOMERS', label: 'Pelanggan & Poin', icon: Users },
    { id: 'REWARDS', label: 'Katalog Hadiah', icon: Award },
    { id: 'DELIVERY', label: 'Area Pengantaran', icon: MapPin },
    { id: 'BANNERS', label: 'Banner Slider', icon: ImageIcon },
    { id: 'SETTINGS', label: 'Pengaturan Toko', icon: Settings },
    { id: 'AUDIT', label: 'Audit Log', icon: ShieldAlert },
    { id: 'BACKUP', label: 'Backup & Impor', icon: Database },
  ];

  const pendingOrdersCount = orders.filter((o) => o.status === 'PENDING').length;

  return (
    <div className="min-h-screen bg-[#F4F2F7] flex flex-col md:flex-row">
      {/* Mobile Topbar */}
      <div className="md:hidden bg-[#2E1A47] text-white p-3 flex items-center justify-between sticky top-0 z-30 shadow-md">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
            className="p-1.5 rounded-lg bg-white/10"
          >
            {isMobileSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          {settings?.logoUrl && (
            <img
              src={settings.logoUrl}
              alt="Logo"
              className="w-6 h-6 rounded-md object-cover bg-white shrink-0"
            />
          )}
          <span className="font-heading font-extrabold text-sm">
            {settings?.storeName || 'HUMA'} — Admin
          </span>
        </div>

        <button
          onClick={onOpenPos}
          className="px-3 py-1.5 bg-[#FF4500] hover:bg-[#e03d00] text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-xs"
        >
          <Calculator className="w-3.5 h-3.5" />
          <span>Buka Kasir</span>
        </button>
      </div>

      {/* Sidebar Navigation */}
      <aside
        className={`w-64 bg-[#2E1A47] text-white flex flex-col justify-between shrink-0 fixed inset-y-0 left-0 z-40 transform transition-transform duration-200 md:static md:translate-x-0 ${
          isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div>
          {/* Brand header */}
          <div className="p-5 border-b border-white/10">
            <div className="flex items-center gap-2.5">
              {settings?.logoUrl ? (
                <img
                  src={settings.logoUrl}
                  alt={settings.storeName || 'HUMA'}
                  className="w-9 h-9 rounded-xl object-cover shadow-md bg-white border border-white/20 shrink-0"
                />
              ) : (
                <div className="w-9 h-9 rounded-xl bg-[#FF4500] text-white flex items-center justify-center font-heading font-extrabold text-lg shadow-md shrink-0">
                  {(settings?.storeName || 'H').charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <h1 className="font-heading font-extrabold text-base leading-tight">
                  {settings?.storeName || 'HUMA'} Portal
                </h1>
                <p className="text-[10px] text-gray-300 font-medium">Perum Gina Blok B No. 12</p>
              </div>
            </div>

            {/* Quick POS action button */}
            <button
              onClick={() => {
                setIsMobileSidebarOpen(false);
                onOpenPos();
              }}
              className="mt-4 w-full py-2.5 px-3 bg-[#FF4500] hover:bg-[#e03d00] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-md transition-all active:scale-98"
            >
              <Calculator className="w-4 h-4" />
              <span>Buka Kasir POS (Offline)</span>
            </button>
          </div>

          {/* Navigation links */}
          <nav className="p-3 space-y-1 overflow-y-auto max-h-[calc(100vh-240px)]">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    setIsMobileSidebarOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-white/15 text-white shadow-xs font-bold'
                      : 'text-gray-300 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon
                      className={`w-4 h-4 ${
                        isActive ? 'text-[#FF4500]' : 'text-gray-400'
                      }`}
                    />
                    <span>{item.label}</span>
                  </div>

                  {item.id === 'ORDERS' && pendingOrdersCount > 0 && (
                    <span className="w-5 h-5 rounded-full bg-[#FF4500] text-white text-[10px] font-extrabold flex items-center justify-center">
                      {pendingOrdersCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* User profile & Storefront toggle */}
        <div className="p-4 border-t border-white/10 space-y-2 bg-[#25153a]">
          <div className="flex items-center justify-between text-xs">
            <div>
              <p className="font-bold text-white truncate">{adminProfile?.name || 'Staff HUMA'}</p>
              <span className="inline-block text-[10px] text-[#E1AD01] font-semibold">
                {role || 'SUPER_ADMIN'}
              </span>
            </div>
            <button
              onClick={logout}
              className="p-1.5 rounded-lg text-gray-400 hover:text-rose-400 hover:bg-white/5"
              title="Keluar"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={onBackToStorefront}
            className="w-full py-2 px-3 bg-white/10 hover:bg-white/15 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
          >
            <Store className="w-3.5 h-3.5 text-[#E1AD01]" />
            <span>Lihat Etalase Toko</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto max-w-6xl w-full mx-auto">
        {activeTab === 'DASHBOARD' && (
          <AdminDashboard orders={orders} products={products} />
        )}
        {activeTab === 'ORDERS' && (
          <AdminOrderMonitor orders={orders} settings={settings} />
        )}
        {activeTab === 'PRODUCTS' && (
          <AdminProductManager
            products={products}
            categories={categories}
            modifierGroups={modifierGroups}
            onRefresh={onRefreshData}
          />
        )}
        {activeTab === 'CATEGORIES' && (
          <AdminCategoryManager
            categories={categories}
            modifierGroups={modifierGroups}
            onRefresh={onRefreshData}
          />
        )}
        {activeTab === 'MODIFIERS' && (
          <AdminModifierManager
            modifierGroups={modifierGroups}
            onRefresh={onRefreshData}
          />
        )}
        {activeTab === 'PROMOS' && (
          <AdminPromoManager
            promos={promos}
            categories={categories}
            products={products}
            onRefresh={onRefreshData}
          />
        )}
        {activeTab === 'CUSTOMERS' && (
          <AdminCustomers settings={settings} adminUser={adminProfile} />
        )}
        {activeTab === 'REWARDS' && (
          <AdminRewards products={products} />
        )}
        {activeTab === 'DELIVERY' && (
          <AdminDeliveryManager
            deliveryAreas={deliveryAreas}
            onRefresh={onRefreshData}
          />
        )}
        {activeTab === 'BANNERS' && (
          <AdminBannerManager banners={banners} onRefresh={onRefreshData} />
        )}
        {activeTab === 'SETTINGS' && (
          <AdminSettings settings={settings} onRefresh={onRefreshData} />
        )}
        {activeTab === 'AUDIT' && <AdminAuditLogs />}
        {activeTab === 'BACKUP' && (
          <AdminBackupImport
            products={products}
            orders={orders}
            categories={categories}
            settings={settings}
            onRefresh={onRefreshData}
          />
        )}
      </main>
    </div>
  );
};
