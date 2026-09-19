import React, { lazy, Suspense, useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CartProvider, useCart } from './context/CartContext';
import {
  Product,
  Category,
  ModifierGroup,
  Order,
  Promo,
  DeliveryArea,
  Banner,
  StoreSettings,
  PlatformLink,
  SelectedModifier,
} from './types';
import { FirestoreService } from './services/firestoreService';
import { soundService } from './services/audioNotification';

// Common components
import { Navbar } from './components/common/Navbar';
import { StoreStatusBadge } from './components/common/StoreStatusBadge';

// Customer components
import { HeroBannerSlider } from './components/customer/HeroBannerSlider';
import { CategoryStickyBar } from './components/customer/CategoryStickyBar';
import { ProductCard } from './components/customer/ProductCard';
import { ProductModifierModal } from './components/customer/ProductModifierModal';
import { FloatingCartPill } from './components/customer/FloatingCartPill';
import { CartDrawer } from './components/customer/CartDrawer';
import { CheckoutModal } from './components/customer/CheckoutModal';
const OrderSuccessModal = lazy(() =>
  import('./components/customer/OrderSuccessModal').then((m) => ({
    default: m.OrderSuccessModal,
  }))
);
import { StoreInfoFooter } from './components/customer/StoreInfoFooter';

// Staff & Admin components
const AdminLoginModal = lazy(() =>
  import('./components/admin/AdminLoginModal').then((m) => ({ default: m.AdminLoginModal }))
);

const AdminLoginPage = lazy(() =>
  import('./components/admin/AdminLoginPage').then((m) => ({ default: m.AdminLoginPage }))
);

const AdminLayout = lazy(() =>
  import('./components/admin/AdminLayout').then((m) => ({ default: m.AdminLayout }))
);

const PosLayout = lazy(() =>
  import('./components/pos/PosLayout').then((m) => ({ default: m.PosLayout }))
);

const CustomerRewardsModal = lazy(() =>
  import('./components/customer/CustomerRewardsModal').then((m) => ({
    default: m.CustomerRewardsModal,
  }))
);

// Mobile Gesture Navigation
import { useGestureBack } from './hooks/useGestureBack';
import { GestureBackIndicator } from './components/common/GestureBackIndicator';

import { Search, Sparkles, UtensilsCrossed, Layers, Flame, ArrowUpDown } from 'lucide-react';

type ViewMode = 'STOREFRONT' | 'POS' | 'ADMIN' | 'ADMIN_LOGIN';

const LazyLoadFallback = () => (
  <div className="min-h-screen bg-[#FBFBFC] flex items-center justify-center">
    <div className="clay-card px-5 py-4 text-sm font-semibold text-gray-600">
      Memuat panel HUMA...
    </div>
  </div>
);

