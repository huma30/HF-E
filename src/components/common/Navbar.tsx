import React, { useState } from 'react';
import {
  ShoppingBag,
  MessageCircle,
  ShieldCheck,
  Search,
  Store,
  Calculator,
  ChevronDown,
  LogOut,
  Gift,
} from 'lucide-react';
import { StoreSettings } from '../../types';
import { StoreStatusBadge } from './StoreStatusBadge';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';

interface NavbarProps {
  settings: StoreSettings | null;
  onOpenCart: () => void;
  onToggleSearch?: () => void;
  onOpenAdmin: () => void;
  onOpenPos: () => void;
  onOpenRewards?: () => void;
  currentView?: 'customer' | 'admin' | 'pos';
  onSwitchView?: (view: 'customer' | 'admin' | 'pos') => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  settings,
  onOpenCart,
  onToggleSearch,
  onOpenAdmin,
  onOpenPos,
  onOpenRewards,
  currentView = 'customer',
  onSwitchView,
}) => {
  const { itemCount } = useCart();
  const { adminProfile, role, logout } = useAuth();
  const [isStaffMenuOpen, setIsStaffMenuOpen] = useState(false);

  const handleSwitch = (view: 'customer' | 'admin' | 'pos') => {
    setIsStaffMenuOpen(false);
    if (onSwitchView) {
      onSwitchView(view);
    } else {
      if (view === 'pos') onOpenPos();
      else if (view === 'admin') onOpenAdmin();
    }
  };

  const roleLabel =
    role === 'SUPER_ADMIN'
      ? 'Owner'
      : role === 'ADMIN'
      ? 'Admin'
      : role === 'MANAGER'
      ? 'Manajer'
      : role === 'CASHIER'
      ? 'Kasir'
      : 'Staff';

  return (
    <header className="sticky top-2 sm:top-3 z-40 px-2 sm:px-6 max-w-7xl mx-auto w-full">
      <nav
        id="main-floating-navbar"
        className="liquid-nav rounded-2xl sm:rounded-3xl px-3 sm:px-5 py-2.5 sm:py-3 flex items-center justify-between transition-all shadow-md bg-white/95 backdrop-blur-md border border-gray-100"
      >
        {/* Left: Brand Identity */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button
            id="brand-logo-btn"
            onClick={() => handleSwitch('customer')}
            className="flex items-center gap-2 sm:gap-2.5 text-left group focus:outline-hidden"
            title={settings?.storeName || 'HUMA'}
          >
            {settings?.logoUrl ? (
              <img
                src={settings.logoUrl}
                alt={settings.storeName || 'HUMA'}
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl object-contain shadow-md group-hover:scale-105 transition-transform border border-gray-100 bg-white shrink-0 p-0.5"
              />
            ) : (
              <img
                src="/huma_brand_logo.png"
                alt="HUMA"
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl object-contain shadow-md group-hover:scale-105 transition-transform border border-gray-100 bg-white shrink-0 p-0.5"
              />
            )}
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-heading font-extrabold text-lg sm:text-xl tracking-tight text-[#2E1A47]">
                  {settings?.storeName || 'HUMA'}
                </span>
              </div>
              <p className="text-[10px] sm:text-[11px] text-gray-500 font-medium hidden xs:block -mt-0.5">
                {settings?.tagline || 'Jajan dekat rasa bersahabat'}
              </p>
            </div>
          </button>

          {/* Store status badge (Desktop) */}
          <div className="hidden md:block ml-1">
            <StoreStatusBadge settings={settings} />
          </div>
        </div>

        {/* Center/Navigation Switcher (when authenticated) */}
        {adminProfile && (
          <div className="hidden lg:flex items-center bg-gray-100/90 p-1 rounded-2xl text-xs font-bold border border-gray-200/60 shadow-inner">
            <button
              id="nav-switch-customer"
              onClick={() => handleSwitch('customer')}
              className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${
                currentView === 'customer'
                  ? 'bg-white text-[#2E1A47] shadow-xs font-extrabold'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Store className="w-3.5 h-3.5 text-[#FF4500]" />
              <span>Etalase Web</span>
            </button>
            <button
              id="nav-switch-pos"
              onClick={() => handleSwitch('pos')}
              className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${
                currentView === 'pos'
                  ? 'bg-white text-[#2E1A47] shadow-xs font-extrabold'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Calculator className="w-3.5 h-3.5 text-amber-500" />
              <span>POS Kasir</span>
            </button>
            <button
              id="nav-switch-admin"
              onClick={() => handleSwitch('admin')}
              className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${
                currentView === 'admin'
                  ? 'bg-white text-[#2E1A47] shadow-xs font-extrabold'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-[#E1AD01]" />
              <span>Panel Admin</span>
            </button>
          </div>
        )}

        {/* Right: Action Buttons */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Search Button (Customer View) */}
          {onToggleSearch && currentView === 'customer' && (
            <button
              id="nav-search-button"
              onClick={onToggleSearch}
              aria-label="Cari menu"
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gray-100/80 hover:bg-gray-200/80 flex items-center justify-center text-[#2E1A47] transition-colors"
            >
              <Search className="w-4 h-4" />
            </button>
          )}

          {/* Direct WhatsApp chat */}
          <a
            id="nav-whatsapp-link"
            href={`https://wa.me/62${(settings?.whatsapp || '085878775527').replace(/^0/, '')}?text=${encodeURIComponent('Halo HUMA Food, saya ingin bertanya menu hari ini.')}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Hubungi WhatsApp HUMA"
            className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs transition-colors border border-emerald-100"
          >
            <MessageCircle className="w-4 h-4 text-emerald-600" />
            <span>WA</span>
          </a>

          {/* Kotak Hadiah (Gift Box / Rewards) - Customer Front */}
          {settings?.isGiftBoxEnabled !== false && settings?.isPointsEnabled !== false && onOpenRewards && currentView === 'customer' && (
            <button
              id="nav-giftbox-btn"
              onClick={onOpenRewards}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 active:scale-95 text-amber-900 font-extrabold text-xs border border-amber-200/90 shadow-2xs transition-all group"
              title="Kotak Hadiah & Poin HUMA"
            >
              <div className="relative">
                <Gift className="w-4 h-4 text-[#FF4500] group-hover:scale-110 transition-transform" />
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-[#FF4500] rounded-full animate-ping" />
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-[#FF4500] rounded-full" />
              </div>
              <span className="hidden xs:inline text-[#2E1A47] font-heading font-extrabold">
                Hadiah
              </span>
            </button>
          )}

          {/* Cart Button (Customer View) */}
          {currentView === 'customer' && (
            <button
              id="nav-cart-button"
              onClick={onOpenCart}
              className="relative flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-2 rounded-xl bg-[#2E1A47] text-white font-bold text-xs shadow-xs hover:bg-[#3D235E] active:scale-95 transition-all"
              title="Buka Keranjang Pesanan"
            >
              <ShoppingBag className="w-4 h-4 text-[#FF4500]" />
              <span className="hidden xs:inline">Keranjang</span>
              {itemCount > 0 && (
                <span
                  id="nav-cart-badge"
                  className="bg-[#FF4500] text-white text-[10px] sm:text-[11px] font-black px-1.5 py-0.5 rounded-full min-w-4 sm:min-w-5 text-center leading-none"
                >
                  {itemCount}
                </span>
              )}
            </button>
          )}

          {/* --- ADMIN & POS HEADER CONTROLS --- */}
          {adminProfile ? (
            // User is authenticated staff: Show role pill + quick view toggle + staff menu
            <div className="relative flex items-center gap-1.5">
              {/* Quick direct Admin button if not currently on Admin */}
              {currentView !== 'admin' && (
                <button
                  id="nav-goto-admin-direct"
                  onClick={() => handleSwitch('admin')}
                  className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-[#2E1A47] border border-purple-200 font-extrabold text-xs transition-colors shadow-2xs"
                  title="Masuk ke Panel Admin"
                >
                  <ShieldCheck className="w-4 h-4 text-[#E1AD01]" />
                  <span>Admin</span>
                </button>
              )}

              {/* Quick direct POS button if not currently on POS */}
              {currentView !== 'pos' && (
                <button
                  id="nav-goto-pos-direct"
                  onClick={() => handleSwitch('pos')}
                  className="hidden sm:flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-[#8C6D01] border border-amber-200/80 font-bold text-xs transition-colors shadow-2xs"
                  title="Masuk ke Kasir POS"
                >
                  <Calculator className="w-3.5 h-3.5 text-amber-600" />
                  <span>Kasir POS</span>
                </button>
              )}

              {/* Active Staff Role Pill & Dropdown Toggle */}
              <button
                id="nav-staff-menu-toggle"
                onClick={() => setIsStaffMenuOpen(!isStaffMenuOpen)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold border border-gray-200 transition-colors"
                title="Menu Pengguna Staff"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[11px] font-extrabold text-[#2E1A47]">{roleLabel}</span>
                <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
              </button>

              {/* Staff Dropdown Menu */}
              {isStaffMenuOpen && (
                <div
                  id="nav-staff-dropdown"
                  className="absolute right-0 top-full mt-2 w-52 bg-white rounded-2xl shadow-xl border border-gray-100 p-2 z-50 text-xs space-y-1 animate-in fade-in slide-in-from-top-2 duration-150"
                >
                  <div className="px-3 py-2 border-b border-gray-100 mb-1">
                    <p className="text-[10px] uppercase font-bold tracking-wider text-gray-400">
                      Sesi Aktif
                    </p>
                    <p className="font-extrabold text-[#2E1A47] truncate">
                      {adminProfile.name || adminProfile.email}
                    </p>
                    <span className="inline-block mt-0.5 px-2 py-0.5 rounded-full bg-purple-100 text-[#2E1A47] text-[10px] font-bold">
                      {roleLabel} ({role})
                    </span>
                  </div>

                  <button
                    onClick={() => handleSwitch('customer')}
                    className={`w-full text-left px-3 py-2 rounded-xl flex items-center gap-2 transition-colors ${
                      currentView === 'customer'
                        ? 'bg-purple-50 text-[#2E1A47] font-bold'
                        : 'hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <Store className="w-4 h-4 text-[#FF4500]" />
                    <span>Etalase Toko Web</span>
                  </button>

                  <button
                    onClick={() => handleSwitch('pos')}
                    className={`w-full text-left px-3 py-2 rounded-xl flex items-center gap-2 transition-colors ${
                      currentView === 'pos'
                        ? 'bg-amber-50 text-amber-900 font-bold'
                        : 'hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <Calculator className="w-4 h-4 text-amber-500" />
                    <span>Kasir POS</span>
                  </button>

                  <button
                    onClick={() => handleSwitch('admin')}
                    className={`w-full text-left px-3 py-2 rounded-xl flex items-center gap-2 transition-colors ${
                      currentView === 'admin'
                        ? 'bg-purple-50 text-[#2E1A47] font-bold'
                        : 'hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <ShieldCheck className="w-4 h-4 text-[#E1AD01]" />
                    <span>Panel Dashboard Admin</span>
                  </button>

                  <div className="border-t border-gray-100 pt-1 mt-1">
                    <button
                      onClick={() => {
                        setIsStaffMenuOpen(false);
                        logout();
                        handleSwitch('customer');
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl flex items-center gap-2 text-rose-600 hover:bg-rose-50 font-semibold transition-colors"
                    >
                      <LogOut className="w-4 h-4 text-rose-500" />
                      <span>Keluar (Logout)</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Icon & Tombol Admin di Header Homepage */
            onOpenAdmin && (
              <button
                id="nav-header-admin-btn"
                onClick={onOpenAdmin}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-[#2E1A47] border border-purple-200 font-extrabold text-xs transition-all shadow-2xs active:scale-95 shrink-0 cursor-pointer"
                title="Masuk ke Portal Admin"
              >
                <ShieldCheck className="w-4 h-4 text-[#E1AD01]" />
                <span className="font-heading font-extrabold">Admin</span>
              </button>
            )
          )}
        </div>
      </nav>

      {/* Mobile store status badge underneath navbar */}
      <div className="md:hidden mt-1.5 flex justify-center">
        <StoreStatusBadge settings={settings} />
      </div>
    </header>
  );
};
