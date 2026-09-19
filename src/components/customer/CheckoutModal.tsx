import React, { useState, useId, useMemo, useEffect } from 'react';
import { Modal } from '../common/Modal';
import { useCart } from '../../context/CartContext';
import { BatchModifierModal } from './BatchModifierModal';
import {
  DeliveryArea,
  PaymentMethod,
  ServiceType,
  Order,
  StoreSettings,
  Category,
  ModifierGroup,
  BatchModifierSelection,
} from '../../types';
import { FirestoreService } from '../../services/firestoreService';
import { PricingEngine } from '../../services/pricingEngine';
import { soundService } from '../../services/audioNotification';
import { WhatsAppService } from '../../services/whatsappService';
import { QrisPaymentDisplay } from '../common/QrisPaymentDisplay';
import {
  MapPin,
  Clock,
  Phone,
  User,
  Banknote,
  QrCode,
  CreditCard,
  AlertCircle,
  Loader2,
  CheckCircle2,
  MessageCircle,
  Sparkles,
  Copy,
  Check,
  Download,
  Receipt,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  deliveryAreas: DeliveryArea[];
  settings: StoreSettings | null;
  categories?: Category[];
  modifierGroups?: ModifierGroup[];
  onOrderSuccess: (order: Order) => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  onClose,
  deliveryAreas,
  settings,
  categories = [],
  modifierGroups = [],
  onOrderSuccess,
}) => {
  const {
    items,
    subtotal,
    discount,
    mixMatchDiscount,
    mixMatchBundles,
    appliedPromo,
    clearCart,
    serviceType,
    setServiceType,
    selectedDeliveryArea,
    setDeliveryArea,
    batchSelections,
    setBatchSelection,
  } = useCart();

  const [customerName, setCustomerName] = useState('');
  const [customerWhatsapp, setCustomerWhatsapp] = useState('');
  const [address, setAddress] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [amountPaidInput, setAmountPaidInput] = useState<string>('');

  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedAccount, setCopiedAccount] = useState(false);
  const [activeTab, setActiveTab] = useState<'INFO' | 'PAYMENT'>('INFO');

  const paymentOptions = useMemo(() => ({
    cash: settings?.isCodEnabled !== false,
    qris: settings?.isQrisEnabled !== false,
    transfer: settings?.isTransferEnabled !== false,
  }), [settings?.isCodEnabled, settings?.isQrisEnabled, settings?.isTransferEnabled]);

  useEffect(() => {
    if (paymentMethod === 'CASH' && !paymentOptions.cash) {
      setPaymentMethod(paymentOptions.qris ? 'QRIS' : 'BANK_TRANSFER');
    } else if (paymentMethod === 'QRIS' && !paymentOptions.qris) {
      setPaymentMethod(paymentOptions.cash ? 'CASH' : 'BANK_TRANSFER');
    } else if (paymentMethod === 'BANK_TRANSFER' && !paymentOptions.transfer) {
      setPaymentMethod(paymentOptions.cash ? 'CASH' : 'QRIS');
    }
  }, [paymentMethod, paymentOptions.cash, paymentOptions.qris, paymentOptions.transfer]);

  // Active category being configured for batch modifiers (e.g. bumbu gorengan)
  const [activeBatchCategory, setActiveBatchCategory] = useState<{
    category: Category;
    group: ModifierGroup;
    totalQty: number;
  } | null>(null);

  // Idempotency key generated per modal open
  const formSessionKey = useId();
  const [idempotencyKey] = useState(() => `web_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`);

  // Active delivery areas
  const activeAreas = deliveryAreas.filter((a) => a.isActive);

  // Delivery fee
  const deliveryFee =
    serviceType === 'DELIVERY' && selectedDeliveryArea ? selectedDeliveryArea.deliveryFee : 0;

  // Total
  const total = Math.max(0, subtotal - discount + deliveryFee);

  // Detect which categories in cart require Batch Modifiers (e.g., Aneka Gorengan bumbu)
  const batchModifierCategories = useMemo(() => {
    if (!categories || categories.length === 0 || !items || items.length === 0) return [];
    return categories
      .filter((cat) => (cat.batchModifierEnabled && cat.batchModifierGroupId) || cat.name.toLowerCase().includes('goreng'))
      .map((cat) => {
        const matchingItems = items.filter((it) => it.categoryId === cat.id);
        const totalQty = matchingItems.reduce((sum, it) => sum + it.quantity, 0);
        const group = modifierGroups?.find(
          (g) => g.id === cat.batchModifierGroupId || (cat.name.toLowerCase().includes('goreng') && g.name.toLowerCase().includes('bumbu'))
        );
        return {
          category: cat,
          group,
          totalQty,
        };
      })
      .filter(
        (entry): entry is { category: Category; group: ModifierGroup; totalQty: number } =>
          entry.totalQty > 0 && !!entry.group
      );
  }, [categories, items, modifierGroups]);

  // Check if any required batch modifier category is incomplete
  // Strict rule: For Aneka Gorengan or categories with batch modifiers, bumbu is ALWAYS required!
  const hasIncompleteBatchModifiers = useMemo(() => {
    return batchModifierCategories.some((entry) => {
      const isGorengan = entry.category.name.toLowerCase().includes('goreng');
      const isReq = isGorengan || entry.category.batchModifierRequired !== false;
      if (!isReq) return false;

      const minSelections = entry.category.batchModifierMinSelection !== undefined
        ? Math.max(1, Number(entry.category.batchModifierMinSelection))
        : (entry.group.minSelection !== undefined ? Math.max(1, Number(entry.group.minSelection)) : 1);

      const sel = batchSelections[entry.category.id];
      const selectedCount = sel
        ? (sel.selectedModifiers?.length ?? sel.options?.filter((o) => (o.quantity ?? 1) > 0).length ?? 0)
        : 0;

      return selectedCount < minSelections;
    });
  }, [batchModifierCategories, batchSelections]);

  // Helper to get first incomplete batch category
  const getFirstIncompleteCategory = () => {
    return batchModifierCategories.find((entry) => {
      const isGorengan = entry.category.name.toLowerCase().includes('goreng');
      const isReq = isGorengan || entry.category.batchModifierRequired !== false;
      if (!isReq) return false;

      const minSelections = entry.category.batchModifierMinSelection !== undefined
        ? Math.max(1, Number(entry.category.batchModifierMinSelection))
        : (entry.group.minSelection !== undefined ? Math.max(1, Number(entry.group.minSelection)) : 1);

      const sel = batchSelections[entry.category.id];
      const selectedCount = sel
        ? (sel.selectedModifiers?.length ?? sel.options?.filter((o) => (o.quantity ?? 1) > 0).length ?? 0)
        : 0;

      return selectedCount < minSelections;
    });
  };

  // Cash calculation
  const parsedAmountPaid =
    paymentMethod === 'CASH' || paymentMethod === 'COD'
      ? amountPaidInput.trim() === ''
        ? total
        : parseInt(amountPaidInput.replace(/\D/g, ''), 10) || 0
      : total;

  const change = Math.max(0, parsedAmountPaid - total);

  // Quick cash options
  const quickCashOptions = [total, 20000, 50000, 100000].filter((val) => val >= total);
  const uniqueQuickCash = Array.from(new Set(quickCashOptions)).sort((a, b) => a - b);

  const handleCopyAccount = (acc: string) => {
    try {
      navigator.clipboard.writeText(acc);
      setCopiedAccount(true);
      setTimeout(() => setCopiedAccount(false), 2000);
    } catch {
      // Fallback
    }
  };

  const validateDeliveryInfo = (): boolean => {
    setErrorMessage(null);

    // Strict bumbu validation before payment:
    if (hasIncompleteBatchModifiers) {
      setErrorMessage('Pesanan Aneka Gorengan wajib memilih bumbu terlebih dahulu.');
      const firstIncomplete = getFirstIncompleteCategory();
      if (firstIncomplete) {
        setActiveBatchCategory(firstIncomplete);
      }
      return false;
    }

    if (!customerName.trim()) {
      setErrorMessage('Mohon masukkan nama pemesan.');
      return false;
    }
    if (serviceType === 'DELIVERY') {
      if (!selectedDeliveryArea) {
        setErrorMessage('Mohon pilih area pengantaran.');
        return false;
      }
      if (subtotal < selectedDeliveryArea.minOrderAmount) {
        setErrorMessage(
          `Minimal order untuk area ${selectedDeliveryArea.name} adalah Rp ${selectedDeliveryArea.minOrderAmount.toLocaleString('id-ID')}.`
        );
        return false;
      }
      if (!address.trim()) {
        setErrorMessage('Mohon cantumkan alamat pengantaran lengkap.');
        return false;
      }
    }
    return true;
  };

  const handleProceedToPayment = () => {
    if (hasIncompleteBatchModifiers) {
      setErrorMessage('Pesanan Aneka Gorengan wajib memilih bumbu (min. 1 rasa) sebelum lanjut ke pembayaran.');
      const firstIncomplete = getFirstIncompleteCategory();
      if (firstIncomplete) {
        setActiveBatchCategory(firstIncomplete);
      }
      return;
    }

    if (validateDeliveryInfo()) {
      setActiveTab('PAYMENT');
    }
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isProcessing) return; // Anti-double order guard

    setErrorMessage(null);

    // Respect the admin order toggle before any payment/order write.
    if (settings?.isOrderingEnabled === false) {
      setErrorMessage('Pesanan sedang ditutup oleh toko. Silakan coba kembali saat pemesanan dibuka.');
      return;
    }


    if (!paymentOptions.cash && !paymentOptions.qris && !paymentOptions.transfer) {
      setErrorMessage('Tidak ada metode pembayaran yang sedang diaktifkan oleh toko.');
      return;
    }

    if (
      (paymentMethod === 'CASH' && !paymentOptions.cash) ||
      (paymentMethod === 'QRIS' && !paymentOptions.qris) ||
      (paymentMethod === 'BANK_TRANSFER' && !paymentOptions.transfer)
    ) {
      setErrorMessage('Metode pembayaran yang dipilih sedang tidak tersedia.');
      return;
    }

    // 0. Strict validation: Never allow order submission without required bumbu
    if (hasIncompleteBatchModifiers) {
      setErrorMessage('Pesanan Aneka Gorengan wajib memilih bumbu sebelum menyelesaikan pembayaran.');
      const firstIncomplete = getFirstIncompleteCategory();
      if (firstIncomplete) {
        setActiveBatchCategory(firstIncomplete);
      }
      setActiveTab('INFO');
      return;
    }

    // If still on info tab, transition to payment instead
    if (activeTab === 'INFO') {
      handleProceedToPayment();
      return;
    }

    // 1. Validate customer name
    if (!customerName.trim()) {
      setErrorMessage('Mohon masukkan nama pemesan.');
      return;
    }

    // 2. Validate batch modifiers
    if (hasIncompleteBatchModifiers) {
      setErrorMessage('Mohon lengkapi pilihan bumbu sebelum melanjutkan pesanan.');
      return;
    }

    // 3. Validate delivery details if delivery
    if (serviceType === 'DELIVERY') {
      if (!selectedDeliveryArea) {
        setErrorMessage('Mohon pilih area pengantaran.');
        return;
      }
      if (subtotal < selectedDeliveryArea.minOrderAmount) {
        setErrorMessage(
          `Minimal order untuk area ${selectedDeliveryArea.name} adalah Rp ${selectedDeliveryArea.minOrderAmount.toLocaleString('id-ID')}.`
        );
        return;
      }
      if (!address.trim()) {
        setErrorMessage('Mohon cantumkan alamat pengantaran lengkap.');
        return;
      }
    }

    // 4. Validate cash payment amount
    if ((paymentMethod === 'CASH' || paymentMethod === 'COD') && amountPaidInput.trim() !== '') {
      const cashCheck = PricingEngine.validateCashPayment(total, parsedAmountPaid);
      if (!cashCheck.isValid) {
        setErrorMessage(cashCheck.message || 'Nominal uang yang dibayarkan kurang.');
        return;
      }
    }

    // 5. Submit Order
    try {
      setIsProcessing(true);

      const customerData: Order['customer'] = {
        name: customerName.trim(),
        whatsapp: customerWhatsapp.trim() || '-',
      };
      if (serviceType === 'DELIVERY' && address.trim()) {
        customerData.address = address.trim();
      }
      if (orderNotes.trim()) {
        customerData.notes = orderNotes.trim();
      }

      // Collect batch modifiers
      const batchModifiersList = Object.values(batchSelections);

      const orderPayload: Omit<Order, 'id' | 'orderNumber' | 'createdAt'> = {
        source: 'WEB',
        status: 'PENDING',
        customer: customerData,
        serviceType,
        items,
        subtotal,
        discount,
        deliveryFee,
        total,
        paymentMethod,
        amountPaid: parsedAmountPaid || total,
        change: change || 0,
        idempotencyKey,
        batchModifiers: batchModifiersList.length > 0 ? batchModifiersList : undefined,
      };

      if (serviceType === 'DELIVERY') {
        if (selectedDeliveryArea?.id) orderPayload.deliveryAreaId = selectedDeliveryArea.id;
        if (selectedDeliveryArea?.name) orderPayload.deliveryAreaName = selectedDeliveryArea.name;
      }
      if (appliedPromo?.code) {
        orderPayload.promoCode = appliedPromo.code;
      }

      // Keep the original HUMA flow:
      // 1) commit the order safely in Firestore
      // 2) open the final WhatsApp URL
      // No intermediate about:blank tab.
      const createdOrder = await FirestoreService.createOrder(orderPayload);
      soundService.playNewOrderChime();

      const cleanStorePhone = (settings?.whatsapp || '085878775527').replace(/^0/, '62').replace(/\D/g, '');
      const waUrl = WhatsAppService.getWhatsAppUrl(createdOrder, cleanStorePhone);

      try {
        const waWin = window.open(waUrl, '_blank');
        if (!waWin || waWin.closed || typeof waWin.closed === 'undefined') {
          window.location.href = waUrl;
        }
      } catch {
        window.location.href = waUrl;
      }

      clearCart();
      onClose();
      onOrderSuccess(createdOrder);
    } catch (err: any) {
      console.error('Order creation error:', err);

      const rawMessage = String(err?.message || '');
      const errorCode = String(err?.code || '');

      if (
        errorCode === 'permission-denied' ||
        /missing or insufficient permissions/i.test(rawMessage) ||
        /permission-denied/i.test(rawMessage)
      ) {
        setErrorMessage(
          'Pesanan belum dapat disimpan ke sistem. Silakan coba lagi. Jika masalah tetap terjadi, tunggu beberapa detik lalu ulangi.'
        );
      } else if (/network|offline|unavailable/i.test(rawMessage)) {
        setErrorMessage(
          'Koneksi sedang bermasalah. Periksa internet Anda lalu coba lagi.'
        );
      } else {
        setErrorMessage(
          rawMessage || 'Gagal memproses pesanan. Silakan coba sesaat lagi.'
        );
      }
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={() => !isProcessing && onClose()}
        title={activeTab === 'INFO' ? 'Detail Pengiriman' : 'Metode Pembayaran'}
        subtitle={
          activeTab === 'INFO'
            ? 'Langkah 1 dari 2: Alamat & data pemesan'
            : 'Langkah 2 dari 2: Pilih cara bayar & konfirmasi'
        }
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleSubmitOrder} className="space-y-4">
          {/* 2-Step Process Tab Switcher */}
          <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl select-none">
            <button
              type="button"
              onClick={() => setActiveTab('INFO')}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                activeTab === 'INFO'
                  ? 'bg-white text-[#2E1A47] shadow-xs'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              <MapPin className="w-3.5 h-3.5 text-[#FF4500]" />
              <span>1. Pengiriman & Pemesan</span>
            </button>
            <button
              type="button"
              onClick={handleProceedToPayment}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                activeTab === 'PAYMENT'
                  ? 'bg-white text-[#2E1A47] shadow-xs'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              <CreditCard className="w-3.5 h-3.5 text-purple-600" />
              <span>2. Pembayaran</span>
            </button>
          </div>

          {/* TAB 1: PENGIRIMAN & DATA PEMESAN */}
          {activeTab === 'INFO' && (
            <div className="space-y-4">
          {/* Service Type Selection (Delivery vs Takeaway) */}
          <div>
            <label className="block text-xs font-bold text-[#2E1A47] mb-1.5">
              Layanan Pesanan:
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setServiceType('DELIVERY')}
                className={`p-3 rounded-2xl border text-xs font-bold flex flex-col items-center gap-1 transition-all ${
                  serviceType === 'DELIVERY'
                    ? 'bg-[#2E1A47] text-white border-[#2E1A47] shadow-sm'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                }`}
              >
                <span className="text-base">🛵</span>
                <span>Antar ke Rumah (Delivery)</span>
              </button>

              <button
                type="button"
                onClick={() => setServiceType('TAKEAWAY')}
                className={`p-3 rounded-2xl border text-xs font-bold flex flex-col items-center gap-1 transition-all ${
                  serviceType === 'TAKEAWAY'
                    ? 'bg-[#2E1A47] text-white border-[#2E1A47] shadow-sm'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                }`}
              >
                <span className="text-base">🛍️</span>
                <span>Ambil Sendiri (Takeaway)</span>
              </button>
            </div>
          </div>

          {/* Ringkasan Pilihan Bumbu (Confirmed from Cart) */}
          {batchModifierCategories.length > 0 && (
            <div className="bg-purple-50/70 p-3.5 rounded-2xl border border-purple-200/80 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-extrabold text-[#2E1A47] uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#FF4500]" />
                  <span>Pilihan Bumbu & Rasa</span>
                </h4>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/90 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Sudah Dipilih di Keranjang</span>
                </span>
              </div>

              <div className="space-y-2">
                {batchModifierCategories.map((entry) => {
                  const sel = batchSelections[entry.category.id];
                  const groupName = entry.group?.name || 'Bumbu';
                  const isReq = entry.category.batchModifierRequired !== false;
                  const minSelections = entry.category.batchModifierMinSelection !== undefined
                    ? Math.max(0, Number(entry.category.batchModifierMinSelection))
                    : (entry.group.minSelection !== undefined ? Math.max(0, Number(entry.group.minSelection)) : (isReq ? 1 : 0));
                  const selectedOptions = sel?.options?.filter((o) => (o.quantity ?? 1) > 0) || [];
                  const selectedCount = selectedOptions.length;
                  const isAllocated = selectedCount > 0;
                  const isComplete = isReq ? selectedCount >= (minSelections || 1) : true;

                  if (isComplete && isAllocated) {
                    return (
                      <div
                        key={entry.category.id}
                        className="p-2.5 bg-white rounded-xl border border-emerald-200 shadow-2xs flex items-center gap-2"
                      >
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-extrabold text-emerald-900">
                            {groupName} ({entry.category.name})
                          </p>
                          <p className="text-[11px] text-gray-700 font-medium">
                            {selectedOptions.map((o) => o.modifierName).join(', ')}
                          </p>
                        </div>
                      </div>
                    );
                  }

                  if (!isReq && selectedCount === 0) {
                    return (
                      <div
                        key={entry.category.id}
                        className="p-2.5 bg-gray-50 rounded-xl border border-gray-200 flex items-center gap-2"
                      >
                        <span className="text-xs text-gray-500 italic">
                          {groupName} ({entry.category.name}): Tidak memilih bumbu (Opsional)
                        </span>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={entry.category.id}
                      className="p-3 bg-amber-50 rounded-xl border border-amber-300 shadow-2xs flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                        <div>
                          <p className="text-xs font-extrabold text-amber-900">
                            ⚠️ {groupName} Belum Dipilih (Wajib)
                          </p>
                          <p className="text-[10px] text-amber-700">
                            Wajib pilih minimal {minSelections || 1} bumbu tabur sebelum lanjut ke pembayaran.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveBatchCategory(entry)}
                        className="px-3 py-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl transition-all shrink-0 shadow-sm flex items-center gap-1 cursor-pointer animate-pulse"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-amber-200" />
                        <span>Pilih Bumbu</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Customer Information */}
          <div className="bg-gray-50/80 p-3.5 rounded-2xl border border-gray-100 space-y-3">
            <h4 className="text-xs font-extrabold text-[#2E1A47] uppercase tracking-wider">
              Informasi Pemesan
            </h4>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Nama Anda <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Cth: Budi / Siti"
                  className="w-full text-xs pl-9 pr-3 py-2 rounded-xl bg-white border border-gray-200 focus:outline-hidden focus:ring-2 focus:ring-[#FF4500]/30"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Nomor WhatsApp <span className="text-gray-400 font-normal">(Opsional)</span>
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                <input
                  type="tel"
                  value={customerWhatsapp}
                  onChange={(e) => setCustomerWhatsapp(e.target.value)}
                  placeholder="08xxxxxxxxxx (bisa dikosongkan)"
                  className="w-full text-xs pl-9 pr-3 py-2 rounded-xl bg-white border border-gray-200 focus:outline-hidden focus:ring-2 focus:ring-[#FF4500]/30"
                />
              </div>
              <p className="text-[10px] text-gray-400 mt-0.5">
                Jika kosong, otomatis tercatat "-" di sistem.
              </p>
            </div>
          </div>

          {/* Delivery Area & Address (Only if Delivery) */}
          {serviceType === 'DELIVERY' && (
            <div className="bg-gray-50/80 p-3.5 rounded-2xl border border-gray-100 space-y-3">
              <h4 className="text-xs font-extrabold text-[#2E1A47] uppercase tracking-wider flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-[#FF4500]" />
                Detail Alamat Pengantaran
              </h4>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Pilih Area Pengantaran <span className="text-rose-500">*</span>
                </label>
                <div className="space-y-1.5">
                  {activeAreas.map((area) => {
                    const isSelected = selectedDeliveryArea?.id === area.id;
                    return (
                      <button
                        key={area.id}
                        type="button"
                        onClick={() => setDeliveryArea(area)}
                        className={`w-full p-2.5 rounded-xl text-left border text-xs transition-all ${
                          isSelected
                            ? 'bg-white border-2 border-[#2E1A47] shadow-xs'
                            : 'bg-white/70 border-gray-200 hover:bg-white'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[#2E1A47]">{area.name}</span>
                          <span className="font-extrabold text-[#FF4500]">
                            {area.deliveryFee === 0 ? 'Gratis Ongkir' : `+Rp ${area.deliveryFee.toLocaleString('id-ID')}`}
                          </span>
                        </div>
                        <div className="text-[11px] text-gray-500 flex items-center gap-2 mt-0.5">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" /> ±{area.estimatedDeliveryMinutes} mnt
                          </span>
                          <span>• Min. Rp {area.minOrderAmount.toLocaleString('id-ID')}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Alamat Lengkap / Blok Rumah <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={2}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Cth: Perum Gina Blok A No. 5 (Pagar hitam, cat krem)"
                  className="w-full text-xs p-2.5 rounded-xl bg-white border border-gray-200 focus:outline-hidden focus:ring-2 focus:ring-[#FF4500]/30"
                />
              </div>
            </div>
          )}

          {/* Order Notes */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Catatan Tambahan untuk Dapur (Opsional):
            </label>
            <input
              type="text"
              value={orderNotes}
              onChange={(e) => setOrderNotes(e.target.value)}
              placeholder="Cth: Sambal dipisah ya min..."
              className="w-full text-xs px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:outline-hidden"
            />
          </div>

          {/* Error message in Tab 1 */}
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-rose-700 text-xs font-semibold">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Step 1 Next Button */}
          <div className="pt-2">
            {hasIncompleteBatchModifiers ? (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    const firstIncomplete = getFirstIncompleteCategory();
                    if (firstIncomplete) {
                      setActiveBatchCategory(firstIncomplete);
                    }
                  }}
                  className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white ring-4 ring-amber-200 py-3.5 px-4 flex items-center justify-center gap-2 text-sm font-extrabold shadow-lg rounded-2xl cursor-pointer transition-all animate-pulse"
                >
                  <AlertCircle className="w-5 h-5 text-amber-100" />
                  <span>Wajib Pilih Bumbu Gorengan Dahulu</span>
                  <ArrowRight className="w-4 h-4 text-amber-200" />
                </button>
                <p className="text-[11px] text-amber-800 text-center font-semibold bg-amber-50 py-1.5 px-3 rounded-xl border border-amber-200">
                  ⚠️ Pesanan Aneka Gorengan wajib memilih bumbu tabur/rasa sebelum lanjut ke pembayaran.
                </p>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleProceedToPayment}
                className="w-full clay-button-primary py-3 px-4 flex items-center justify-center gap-2 text-sm font-bold shadow-md cursor-pointer"
              >
                <span>Lanjut ke Pembayaran (Rp {total.toLocaleString('id-ID')})</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: METODE PEMBAYARAN & KONFIRMASI */}
      {activeTab === 'PAYMENT' && (
        <div className="space-y-4">
          {/* Blocking alert if bumbu was not selected */}
          {hasIncompleteBatchModifiers && (
            <div className="p-3.5 bg-amber-50 border-2 border-amber-400 rounded-2xl flex items-center justify-between gap-3 shadow-sm">
              <div className="flex items-center gap-2.5">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                <div>
                  <h5 className="font-extrabold text-xs text-amber-950">
                    Bumbu Gorengan Belum Dipilih!
                  </h5>
                  <p className="text-[11px] text-amber-800">
                    Wajib pilih varian rasa bumbu sebelum lanjut menyelesaikan pesanan.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const firstIncomplete = getFirstIncompleteCategory();
                  if (firstIncomplete) {
                    setActiveBatchCategory(firstIncomplete);
                  }
                }}
                className="px-3 py-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl transition-all shrink-0 shadow-sm flex items-center gap-1 cursor-pointer animate-pulse"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-200" />
                <span>Pilih Bumbu</span>
              </button>
            </div>
          )}

          {/* Payment Method */}
          <div className="bg-gray-50/80 p-3.5 rounded-2xl border border-gray-100 space-y-3">
            <h4 className="text-xs font-extrabold text-[#2E1A47] uppercase tracking-wider">
              Metode Pembayaran
            </h4>

            <div className="grid grid-cols-3 gap-2">
              {paymentOptions.cash && <button
                type="button"
                onClick={() => setPaymentMethod('CASH')}
                className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition-all ${
                  paymentMethod === 'CASH'
                    ? 'bg-[#2E1A47] text-white border-[#2E1A47] shadow-xs'
                    : 'bg-white text-gray-700 border-gray-200'
                }`}
              >
                <Banknote className="w-4 h-4 text-emerald-400" />
                <span>Tunai / COD</span>
              </button>}

              {paymentOptions.qris && <button
                type="button"
                onClick={() => setPaymentMethod('QRIS')}
                className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition-all ${
                  paymentMethod === 'QRIS'
                    ? 'bg-[#2E1A47] text-white border-[#2E1A47] shadow-xs'
                    : 'bg-white text-gray-700 border-gray-200'
                }`}
              >
                <QrCode className="w-4 h-4 text-blue-400" />
                <span>QRIS</span>
              </button>}

              {paymentOptions.transfer && <button
                type="button"
                onClick={() => setPaymentMethod('BANK_TRANSFER')}
                className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition-all ${
                  paymentMethod === 'BANK_TRANSFER'
                    ? 'bg-[#2E1A47] text-white border-[#2E1A47] shadow-xs'
                    : 'bg-white text-gray-700 border-gray-200'
                }`}
              >
                <CreditCard className="w-4 h-4 text-purple-400" />
                <span>Transfer</span>
              </button>}
            </div>

            {/* TUNAI / COD INSTRUCTION */}
            {(paymentMethod === 'CASH' || paymentMethod === 'COD') && (
              <div className="pt-2 border-t border-gray-200/60 space-y-2.5">
                <div className="p-3 bg-emerald-50/90 rounded-xl border border-emerald-200 text-xs text-emerald-900 space-y-1">
                  <p className="font-bold flex items-center gap-1.5">
                    <Banknote className="w-4 h-4 text-emerald-600" />
                    <span>Petunjuk Bayar di Tempat (COD / Tunai):</span>
                  </p>
                  <p className="text-[11px] text-emerald-800">
                    {settings?.codInstructions ||
                      'Siapkan uang pas saat pesanan tiba atau serahkan langsung kepada kurir / kasir toko.'}
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-gray-700">
                    Uang yang Disiapkan:
                  </label>
                  <span className="text-[11px] text-gray-500">
                    Total: Rp {total.toLocaleString('id-ID')}
                  </span>
                </div>

                <input
                  type="text"
                  value={amountPaidInput}
                  onChange={(e) => setAmountPaidInput(e.target.value)}
                  placeholder={`Uang Pas (Rp ${total.toLocaleString('id-ID')})`}
                  className="w-full text-xs px-3 py-2 rounded-xl bg-white border border-gray-200 focus:outline-hidden focus:ring-2 focus:ring-[#FF4500]/30 font-semibold"
                />

                {/* Quick Cash Buttons */}
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setAmountPaidInput(String(total))}
                    className="px-2.5 py-1 rounded-lg bg-white border border-gray-200 text-[11px] font-bold text-gray-700 hover:bg-gray-100"
                  >
                    Uang Pas
                  </button>
                  {uniqueQuickCash.map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setAmountPaidInput(String(val))}
                      className="px-2.5 py-1 rounded-lg bg-white border border-gray-200 text-[11px] font-bold text-gray-700 hover:bg-gray-100"
                    >
                      Rp {val.toLocaleString('id-ID')}
                    </button>
                  ))}
                </div>

                {/* Instant Change Indicator */}
                <div className="p-2 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center justify-between text-xs text-emerald-800 font-bold">
                  <span>Kembalian:</span>
                  <span>Rp {change.toLocaleString('id-ID')}</span>
                </div>
              </div>
            )}

            {/* QRIS PAYMENT INSTRUCTION & BARCODE */}
            {paymentMethod === 'QRIS' && (
              <div className="pt-2 border-t border-gray-200/60 space-y-3">
                <div className="p-3.5 bg-blue-50/90 border border-blue-200 rounded-2xl text-xs text-blue-950 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-extrabold text-sm text-[#2E1A47] flex items-center gap-1.5">
                        <QrCode className="w-4 h-4 text-blue-600" />
                        <span>Bayar via QRIS HUMA</span>
                      </p>
                      <p className="text-[11px] text-gray-600 mt-0.5">
                        Scan QRIS menggunakan BCA Mobile, GoPay, OVO, Dana, ShopeePay, atau m-Banking apapun.
                      </p>
                    </div>
                    <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-bold whitespace-nowrap">
                      0 Biaya Admin
                    </span>
                  </div>

                  {/* QRIS Barcode Display (Fail-safe with instant vector fallback) */}
                  <QrisPaymentDisplay
                    qrisImageUrl={settings?.qrisImageUrl}
                    storeName={settings?.storeName || 'HUMA FOOD'}
                    amount={total}
                  />

                  {/* 5 Step by Step Instructions */}
                  <div className="space-y-1.5 bg-white/80 p-3 rounded-xl border border-blue-100 text-[11px] text-gray-700">
                    <p className="font-bold text-blue-900">Langkah Pembayaran QRIS:</p>
                    <ol className="list-decimal list-inside space-y-1">
                      <li>Buka aplikasi m-Banking atau e-Wallet favorit Anda.</li>
                      <li>Scan barcode QRIS HUMA di atas.</li>
                      <li>Pastikan nama merchant penerima tertera <strong>HUMA FOOD</strong>.</li>
                      <li>
                        Masukkan nominal pas:{' '}
                        <strong className="text-[#FF4500]">Rp {total.toLocaleString('id-ID')}</strong>.
                      </li>
                      <li>Simpan bukti transfer dan kirimkan ke WhatsApp Admin setelah membuat pesanan.</li>
                    </ol>
                  </div>

                  <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg text-[10px] text-amber-900 font-medium">
                    ℹ️ Status pesanan akan berstatus <strong>Menunggu Konfirmasi (PENDING)</strong> hingga kasir/staff memverifikasi pembayaran Anda.
                  </div>
                </div>
              </div>
            )}

            {/* BANK TRANSFER INSTRUCTION */}
            {paymentMethod === 'BANK_TRANSFER' && (
              <div className="pt-2 border-t border-gray-200/60 space-y-3">
                <div className="p-3.5 bg-purple-50/90 border border-purple-200 rounded-2xl text-xs text-purple-950 space-y-3">
                  <div>
                    <p className="font-extrabold text-sm text-[#2E1A47] flex items-center gap-1.5">
                      <CreditCard className="w-4 h-4 text-purple-600" />
                      <span>Transfer Bank Manual</span>
                    </p>
                    <p className="text-[11px] text-gray-600 mt-0.5">
                      Transfer ke rekening resmi HUMA FOOD dan kirimkan bukti transfer melalui WhatsApp.
                    </p>
                  </div>

                  {/* Bank Account Details */}
                  <div className="bg-white p-3 rounded-xl border border-purple-100 shadow-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-gray-500 font-semibold">Nama Bank:</span>
                      <span className="font-extrabold text-[#2E1A47]">{settings?.bankName || 'BCA (Bank Central Asia)'}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-gray-500 font-semibold">Nomor Rekening:</span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-extrabold text-sm text-purple-900">
                          {settings?.accountNumber || '085878775527'}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopyAccount(settings?.accountNumber || '085878775527')}
                          className="px-2 py-0.5 bg-purple-100 text-purple-700 hover:bg-purple-200 rounded-md text-[10px] font-bold flex items-center gap-1 transition-colors"
                        >
                          {copiedAccount ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-600" />
                              <span>Tersalin</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Salin</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-gray-500 font-semibold">Atas Nama:</span>
                      <span className="font-bold text-gray-800">{settings?.accountHolder || 'HUMA FOOD'}</span>
                    </div>

                    <div className="flex items-center justify-between border-t pt-2 border-gray-100">
                      <span className="text-[11px] text-gray-500 font-semibold">Nominal Transfer:</span>
                      <span className="font-extrabold text-sm text-[#FF4500]">Rp {total.toLocaleString('id-ID')}</span>
                    </div>
                  </div>

                  {/* Instructions */}
                  <div className="text-[11px] text-gray-700 bg-white/80 p-2.5 rounded-xl border border-purple-100">
                    <p className="font-bold text-purple-900 mb-0.5">Petunjuk Transfer:</p>
                    <p>
                      {settings?.transferInstructions ||
                        'Transfer sesuai total nominal di atas. Simpan bukti transfer untuk dikirim ke WhatsApp Admin.'}
                    </p>
                  </div>

                  <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg text-[10px] text-amber-900 font-medium">
                    ℹ️ Status pesanan akan berstatus <strong>Menunggu Konfirmasi (PENDING)</strong> hingga kasir/staff memverifikasi mutasi pembayaran Anda.
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Ringkasan Total Tagihan */}
          <div className="bg-gray-50/80 p-3.5 rounded-2xl border border-gray-100 space-y-1.5 text-xs">
            <div className="flex items-center justify-between text-gray-600">
              <span>Subtotal ({items.reduce((s, i) => s + i.quantity, 0)} item)</span>
              <span className="font-semibold text-gray-800">Rp {subtotal.toLocaleString('id-ID')}</span>
            </div>

            {discount > 0 && (
              <div className="flex items-center justify-between text-emerald-600">
                <span>Hemat Promo</span>
                <span className="font-bold">-Rp {discount.toLocaleString('id-ID')}</span>
              </div>
            )}

            {serviceType === 'DELIVERY' && (
              <div className="flex items-center justify-between text-gray-600">
                <span>Ongkos Kirim ({selectedDeliveryArea?.name || 'Area'})</span>
                <span className="font-semibold text-gray-800">
                  {deliveryFee === 0 ? 'Gratis' : `+Rp ${deliveryFee.toLocaleString('id-ID')}`}
                </span>
              </div>
            )}

            <div className="pt-2 border-t border-gray-200 flex items-center justify-between font-heading font-extrabold text-base text-[#2E1A47]">
              <span>Total Akhir</span>
              <span className="text-[#FF4500]">Rp {total.toLocaleString('id-ID')}</span>
            </div>
          </div>

          {/* Error message */}
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-rose-700 text-xs font-semibold">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Step 2 Action Buttons */}
          <div className="pt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('INFO')}
              className="py-3 px-3.5 rounded-2xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-xs font-bold flex items-center gap-1 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Ubah Data</span>
            </button>

            <button
              id="btn-submit-order"
              type="submit"
              disabled={isProcessing || hasIncompleteBatchModifiers}
              className={`flex-1 py-3 px-4 flex items-center justify-center gap-2 text-xs sm:text-sm font-bold shadow-lg rounded-2xl transition-all ${
                hasIncompleteBatchModifiers
                  ? 'bg-amber-500 text-white cursor-not-allowed opacity-90 ring-2 ring-amber-300'
                  : 'clay-button-primary disabled:opacity-60 cursor-pointer'
              }`}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Memproses Pesanan...</span>
                </>
              ) : hasIncompleteBatchModifiers ? (
                <>
                  <AlertCircle className="w-4 h-4 text-amber-100 animate-bounce" />
                  <span>Wajib Pilih Bumbu Sebelum Bayar</span>
                </>
              ) : (
                <>
                  <MessageCircle className="w-4 h-4 text-emerald-300" />
                  <span>Pesan Sekarang via WA • Rp {total.toLocaleString('id-ID')}</span>
                </>
              )}
            </button>
          </div>

          <p className="text-[10px] text-gray-400 text-center">
            Pesanan otomatis tersimpan di sistem toko & terhubung ke WhatsApp Admin
          </p>
        </div>
      )}
        </form>
      </Modal>

      {/* Direct Batch Modifier Modal (Bumbu Selector) inside Checkout */}
      {activeBatchCategory && (
        <BatchModifierModal
          isOpen={!!activeBatchCategory}
          onClose={() => setActiveBatchCategory(null)}
          categoryId={activeBatchCategory.category.id}
          categoryName={activeBatchCategory.category.name}
          modifierGroup={activeBatchCategory.group}
          targetQuantity={activeBatchCategory.totalQty}
          isRequired={true}
          minSelections={
            activeBatchCategory.category.batchModifierMinSelection !== undefined
              ? Math.max(1, Number(activeBatchCategory.category.batchModifierMinSelection))
              : (activeBatchCategory.group.minSelection !== undefined ? Math.max(1, Number(activeBatchCategory.group.minSelection)) : 1)
          }
          maxSelections={
            activeBatchCategory.category.batchModifierMaxSelection !== undefined && Number(activeBatchCategory.category.batchModifierMaxSelection) > 0
              ? Number(activeBatchCategory.category.batchModifierMaxSelection)
              : (activeBatchCategory.group.maxSelection !== undefined && Number(activeBatchCategory.group.maxSelection) > 0 ? Number(activeBatchCategory.group.maxSelection) : 2)
          }
          currentSelection={batchSelections[activeBatchCategory.category.id]}
          onSave={(selection) => {
            setBatchSelection(activeBatchCategory.category.id, selection);
            setActiveBatchCategory(null);
            setErrorMessage(null);
          }}
        />
      )}
    </>
  );
};