function MainApp() {
  const { currentUser, role, adminProfile } = useAuth();
  const isAuthenticated = !!currentUser || !!adminProfile;
  const user = adminProfile;
  const { addItem, setAvailablePromos } = useCart();

  // Primary view mode
  const [viewMode, setViewMode] = useState<ViewMode>('STOREFRONT');

  // Master Data State (Synchronously initialized from persistent cache for instant 0ms first-paint)
  const cachedCatalog = FirestoreService.getCachedCatalogSync();
  const [products, setProducts] = useState<Product[]>(() => cachedCatalog.products || []);
  const [categories, setCategories] = useState<Category[]>(() => cachedCatalog.categories || []);
  const [modifierGroups, setModifierGroups] = useState<ModifierGroup[]>(() => cachedCatalog.modifierGroups || []);
  const [orders, setOrders] = useState<Order[]>([]);
  const [promos, setPromos] = useState<Promo[]>(() => cachedCatalog.promos || []);
  const [deliveryAreas, setDeliveryAreas] = useState<DeliveryArea[]>(() => cachedCatalog.deliveryAreas || []);
  const [banners, setBanners] = useState<Banner[]>(() => cachedCatalog.banners || []);
  const [settings, setSettings] = useState<StoreSettings | null>(() => cachedCatalog.settings || null);
  const [platformLinks, setPlatformLinks] = useState<PlatformLink[]>(() => cachedCatalog.platformLinks || []);
  const [isLoading, setIsLoading] = useState(() => !cachedCatalog.products || cachedCatalog.products.length === 0);

  // Customer UI state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [activeModifierProduct, setActiveModifierProduct] = useState<Product | null>(null);
  const [isCartDrawerOpen, setIsCartDrawerOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isOrderSuccessOpen, setIsOrderSuccessOpen] = useState(false);
  const [justCompletedOrder, setJustCompletedOrder] = useState<Order | null>(null);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isRewardsModalOpen, setIsRewardsModalOpen] = useState(false);
  const [pendingTarget, setPendingTarget] = useState<'POS' | 'ADMIN'>('ADMIN');

  // Sound chime tracking on new pending orders
  const previousPendingCount = useRef<number>(0);

  // Initial Seed & Data Fetch with Staged First-Paint Prioritization
  const loadMasterData = async () => {
    try {
      // Priority 1: Critical for storefront first-paint & menu configuration
      // Including modifierGroups ensures modifiers (glaze, isi, topping) are NEVER missing on customer phone
      const [prods, cats, mods, bnrs, sets] = await Promise.all([
        FirestoreService.getProducts(),
        FirestoreService.getCategories(),
        FirestoreService.getModifierGroups(),
        FirestoreService.getBanners(),
        FirestoreService.getStoreSettings(),
      ]);

      setProducts(prods);
      setCategories(cats);
      setModifierGroups(mods);
      setBanners(bnrs);
      setSettings(sets);
      setIsLoading(false); // UI unblocks with products AND modifiers 100% available

      // Priority 2: Secondary / Aux data (promos, delivery areas, links)
      const [prms, areas, links] = await Promise.all([
        FirestoreService.getPromos(),
        FirestoreService.getDeliveryAreas(),
        FirestoreService.getPlatformLinks(),
      ]);

      setPromos(prms);
      setDeliveryAreas(areas);
      setPlatformLinks(links);
    } catch (err) {
      console.error('Error loading master data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadMasterData();

    // Subscribe to real-time store settings (logo, name, receipts, status)
    const unsubscribeSettings = FirestoreService.subscribeStoreSettings((updatedSettings) => {
      setSettings(updatedSettings);
    });

    return () => {
      unsubscribeSettings();
    };
  }, []);

  // Subscribe to real-time orders ONLY for staff/admin view mode or authenticated staff
  // Anonymous customers browsing menu do not need continuous order listeners
  useEffect(() => {
    if (viewMode === 'POS' || viewMode === 'ADMIN' || isAuthenticated) {
      const unsubscribeOrders = FirestoreService.subscribeToOrders((updatedOrders) => {
        setOrders(updatedOrders);

        // Play audio chime if a new pending order arrives
        const pendingCount = updatedOrders.filter((o) => o.status === 'PENDING').length;
        if (pendingCount > previousPendingCount.current && previousPendingCount.current > 0) {
          soundService.playNewOrderChime();
        }
        previousPendingCount.current = pendingCount;
      });

      return () => {
        unsubscribeOrders();
      };
    }
  }, [viewMode, isAuthenticated]);

  // Synchronize document title with live store settings
  useEffect(() => {
    if (settings?.storeName) {
      document.title = `${settings.storeName} — ${settings.tagline || 'Jajan dekat rasa bersahabat'}`;
    }
  }, [settings?.storeName, settings?.tagline]);

  // Synchronize available promos to CartContext for automatic Mix & Match engine
  useEffect(() => {
    if (promos && promos.length > 0) {
      setAvailablePromos(promos);
    }
  }, [promos, setAvailablePromos]);

  // Filtered products for customer catalog
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (!p.isActive) return false;
      if (selectedCategoryId && p.categoryId !== selectedCategoryId) return false;
      if (searchQuery.trim()) {
        const queryLower = searchQuery.toLowerCase();
        const matchesName = p.name.toLowerCase().includes(queryLower);
        const matchesDesc = p.description.toLowerCase().includes(queryLower);
        if (!matchesName && !matchesDesc) return false;
      }
      return true;
    });
  }, [products, selectedCategoryId, searchQuery]);

  // Quick add without modifiers
  const handleQuickAdd = useCallback((product: Product) => {
    addItem(product, 1, []);
  }, [addItem]);

  // Open product modifier modal
  const handleOpenProductModal = useCallback((product: Product) => {
    setActiveModifierProduct(product);
  }, []);

  // Add with modifiers from modal
  const handleAddWithModifiers = useCallback((
    product: Product,
    quantity: number,
    selectedModifiers: SelectedModifier[],
    notes?: string
  ) => {
    addItem(product, quantity, selectedModifiers, notes);
  }, [addItem]);

  // Isolated Admin Access: Check URL on mount and popstate/hashchange
  // Direct storefront access by default without requiring authorization
  const checkUrlRoute = () => {
    const path = window.location.pathname.toLowerCase();
    const hash = window.location.hash.toLowerCase();
    const params = new URLSearchParams(window.location.search);

    const isAdminRoute =
      path === '/admin' ||
      path === '/admin/login' ||
      path.startsWith('/admin/') ||
      path === '/internal-login' ||
      hash === '#admin' ||
      hash === '#admin-login' ||
      params.get('portal') === 'admin';

    const isPosRoute =
      path === '/pos' ||
      path.startsWith('/pos/') ||
      hash === '#pos' ||
      params.get('portal') === 'pos';

    if (isAdminRoute) {
      if (adminProfile) {
        setViewMode('ADMIN');
      } else {
        setViewMode('ADMIN_LOGIN');
      }
    } else if (isPosRoute) {
      if (adminProfile) {
        setViewMode('POS');
      } else {
        setViewMode('ADMIN_LOGIN');
      }
    } else {
      // Default: Public Customer Storefront (Zero authentication needed)
      setViewMode('STOREFRONT');
    }
  };

  useEffect(() => {
    checkUrlRoute();
    window.addEventListener('popstate', checkUrlRoute);
    window.addEventListener('hashchange', checkUrlRoute);
    return () => {
      window.removeEventListener('popstate', checkUrlRoute);
      window.removeEventListener('hashchange', checkUrlRoute);
    };
  }, [adminProfile]);

  const handleBackToStorefront = () => {
    setViewMode('STOREFRONT');
    if (
      window.location.hash ||
      window.location.search.includes('admin') ||
      window.location.pathname.includes('admin') ||
      window.location.pathname.includes('internal')
    ) {
      window.history.pushState({}, '', '/');
    }
  };

  // Staff Portal Handler (Invoked only by authenticated staff or isolated triggers)
  const handleOpenStaffPortal = (target: 'POS' | 'ADMIN') => {
    setPendingTarget(target);
    if (!isAuthenticated) {
      setViewMode('ADMIN_LOGIN');
      return;
    }
    setViewMode(target);
  };

  const handleSwitchView = (target: 'customer' | 'admin' | 'pos') => {
    if (target === 'customer') {
      handleBackToStorefront();
    } else if (target === 'pos') {
      handleOpenStaffPortal('POS');
    } else if (target === 'admin') {
      handleOpenStaffPortal('ADMIN');
    }
  };

  // Check if any modal or subview is open to enable back gesture
  const isAnyOverlayActive =
    isOrderSuccessOpen ||
    isCheckoutOpen ||
    isCartDrawerOpen ||
    !!activeModifierProduct ||
    isRewardsModalOpen ||
    isLoginModalOpen ||
    viewMode !== 'STOREFRONT';

  // Global Back Action: Closes topmost overlay or returns to storefront
  const handleGlobalBack = useCallback(() => {
    if (isOrderSuccessOpen) {
      setIsOrderSuccessOpen(false);
      setJustCompletedOrder(null);
      return;
    }
    if (isCheckoutOpen) {
      setIsCheckoutOpen(false);
      setIsCartDrawerOpen(true);
      return;
    }
    if (isCartDrawerOpen) {
      setIsCartDrawerOpen(false);
      return;
    }
    if (activeModifierProduct) {
      setActiveModifierProduct(null);
      return;
    }
    if (isRewardsModalOpen) {
      setIsRewardsModalOpen(false);
      return;
    }
    if (isLoginModalOpen) {
      setIsLoginModalOpen(false);
      return;
    }
    if (viewMode !== 'STOREFRONT') {
      handleBackToStorefront();
      return;
    }
  }, [
    isOrderSuccessOpen,
    isCheckoutOpen,
    isCartDrawerOpen,
    activeModifierProduct,
    isRewardsModalOpen,
    isLoginModalOpen,
    viewMode,
  ]);

  // Hook for Edge Swipe gesture navigation
  const gestureState = useGestureBack({
    onBack: handleGlobalBack,
    enabled: isAnyOverlayActive,
    edgeWidth: 50,
    threshold: 70,
    enableEdgeSwipe: true,
    allowAnywhereSwipe: viewMode === 'ADMIN_LOGIN' || isCartDrawerOpen,
  });

  // Synchronize with mobile system back gesture (Android edge swipe / iOS swipe back)
  const historyPushedRef = useRef(false);
  useEffect(() => {
    if (isAnyOverlayActive) {
      if (!historyPushedRef.current) {
        window.history.pushState({ appOverlay: true, timestamp: Date.now() }, '');
        historyPushedRef.current = true;
      }
    } else {
      historyPushedRef.current = false;
    }
  }, [isAnyOverlayActive]);

  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (isAnyOverlayActive) {
        historyPushedRef.current = false;
        handleGlobalBack();
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isAnyOverlayActive, handleGlobalBack]);

  // If in Isolated Admin Login Page
  if (viewMode === 'ADMIN_LOGIN') {
    return (
      <Suspense fallback={<LazyLoadFallback />}>
        <GestureBackIndicator gestureState={gestureState} label="Kembali ke Beranda" />
        <AdminLoginPage
          settings={settings}
          onSuccess={() => {
            setViewMode(pendingTarget);
          }}
          onBackToStorefront={handleBackToStorefront}
        />
      </Suspense>
    );
  }

  // If in POS Mode
  if (viewMode === 'POS') {
    return (
      <Suspense fallback={<LazyLoadFallback />}>
        <GestureBackIndicator gestureState={gestureState} label="Keluar POS" />
        <PosLayout
          products={products}
          categories={categories}
          modifierGroups={modifierGroups}
          promos={promos}
          settings={settings}
          onExitPos={handleBackToStorefront}
          onOpenAdmin={() => setViewMode('ADMIN')}
        />
      </Suspense>
    );
  }

  // If in Admin Dashboard Mode
  if (viewMode === 'ADMIN') {
    return (
      <Suspense fallback={<LazyLoadFallback />}>
        <GestureBackIndicator gestureState={gestureState} label="Ke Beranda" />
        <AdminLayout
          products={products}
          categories={categories}
          modifierGroups={modifierGroups}
          orders={orders}
          promos={promos}
          deliveryAreas={deliveryAreas}
          banners={banners}
          settings={settings}
          onRefreshData={loadMasterData}
          onOpenPos={() => setViewMode('POS')}
          onBackToStorefront={handleBackToStorefront}
        />
      </Suspense>
    );
  }

  // Primary Customer Storefront View
  return (
    <div className="min-h-screen bg-[#FBFBFC] text-gray-900 flex flex-col selection:bg-[#FF4500] selection:text-white">
      {/* Visual Gesture Navigation Indicator */}
      <GestureBackIndicator gestureState={gestureState} />

      {/* Top Navigation */}
      <Navbar
        settings={settings}
        onOpenCart={() => setIsCartDrawerOpen(true)}
        onOpenPos={() => handleOpenStaffPortal('POS')}
        onOpenAdmin={() => handleOpenStaffPortal('ADMIN')}
        onOpenRewards={() => setIsRewardsModalOpen(true)}
        currentView="customer"
        onSwitchView={handleSwitchView}
      />

      {/* Hero Banner Carousel */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 w-full pt-4">
        <HeroBannerSlider
          banners={banners}
          onBannerClick={() => {
            // Smooth scroll to catalog
            document.getElementById('catalog-section')?.scrollIntoView({ behavior: 'smooth' });
          }}
        />
      </div>

      {/* Main Container */}
      <main id="catalog-section" className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 w-full py-6">
        {/* Search & Wholesale Highlight Bar */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-3 mb-4">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari seblak, mie jebew, bakso aci..."
              className="w-full text-xs pl-10 pr-4 py-2.5 rounded-2xl bg-white border border-gray-200/90 shadow-2xs focus:outline-hidden focus:ring-2 focus:ring-[#FF4500]/25 focus:border-[#FF4500]"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-2.5 text-xs text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            )}
          </div>

          {/* Wholesale Info Strip */}
          <div className="w-full md:w-auto flex items-center gap-2 p-2.5 bg-[#FFF8E7] rounded-2xl border border-amber-200/60 text-xs text-amber-900">
            <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="font-semibold">
              Jajan Banyak Lebih Murah! Tersedia harga grosir bertingkat otomatis di menu bertanda khusus.
            </span>
          </div>
        </div>

        {/* Sticky Horizontal Category Bar */}
        <CategoryStickyBar
          categories={categories}
          selectedCategoryId={selectedCategoryId}
          onSelectCategory={setSelectedCategoryId}
        />

        {/* Product Catalog Grid */}
        <div className="mt-4">
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <div key={n} className="clay-card p-3 h-64 animate-pulse bg-gray-100/70" />
              ))}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="clay-card p-12 text-center text-gray-400 my-6">
              <UtensilsCrossed className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <h4 className="font-heading font-bold text-base text-gray-700">
                Menu Tidak Ditemukan
              </h4>
              <p className="text-xs text-gray-400 mt-1 max-w-xs mx-auto">
                Coba gunakan kata kunci pencarian lain atau pilih kategori Semua Menu.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {filteredProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  categories={categories}
                  modifierGroups={modifierGroups}
                  onOpenProductModal={handleOpenProductModal}
                  onQuickAdd={handleQuickAdd}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Floating Bottom Cart Pill (Mobile & Desktop) */}
      <FloatingCartPill onOpenCart={() => setIsCartDrawerOpen(true)} />

      {/* Footer with Business & Location Info */}
      <StoreInfoFooter
        settings={settings}
        platformLinks={platformLinks}
        onOpenAdmin={() => handleOpenStaffPortal('ADMIN')}
      />

      {/* Product Modifier Dialog */}
      <ProductModifierModal
        product={activeModifierProduct}
        modifierGroups={modifierGroups}
        categories={categories}
        isOpen={!!activeModifierProduct}
        onClose={() => setActiveModifierProduct(null)}
        onAddToCart={handleAddWithModifiers}
      />

      {/* Customer Rewards & Points Modal (Kotak Hadiah) */}
      <Suspense fallback={null}>
        <CustomerRewardsModal
          isOpen={isRewardsModalOpen}
          onClose={() => setIsRewardsModalOpen(false)}
          settings={settings}
          products={products}
        />
      </Suspense>

      {/* Slide-over Cart Drawer */}
      <CartDrawer
        isOpen={isCartDrawerOpen}
        onClose={() => setIsCartDrawerOpen(false)}
        onProceedToCheckout={() => {
          setIsCartDrawerOpen(false);
          setIsCheckoutOpen(true);
        }}
        allProducts={products}
        availablePromos={promos}
        settings={settings}
        categories={categories}
        modifierGroups={modifierGroups}
      />

      {/* Checkout Modal */}
      <CheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        deliveryAreas={deliveryAreas}
        settings={settings}
        categories={categories}
        modifierGroups={modifierGroups}
        onOrderSuccess={(order) => {
          setJustCompletedOrder(order);
          setIsOrderSuccessOpen(true);
        }}
      />

      {/* Order Success Modal (With WhatsApp CTA) */}
      <Suspense fallback={null}>
        <OrderSuccessModal
          order={justCompletedOrder}
          settings={settings}
          isOpen={isOrderSuccessOpen}
          onClose={() => {
            setIsOrderSuccessOpen(false);
            setJustCompletedOrder(null);
          }}
        />
      </Suspense>

      {/* Admin / Staff Login Modal */}
      <Suspense fallback={null}>
        <AdminLoginModal
          isOpen={isLoginModalOpen}
          onClose={() => setIsLoginModalOpen(false)}
          onSuccess={() => {
            setViewMode(pendingTarget);
          }}
        />
      </Suspense>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <MainApp />
      </CartProvider>
    </AuthProvider>
  );
}
