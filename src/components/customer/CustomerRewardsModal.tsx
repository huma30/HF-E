import React, { useState, useEffect, useRef } from 'react';
import {
  Gift,
  Award,
  Sparkles,
  Phone,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  Tag,
  ArrowRight,
  Loader2,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  ShoppingBag,
  Zap,
  RefreshCw,
  Printer,
  Share2,
  Check,
  X,
  History,
  TrendingUp,
  TrendingDown
} from 'lucide-react';
import { Modal } from '../common/Modal';
import { StoreSettings, RewardItem, Customer, Product, PointRedemption, PointLedgerEntry } from '../../types';
import { FirestoreService } from '../../services/firestoreService';
import { RedeemReceiptModal } from './RedeemReceiptModal';

interface CustomerRewardsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: StoreSettings | null;
  products?: Product[];
}

export const CustomerRewardsModal: React.FC<CustomerRewardsModalProps> = ({
  isOpen,
  onClose,
  settings,
  products = [],
}) => {
  const [activeTab, setActiveTab] = useState<'CATALOG' | 'CHECK_POINTS'>('CATALOG');
  const [rewards, setRewards] = useState<RewardItem[]>([]);
  const [isLoadingRewards, setIsLoadingRewards] = useState(false);

  // Unified Connected Customer State for Instant Redeem & Point History
  const [connectedPhone, setConnectedPhone] = useState<string>(() => {
    try {
      return localStorage.getItem('huma_loyalty_phone') || '';
    } catch {
      return '';
    }
  });
  const [connectedCustomer, setConnectedCustomer] = useState<Customer | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [connectError, setConnectError] = useState<string | null>(null);

  // Point Ledger Mutation History
  const [pointLedger, setPointLedger] = useState<PointLedgerEntry[]>([]);
  const [isLoadingLedger, setIsLoadingLedger] = useState(false);

  // Instant Redemption State
  const [selectedRewardToRedeem, setSelectedRewardToRedeem] = useState<RewardItem | null>(null);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [redeemError, setRedeemError] = useState<string | null>(null);

  // Receipt Modal State
  const [activeReceipt, setActiveReceipt] = useState<PointRedemption | null>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);

  const phoneInputRef = useRef<HTMLInputElement>(null);

  // Load rewards & connected customer data when modal opens
  useEffect(() => {
    if (isOpen) {
      loadRewards();
      if (connectedPhone) {
        handleCheckAndConnectPhone(connectedPhone);
      }
    }
  }, [isOpen]);

  const loadRewards = async () => {
    setIsLoadingRewards(true);
    try {
      const list = await FirestoreService.getRewards(true);
      setRewards(list);
    } catch (err) {
      console.warn('Gagal memuat katalog hadiah:', err);
    } finally {
      setIsLoadingRewards(false);
    }
  };

  /**
   * Unified Phone Verification:
   * Connects customer to loyalty balance, instantly populates Tab 1 and Tab 2
   */
  const handleCheckAndConnectPhone = async (phoneToCheck: string) => {
    const clean = phoneToCheck.trim();
    if (!clean) return;

    setIsConnecting(true);
    setConnectError(null);
    try {
      let cust = await FirestoreService.getCustomerByPhone(clean);
      if (!cust) {
        const cleanDigits = clean.replace(/\D/g, '');
        cust = await FirestoreService.findCustomerByWhatsapp(cleanDigits);
      }

      if (cust) {
        setConnectedCustomer(cust);
        setConnectedPhone(clean);
        setPhoneInput(clean);
        try {
          localStorage.setItem('huma_loyalty_phone', clean);
        } catch {
          // ignore
        }

        // Auto-fetch ledger history for Tab 2
        setIsLoadingLedger(true);
        try {
          const ledger = await FirestoreService.getPointLedger(cust.id, 25);
          setPointLedger(ledger);
        } catch (e) {
          console.warn('Failed to load point ledger:', e);
        } finally {
          setIsLoadingLedger(false);
        }
      } else {
        setConnectedCustomer(null);
        setPointLedger([]);
        setConnectError(`Nomor ${clean} belum terdaftar di riwayat pesanan. Lakukan pemesanan pertama Anda untuk otomatis mengumpulkan poin!`);
      }
    } catch (err: any) {
      setConnectError('Gagal menghubungkan ke data poin. Periksa koneksi internet Anda.');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleConnectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneInput.trim()) return;
    await handleCheckAndConnectPhone(phoneInput.trim());
  };

  const handleDisconnect = () => {
    setConnectedPhone('');
    setConnectedCustomer(null);
    setPointLedger([]);
    setPhoneInput('');
    setConnectError(null);
    try {
      localStorage.removeItem('huma_loyalty_phone');
    } catch {
      // ignore
    }
  };

  const handleFocusConnectInput = () => {
    phoneInputRef.current?.focus();
    phoneInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  // Instant Redeem Handler
  const handleInitiateRedeem = (reward: RewardItem) => {
    if (!connectedCustomer || !connectedPhone) {
      handleFocusConnectInput();
      return;
    }
    setRedeemError(null);
    setSelectedRewardToRedeem(reward);
  };

  const handleConfirmRedeem = async () => {
    if (!selectedRewardToRedeem || !connectedPhone || !connectedCustomer) return;

    setIsRedeeming(true);
    setRedeemError(null);

    try {
      const result = await FirestoreService.redeemInstantReward({
        customerPhone: connectedPhone,
        customerName: connectedCustomer.name,
        rewardId: selectedRewardToRedeem.id,
      });

      // Update connected customer points balance immediately
      setConnectedCustomer(result.customer);
      
      // Close confirmation dialog
      setSelectedRewardToRedeem(null);

      // Open receipt modal!
      setActiveReceipt(result.redemption);
      setIsReceiptModalOpen(true);

      // Reload rewards in background to sync stock & ledger
      loadRewards();
      if (result.customer?.id) {
        FirestoreService.getPointLedger(result.customer.id, 25)
          .then((l) => setPointLedger(l))
          .catch(() => {});
      }
    } catch (err: any) {
      console.error('Error in instant redeem:', err);
      setRedeemError(err?.message || 'Gagal memproses penukaran poin. Silakan coba sesaat lagi.');
    } finally {
      setIsRedeeming(false);
    }
  };

  const pointsPerRupiah = settings?.pointsPerRupiah || 10000;
  const redeemRate = settings?.pointsRedeemRate || 100;
  const storePhone = settings?.whatsapp || '085878775527';
  const cleanStorePhone = storePhone.replace(/^0/, '62').replace(/\D/g, '');

  const handleClaimViaWhatsApp = (reward: RewardItem) => {
    const text = `Halo Admin ${settings?.storeName || 'HUMA Food'}, saya ingin menukarkan ${reward.pointsCost} poin untuk hadiah: *${reward.name}*. Mohon konfirmasinya ya, terima kasih!`;
    const url = `https://wa.me/${cleanStorePhone}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Kotak Hadiah & HUMA Rewards"
        subtitle="Kumpulkan poin setiap jajan & tukarkan secara instan!"
        maxWidth="max-w-xl"
      >
        <div className="space-y-3.5 max-h-[78vh] overflow-y-auto pr-0.5">
          {/* Highlight Banner */}
          <div className="p-3.5 sm:p-4 rounded-2xl bg-gradient-to-br from-[#2E1A47] to-[#45276B] text-white shadow-sm relative overflow-hidden">
            <div className="absolute -right-3 -bottom-3 opacity-10 pointer-events-none">
              <Gift className="w-28 h-28 text-amber-300" />
            </div>

            <div className="relative z-10 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-300/30 text-[10px] font-extrabold uppercase tracking-wider">
                  <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />
                  <span>Program Loyalitas HUMA</span>
                </div>
                <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white/10 border border-white/20 text-[11px] text-white font-medium shrink-0">
                  <span className="text-purple-200 text-[10px]">1 Poin =</span>
                  <span className="font-extrabold text-amber-300">Rp {redeemRate}</span>
                </div>
              </div>

              <div>
                <h3 className="font-heading font-extrabold text-base sm:text-lg text-white leading-snug">
                  Makin Sering Jajan, Makin Banyak Hadiahnya!
                </h3>
                <p className="text-xs text-purple-200/90 mt-0.5 leading-relaxed">
                  Tiap transaksi Rp {pointsPerRupiah.toLocaleString('id-ID')} otomatis dapat 1 Poin untuk ditukar instan dengan voucher atau menu gratis.
                </p>
              </div>
            </div>
          </div>

          {/* TAB NAVIGATION */}
          <div className="flex bg-gray-100 p-1 rounded-xl text-xs font-bold">
            <button
              type="button"
              onClick={() => setActiveTab('CATALOG')}
              className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                activeTab === 'CATALOG'
                  ? 'bg-white text-[#2E1A47] shadow-xs font-extrabold'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Gift className="w-3.5 h-3.5 text-[#FF4500]" />
              <span>Katalog Hadiah</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('CHECK_POINTS')}
              className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                activeTab === 'CHECK_POINTS'
                  ? 'bg-white text-[#2E1A47] shadow-xs font-extrabold'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Award className="w-3.5 h-3.5 text-amber-500" />
              <span>Riwayat Poin</span>
            </button>
          </div>

          {/* TAB 1: KATALOG & REDEM INSTAN */}
          {activeTab === 'CATALOG' && (
            <div className="space-y-3.5">
              {/* WHATSAPP CONNECTION STATUS CARD */}
              {connectedCustomer ? (
                <div 
                  id="loyalty-connected-card"
                  className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-50/90 via-orange-50/50 to-amber-50/90 border border-amber-300/90 shadow-2xs space-y-2.5 animate-in fade-in duration-200"
                >
                  {/* Row 1: Profile info & Connection status */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-2xs font-extrabold">
                        <Zap className="w-4 h-4 text-amber-100 fill-amber-100" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-heading font-extrabold text-xs sm:text-sm text-[#2E1A47] truncate leading-tight">
                          {connectedCustomer.name || 'Pelanggan Setia'}
                        </h4>
                        <div className="flex items-center gap-1 text-[11px] text-gray-500 mt-0.5">
                          <Phone className="w-3 h-3 text-gray-400 shrink-0" />
                          <span className="font-mono text-gray-600 truncate">{connectedPhone}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                        <span>Terkoneksi</span>
                      </span>
                      <button
                        type="button"
                        onClick={handleDisconnect}
                        className="text-[11px] font-semibold text-gray-400 hover:text-rose-600 underline transition-colors"
                      >
                        Ganti
                      </button>
                    </div>
                  </div>

                  {/* Row 2: Point Balance & Quick Action */}
                  <div className="pt-2 border-t border-amber-200/70 flex items-center justify-between gap-2">
                    <div className="flex items-baseline gap-1.5 min-w-0">
                      <span className="text-[10px] uppercase font-bold text-amber-800/80 tracking-wider shrink-0">
                        Saldo:
                      </span>
                      <span className="font-heading font-black text-lg text-amber-600 leading-none">
                        {connectedCustomer.pointsBalance || 0} Poin
                      </span>
                      <span className="text-[11px] text-gray-500 font-medium truncate">
                        (≈ Rp {((connectedCustomer.pointsBalance || 0) * redeemRate).toLocaleString('id-ID')})
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setActiveTab('CHECK_POINTS')}
                      className="px-2.5 py-1 rounded-lg bg-white hover:bg-purple-50 text-[#2E1A47] hover:text-purple-900 border border-purple-200 text-[10px] font-extrabold shadow-2xs transition-colors flex items-center gap-1 shrink-0"
                    >
                      <History className="w-3 h-3 text-purple-600" />
                      <span>Riwayat</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* Prompt to connect WhatsApp for instant redeem */
                <div 
                  id="loyalty-connect-prompt"
                  className="p-3.5 rounded-2xl bg-gradient-to-r from-purple-50 via-amber-50/50 to-orange-50 border border-purple-200/80 space-y-2.5 shadow-2xs"
                >
                  <div className="flex items-start gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-[#2E1A47] text-amber-400 flex items-center justify-center shrink-0 shadow-2xs">
                      <Zap className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-heading font-extrabold text-xs text-[#2E1A47]">
                        Sambungkan WhatsApp untuk Redem Instan
                      </h4>
                      <p className="text-[11px] text-gray-600 mt-0.5 leading-snug">
                        Masukkan nomor WhatsApp Anda untuk langsung terhubung dengan saldo poin loyalitas & tukarkan hadiah sekarang juga.
                      </p>
                    </div>
                  </div>

                  <form onSubmit={handleConnectSubmit} className="flex gap-2 pt-1">
                    <div className="relative flex-1">
                      <Phone className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-2.5" />
                      <input
                        ref={phoneInputRef}
                        type="tel"
                        required
                        value={phoneInput}
                        onChange={(e) => setPhoneInput(e.target.value)}
                        placeholder="Cth: 085878775527"
                        className="w-full text-xs pl-8 pr-3 py-2 rounded-xl bg-white border border-gray-300 focus:outline-hidden focus:ring-2 focus:ring-[#FF4500]/30 font-semibold"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isConnecting}
                      className="clay-button-primary px-4 py-2 text-xs font-bold flex items-center gap-1.5 shadow-xs disabled:opacity-60 shrink-0"
                    >
                      {isConnecting ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Search className="w-3.5 h-3.5 text-amber-300" />
                      )}
                      <span className="font-extrabold tracking-wide">CEK SALDO POIN</span>
                    </button>
                  </form>

                  {connectError && (
                    <div className="p-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[11px] flex items-center gap-2">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{connectError}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Rewards List Header */}
              <div className="flex items-center justify-between text-xs text-gray-500 px-1 pt-1">
                <span>Pilih hadiah untuk ditukarkan:</span>
                <span className="text-[11px] font-semibold text-[#2E1A47]">
                  {rewards.length} Hadiah Tersedia
                </span>
              </div>

              {/* REWARDS GRID */}
              {isLoadingRewards ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2 text-gray-400">
                  <Loader2 className="w-6 h-6 animate-spin text-[#FF4500]" />
                  <span className="text-xs">Memuat katalog hadiah...</span>
                </div>
              ) : rewards.length === 0 ? (
                <div className="p-8 text-center bg-gray-50 rounded-2xl border border-gray-200">
                  <Gift className="w-10 h-10 text-gray-400 mx-auto mb-2 opacity-50" />
                  <p className="font-heading font-bold text-sm text-gray-700">
                    Katalog Hadiah Segera Hadir
                  </p>
                  <p className="text-xs text-gray-500 mt-1 max-w-xs mx-auto">
                    Admin sedang mempersiapkan reward voucher & menu gratis terbaru untukmu.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {rewards.map((reward) => {
                    const customerBalance =
                      connectedCustomer?.pointsBalance || 0;

                    const linkedProduct =
                      reward.type === 'PRODUCT' &&
                      reward.productId
                        ? products.find(
                            (p) => p.id === reward.productId
                          )
                        : undefined;

                    const productOutOfStock =
                      reward.type === 'PRODUCT' &&
                      !!reward.productId &&
                      (
                        linkedProduct?.stockEnabled !== true ||
                        typeof linkedProduct.stock !== 'number' ||
                        linkedProduct.stock <= 0
                      );

                    const discountQuotaOut =
                      reward.type === 'DISCOUNT' &&
                      reward.stock !== undefined &&
                      reward.stock <= 0;

                    const rewardUnavailable =
                      productOutOfStock || discountQuotaOut;

                    const canAfford =
                      !!connectedCustomer &&
                      customerBalance >= reward.pointsCost;

                    const deficit =
                      reward.pointsCost - customerBalance;

                    return (
                      <div
                        key={reward.id}
                        className="clay-card p-3.5 flex flex-col justify-between border border-gray-200/90 hover:border-amber-400 transition-all group relative bg-white"
                      >
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0 overflow-hidden">
                              {reward.imageUrl ? (
                                <img
                                  src={reward.imageUrl}
                                  alt={reward.name}
                                  className="w-full h-full object-cover rounded-xl"
                                />
                              ) : (
                                <Gift className="w-5 h-5 text-amber-600" />
                              )}
                            </div>

                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500 text-white font-extrabold text-xs shadow-2xs">
                              <Award className="w-3.5 h-3.5" />
                              <span>{reward.pointsCost} Poin</span>
                            </span>
                          </div>

                          <div>
                            <h4 className="font-heading font-extrabold text-xs sm:text-sm text-[#2E1A47] group-hover:text-[#FF4500] transition-colors line-clamp-1">
                              {reward.name}
                            </h4>
                            <p className="text-[11px] text-gray-500 line-clamp-2 mt-0.5 leading-snug">
                              {reward.description ||
                                (reward.type === 'DISCOUNT'
                                  ? `Voucher potongan harga Rp ${(reward.discountValue || 0).toLocaleString('id-ID')}`
                                  : 'Menu gratis spesial untuk pelanggan setia.')}
                            </p>
                            {reward.type === 'PRODUCT' &&
                            reward.productId ? (
                              linkedProduct?.stockEnabled === true ? (
                                <span className="text-[10px] text-gray-400 block mt-1">
                                  Stok menu: {linkedProduct.stock ?? 0} unit
                                </span>
                              ) : (
                                <span className="text-[10px] text-amber-600 block mt-1 font-semibold">
                                  Stok master belum aktif
                                </span>
                              )
                            ) : reward.type === 'DISCOUNT' &&
                              reward.stock !== undefined ? (
                              <span className="text-[10px] text-gray-400 block mt-1">
                                Sisa kuota: {reward.stock} unit
                              </span>
                            ) : null}
                          </div>
                        </div>

                        {/* Action buttons footer */}
                        <div className="pt-3 mt-3 border-t border-gray-100 flex flex-col gap-1.5">
                          {connectedCustomer ? (
                            canAfford && !rewardUnavailable ? (
                              <button
                                type="button"
                                onClick={() => handleInitiateRedeem(reward)}
                                className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 active:scale-98 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-xs transition-all"
                              >
                                <Zap className="w-3.5 h-3.5 text-amber-200 fill-amber-200" />
                                <span>⚡ Redem Instan</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled
                                className="w-full py-2 px-3 rounded-xl bg-gray-100 text-gray-400 font-bold text-xs flex items-center justify-center gap-1 cursor-not-allowed border border-gray-200"
                              >
                                <span>
                                  {rewardUnavailable
                                    ? reward.type === 'PRODUCT'
                                      ? 'Stok produk habis'
                                      : 'Kuota reward habis'
                                    : `Poin Kurang (${deficit} lagi)`}
                                </span>
                              </button>
                            )
                          ) : (
                            <button
                              type="button"
                              onClick={handleFocusConnectInput}
                              className="w-full py-2 px-3 rounded-xl bg-purple-50 hover:bg-purple-100 text-[#2E1A47] border border-purple-200 font-extrabold text-xs flex items-center justify-center gap-1.5 transition-colors"
                            >
                              <Search className="w-3.5 h-3.5 text-[#E1AD01]" />
                              <span>Cek Saldo untuk Redem</span>
                            </button>
                          )}

                          <div className="flex items-center justify-between text-[10px] text-gray-400 px-0.5">
                            <span>{reward.type === 'DISCOUNT' ? '🎫 Voucher' : '🍲 Menu Gratis'}</span>
                            <button
                              type="button"
                              onClick={() => handleClaimViaWhatsApp(reward)}
                              className="text-gray-500 hover:text-emerald-700 font-semibold underline flex items-center gap-0.5"
                            >
                              <span>Tanya via WA</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: CEK RIWAYAT POIN */}
          {activeTab === 'CHECK_POINTS' && (
            <div className="space-y-4">
              {connectedCustomer ? (
                /* Customer Already Connected: Instantly Show Profile, Balance & History */
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="p-3.5 sm:p-4 rounded-2xl bg-white border border-amber-300 shadow-xs space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-gray-100 gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          <h4 className="font-heading font-extrabold text-sm text-[#2E1A47] truncate">
                            {connectedCustomer.name || 'Pelanggan Setia'}
                          </h4>
                        </div>
                        <p className="text-[11px] text-gray-500 mt-0.5 font-mono truncate">
                          WA: {connectedPhone}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="px-2 py-0.5 rounded-full bg-purple-50 border border-purple-200 text-[#2E1A47] text-[10px] font-extrabold">
                          Member HUMA 🌟
                        </span>
                        <button
                          type="button"
                          onClick={handleDisconnect}
                          className="text-[11px] font-semibold text-gray-400 hover:text-rose-600 underline"
                        >
                          Ganti
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5 py-0.5">
                      <div className="p-2.5 bg-amber-50/70 rounded-xl border border-amber-200/80 text-center">
                        <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider block">
                          Saldo Poin:
                        </span>
                        <span className="font-heading font-black text-xl text-amber-600 block mt-0.5">
                          {connectedCustomer.pointsBalance || 0}
                        </span>
                        <span className="text-[10px] text-amber-700 font-semibold block mt-0.5 truncate">
                          ≈ Rp {((connectedCustomer.pointsBalance || 0) * redeemRate).toLocaleString('id-ID')}
                        </span>
                      </div>

                      <div className="p-2.5 bg-gray-50 rounded-xl border border-gray-200 text-center">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
                          Total Pesanan:
                        </span>
                        <span className="font-heading font-extrabold text-xl text-[#2E1A47] block mt-0.5">
                          {connectedCustomer.totalOrders || 0}
                        </span>
                        <span className="text-[10px] text-gray-400 block mt-0.5">
                          Pesanan Selesai
                        </span>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold truncate">
                        Poin siap ditukarkan di katalog!
                      </span>
                      <button
                        type="button"
                        onClick={() => setActiveTab('CATALOG')}
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] shrink-0 shadow-2xs flex items-center gap-1"
                      >
                        <Zap className="w-3 h-3 text-amber-300 fill-amber-300" />
                        <span>Tukar Hadiah</span>
                      </button>
                    </div>
                  </div>

                  {/* Mutasi / Riwayat Poin */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs px-1">
                      <span className="font-bold text-[#2E1A47] flex items-center gap-1.5">
                        <History className="w-3.5 h-3.5 text-gray-500" />
                        <span>Riwayat Mutasi Poin</span>
                      </span>
                      {isLoadingLedger && (
                        <span className="text-[10px] text-gray-400 flex items-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>Memuat riwayat...</span>
                        </span>
                      )}
                    </div>

                    {pointLedger.length === 0 ? (
                      <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 text-center text-xs text-gray-500">
                        Belum ada riwayat mutasi poin pada akun ini.
                      </div>
                    ) : (
                      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                        {pointLedger.map((entry) => {
                          const isEarn = entry.type === 'EARN' || entry.amount > 0;
                          return (
                            <div
                              key={entry.id}
                              className="p-2.5 rounded-xl bg-white border border-gray-200 flex items-center justify-between text-xs hover:bg-gray-50/80 transition-colors"
                            >
                              <div className="flex items-center gap-2.5">
                                <div
                                  className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                                    isEarn
                                      ? 'bg-emerald-100 text-emerald-700'
                                      : 'bg-rose-100 text-rose-700'
                                  }`}
                                >
                                  {isEarn ? (
                                    <TrendingUp className="w-3.5 h-3.5" />
                                  ) : (
                                    <TrendingDown className="w-3.5 h-3.5" />
                                  )}
                                </div>
                                <div>
                                  <span className="font-bold text-gray-800 block text-[11px]">
                                    {entry.type === 'EARN'
                                      ? 'Poin Masuk dari Pesanan'
                                      : entry.type === 'REDEEM'
                                      ? `Penukaran: ${entry.rewardName || 'Reward'}`
                                      : entry.note || 'Penyesuaian Poin'}
                                  </span>
                                  <span className="text-[10px] text-gray-400 block">
                                    {new Date(entry.createdAt).toLocaleDateString('id-ID', {
                                      day: '2-digit',
                                      month: 'short',
                                      year: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                    {entry.orderId ? ` • #${entry.orderId.slice(-6)}` : ''}
                                  </span>
                                </div>
                              </div>

                              <div className="text-right">
                                <span
                                  className={`font-heading font-black text-xs block ${
                                    isEarn ? 'text-emerald-600' : 'text-rose-600'
                                  }`}
                                >
                                  {isEarn ? `+${Math.abs(entry.amount)}` : `-${Math.abs(entry.amount)}`} Poin
                                </span>
                                <span className="text-[9px] text-gray-400">
                                  Saldo: {entry.balanceAfter}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* Customer Not Connected: Show Unified Input Form */
                <div className="space-y-4">
                  <div className="p-3.5 bg-amber-50 rounded-2xl border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5">
                    <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">Cara Mudah Cek Poin:</p>
                      <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                        Masukkan nomor WhatsApp yang Anda gunakan saat memesan di HUMA Food untuk melihat saldo poin dan otomatis terhubung ke katalog reward.
                      </p>
                    </div>
                  </div>

                  <form onSubmit={handleConnectSubmit} className="flex gap-2">
                    <div className="relative flex-1">
                      <Phone className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" />
                      <input
                        type="tel"
                        required
                        value={phoneInput}
                        onChange={(e) => setPhoneInput(e.target.value)}
                        placeholder="Cth: 085878775527"
                        className="w-full text-xs pl-10 pr-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200 focus:outline-hidden focus:ring-2 focus:ring-[#FF4500]/30 font-semibold"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isConnecting}
                      className="clay-button-primary px-5 py-2.5 text-xs font-bold flex items-center gap-1.5 shadow-md disabled:opacity-60 shrink-0"
                    >
                      {isConnecting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Search className="w-4 h-4 text-amber-300" />
                      )}
                      <span className="font-extrabold tracking-wide">CEK SALDO POIN</span>
                    </button>
                  </form>

                  {connectError && (
                    <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200 text-center space-y-2">
                      <AlertCircle className="w-8 h-8 text-amber-500 mx-auto" />
                      <h4 className="font-heading font-bold text-xs text-gray-800">
                        Nomor Belum Memiliki Poin
                      </h4>
                      <p className="text-[11px] text-gray-500 max-w-xs mx-auto">
                        {connectError}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Footer Note */}
          <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-400">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Poin terhubung aman dengan sistem transaksi HUMA</span>
            </span>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-500 hover:text-gray-800 font-bold"
            >
              Tutup
            </button>
          </div>
        </div>
      </Modal>

      {/* CONFIRMATION MODAL FOR INSTANT REDEEM */}
      {selectedRewardToRedeem && connectedCustomer && (
        <Modal
          isOpen={true}
          onClose={() => !isRedeeming && setSelectedRewardToRedeem(null)}
          title="Konfirmasi Redem Instan"
          maxWidth="max-w-sm"
        >
          <div className="space-y-3.5">
            <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 text-center space-y-1">
              <span className="text-[10px] uppercase font-bold text-amber-800 tracking-wider">
                Hadiah yang Dipilih:
              </span>
              <h4 className="font-heading font-black text-base text-[#2E1A47]">
                {selectedRewardToRedeem.name}
              </h4>
              <p className="text-xs text-gray-500">
                {selectedRewardToRedeem.type === 'DISCOUNT' ? 'Voucher Potongan Belanja' : 'Menu Spesial Gratis'}
              </p>
            </div>

            <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 text-xs space-y-2">
              <div className="flex justify-between items-center text-gray-600">
                <span>Pelanggan:</span>
                <span className="font-bold text-gray-900">{connectedCustomer.name}</span>
              </div>
              <div className="flex justify-between items-center text-gray-600">
                <span>WhatsApp:</span>
                <span className="font-bold text-gray-900">{connectedPhone}</span>
              </div>
              <div className="border-t border-gray-200 pt-1.5 flex justify-between items-center text-amber-700 font-bold">
                <span>Poin Ditukarkan:</span>
                <span className="font-extrabold text-sm">-{selectedRewardToRedeem.pointsCost} Poin</span>
              </div>
              <div className="flex justify-between items-center text-gray-700">
                <span>Sisa Saldo Anda:</span>
                <span className="font-bold">
                  {(connectedCustomer.pointsBalance || 0) - selectedRewardToRedeem.pointsCost} Poin
                </span>
              </div>
            </div>

            <p className="text-[11px] text-gray-500 text-center leading-relaxed">
              Setelah penukaran berhasil, sistem akan menerbitkan <strong>Struk Resmi</strong> dengan kode klaim yang dapat Anda cetak atau bagikan langsung via WhatsApp.
            </p>

            {redeemError && (
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{redeemError}</span>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                disabled={isRedeeming}
                onClick={() => setSelectedRewardToRedeem(null)}
                className="flex-1 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isRedeeming}
                onClick={handleConfirmRedeem}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-extrabold text-xs shadow-xs flex items-center justify-center gap-1.5 transition-all disabled:opacity-60"
              >
                {isRedeeming ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Memproses...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 fill-amber-200" />
                    <span>Tukar Sekarang!</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* STRUK PENUKARAN MODAL (PRINT & SHARE RECEIPT) */}
      <RedeemReceiptModal
        isOpen={isReceiptModalOpen}
        onClose={() => setIsReceiptModalOpen(false)}
        redemption={activeReceipt}
        customer={connectedCustomer}
        settings={settings}
      />
    </>
  );
};
