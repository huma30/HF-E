import React, { useState, useEffect } from 'react';
import { CartItem, Order, PaymentMethod, ServiceType, SplitPayment, StoreSettings, Customer } from '../../types';
import { Modal } from '../common/Modal';
import { FirestoreService } from '../../services/firestoreService';
import { soundService } from '../../services/audioNotification';
import { PricingEngine } from '../../services/pricingEngine';
import { Banknote, QrCode, CreditCard, Sparkles, CheckCircle, AlertCircle, Loader2, Image as ImageIcon, Award, Gift } from 'lucide-react';

interface PosPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  subtotal: number;
  discount: number;
  total: number;
  cashierName: string;
  settings?: StoreSettings | null;
  onPaymentSuccess: (order: Order) => void;
}

export const PosPaymentModal: React.FC<PosPaymentModalProps> = ({
  isOpen,
  onClose,
  items,
  subtotal,
  discount,
  total,
  cashierName,
  settings,
  onPaymentSuccess,
}) => {
  const [customerName, setCustomerName] = useState('Pelanggan Kasir');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerMember, setCustomerMember] = useState<Customer | null>(null);
  const [isSearchingMember, setIsSearchingMember] = useState(false);

  // Loyalty Point Redemption at POS
  const [isRedeemingPoints, setIsRedeemingPoints] = useState(false);
  const [pointsToRedeem, setPointsToRedeem] = useState<number>(0);

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [serviceType, setServiceType] = useState<ServiceType>('DINE_IN');

  const pointRate = settings?.pointsRedeemRate || 100;
  const pointsDiscount = isRedeemingPoints ? pointsToRedeem * pointRate : 0;
  const payableTotal = Math.max(0, total - pointsDiscount);

  const [amountPaidInput, setAmountPaidInput] = useState<string>(String(payableTotal));

  // Split payment fields
  const [isSplitMode, setIsSplitMode] = useState(false);
  const [splitCash, setSplitCash] = useState<number>(Math.round(payableTotal / 2));
  const [splitQris, setSplitQris] = useState<number>(payableTotal - Math.round(payableTotal / 2));

  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Recalculate default cash and split when payableTotal changes
  useEffect(() => {
    setAmountPaidInput(String(payableTotal));
    setSplitCash(Math.round(payableTotal / 2));
    setSplitQris(payableTotal - Math.round(payableTotal / 2));
  }, [payableTotal]);

  // Customer phone lookup
  const handlePhoneChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCustomerPhone(val);
    const clean = val.replace(/[^0-9]/g, '');

    if (clean.length >= 8) {
      setIsSearchingMember(true);
      try {
        const found = await FirestoreService.findCustomerByWhatsapp(clean);
        if (found) {
          setCustomerMember(found);
          if (customerName === 'Pelanggan Kasir') {
            setCustomerName(found.name);
          }
          if (found.pointsBalance > 0) {
            // suggest max possible points for this order
            const maxPointsForBill = Math.floor(total / pointRate);
            setPointsToRedeem(Math.min(found.pointsBalance, maxPointsForBill));
          }
        } else {
          setCustomerMember(null);
          setIsRedeemingPoints(false);
        }
      } catch (err) {
        console.warn('Member lookup err:', err);
      } finally {
        setIsSearchingMember(false);
      }
    } else {
      setCustomerMember(null);
      setIsRedeemingPoints(false);
    }
  };

  if (!isOpen) return null;

  const quickCashValues = [10000, 20000, 50000, 100000];

  const parsedCash = parseInt(amountPaidInput.replace(/\D/g, ''), 10) || 0;
  const change = Math.max(0, parsedCash - payableTotal);

  const handleProcessPayment = async () => {
    if (isProcessing) return;
    setErrorMsg(null);

    // Validation
    if (payableTotal > 0) {
      if (isSplitMode) {
        if (splitCash + splitQris !== payableTotal) {
          setErrorMsg(
            `Jumlah split payment (Rp ${(splitCash + splitQris).toLocaleString('id-ID')}) harus sama persis dengan total tagihan (Rp ${payableTotal.toLocaleString('id-ID')}).`
          );
          return;
        }
      } else if (paymentMethod === 'CASH') {
        const cashCheck = PricingEngine.validateCashPayment(payableTotal, parsedCash);
        if (!cashCheck.isValid) {
          setErrorMsg(cashCheck.message || 'Nominal uang tunai kurang.');
          return;
        }
      }
    }

    try {
      setIsProcessing(true);

      const splitPayments: SplitPayment[] | undefined = isSplitMode
        ? [
            { method: 'CASH', amount: splitCash },
            { method: 'QRIS', amount: splitQris },
          ]
        : undefined;

      const totalDiscount = discount + pointsDiscount;

      const orderPayload: Omit<Order, 'id' | 'orderNumber' | 'createdAt'> = {
        source: 'POS',
        status: 'COMPLETED', // POS in-store orders are directly completed upon payment
        customer: {
          name: customerName.trim() || 'Pelanggan Kasir',
          whatsapp: customerPhone.trim() || '-',
        },
        serviceType,
        items,
        subtotal,
        discount: totalDiscount,
        deliveryFee: 0,
        total: payableTotal,
        paymentMethod: payableTotal === 0 ? 'CASH' : isSplitMode ? 'MULTI' : paymentMethod,
        amountPaid: payableTotal === 0 ? 0 : isSplitMode ? payableTotal : paymentMethod === 'CASH' ? parsedCash : payableTotal,
        change: payableTotal === 0 ? 0 : isSplitMode ? 0 : paymentMethod === 'CASH' ? change : 0,
        cashierName,
      };

      if (isSplitMode && splitPayments) {
        orderPayload.splitPayments = splitPayments;
      }

      const order = await FirestoreService.createOrder(orderPayload);

      // If points were redeemed, record redemption
      if (isRedeemingPoints && pointsToRedeem > 0 && customerMember) {
        try {
          await FirestoreService.redeemPointsDiscount({
            customerId: customerMember.id,
            pointsToRedeem,
            discountValue: pointsDiscount,
            adminId: 'CASHIER_POS',
            adminName: cashierName,
            orderId: order.id,
          });
        } catch (redeemErr) {
          console.error('[HUMA POS] Error recording point redemption:', redeemErr);
        }
      }

      soundService.playSuccessRegister();
      onPaymentSuccess(order);
      onClose();
    } catch (err: any) {
      console.error('POS Payment error', err);
      setErrorMsg(err?.message || 'Gagal memproses transaksi kasir.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => !isProcessing && onClose()}
      title="Proses Pembayaran Kasir"
      subtitle={`Total Tagihan: Rp ${total.toLocaleString('id-ID')}${
        pointsDiscount > 0 ? ` → Net: Rp ${payableTotal.toLocaleString('id-ID')}` : ''
      }`}
      maxWidth="max-w-md"
    >
      <div className="space-y-4 max-h-[80vh] overflow-y-auto pr-1">
        {/* Customer & WhatsApp Loyalty Lookup */}
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Nama Pelanggan:
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:outline-hidden"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Tipe Layanan:
              </label>
              <select
                value={serviceType}
                onChange={(e) => setServiceType(e.target.value as ServiceType)}
                className="w-full text-xs px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:outline-hidden font-semibold text-gray-800"
              >
                <option value="DINE_IN">Makan di Tempat</option>
                <option value="TAKEAWAY">Bawa Pulang (Takeaway)</option>
                <option value="DELIVERY">Delivery Kurir</option>
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-gray-700">
                No. WhatsApp Pelanggan (Loyalitas Poin):
              </label>
              {isSearchingMember && (
                <span className="text-[10px] text-gray-400 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin text-[#FF4500]" />
                  Mencari...
                </span>
              )}
            </div>
            <input
              type="tel"
              placeholder="0812... (opsional untuk catat poin)"
              value={customerPhone}
              onChange={handlePhoneChange}
              className="w-full text-xs px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:outline-hidden"
            />
          </div>

          {/* Member Card & Point Redemption Section */}
          {customerMember && (
            <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-amber-600" />
                  <span className="text-xs font-bold text-amber-900">
                    Member: {customerMember.name}
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-200 text-amber-900">
                  {customerMember.pointsBalance} Poin
                </span>
              </div>

              {settings?.isPointsEnabled !== false && customerMember.pointsBalance > 0 && (
                <div className="pt-2 border-t border-amber-200/60 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-amber-900 flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isRedeemingPoints}
                        onChange={(e) => setIsRedeemingPoints(e.target.checked)}
                        className="w-3.5 h-3.5 text-[#FF4500] rounded-sm"
                      />
                      <span>Tukarkan Poin Diskon</span>
                    </label>
                    {isRedeemingPoints && (
                      <span className="text-xs font-black text-emerald-700">
                        -Rp {pointsDiscount.toLocaleString('id-ID')}
                      </span>
                    )}
                  </div>

                  {isRedeemingPoints && (
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="number"
                        min={1}
                        max={Math.min(customerMember.pointsBalance, Math.ceil(total / pointRate))}
                        value={pointsToRedeem}
                        onChange={(e) =>
                          setPointsToRedeem(
                            Math.min(
                              customerMember.pointsBalance,
                              Math.max(1, Number(e.target.value) || 1)
                            )
                          )
                        }
                        className="w-24 px-2 py-1 text-xs rounded-lg bg-white border border-amber-300 font-bold text-amber-900"
                      />
                      <span className="text-[11px] text-amber-800">
                        poin (1 poin = Rp {pointRate})
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Payment mode toggle: Standard vs Split */}
        <div className="flex items-center justify-between p-2.5 bg-gray-50 rounded-xl border border-gray-100">
          <span className="text-xs font-bold text-gray-800">Split Payment (Multi-Bayar)?</span>
          <button
            type="button"
            onClick={() => setIsSplitMode(!isSplitMode)}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
              isSplitMode ? 'bg-[#FF4500] text-white shadow-xs' : 'bg-gray-200 text-gray-700'
            }`}
          >
            {isSplitMode ? 'Aktif' : 'Nonaktif'}
          </button>
        </div>

        {!isSplitMode ? (
          <>
            {/* Payment Method Selector */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                Pilih Metode Pembayaran:
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('CASH')}
                  className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition-all ${
                    paymentMethod === 'CASH'
                      ? 'bg-[#2E1A47] text-white border-[#2E1A47] shadow-xs'
                      : 'bg-white text-gray-700 border-gray-200'
                  }`}
                >
                  <Banknote className="w-4 h-4 text-emerald-400" />
                  <span>Tunai (Cash)</span>
                </button>

                <button
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
                </button>

                <button
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
                </button>
              </div>
            </div>

            {/* Quick Cash Options (if CASH) */}
            {paymentMethod === 'CASH' && (
              <div className="space-y-2 bg-emerald-50/50 p-3.5 rounded-2xl border border-emerald-100">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-gray-800">
                    Uang Diterima (Cash):
                  </label>
                  <span className="font-heading font-extrabold text-xs text-[#2E1A47]">
                    Tagihan: Rp {total.toLocaleString('id-ID')}
                  </span>
                </div>

                <input
                  type="text"
                  value={amountPaidInput}
                  onChange={(e) => setAmountPaidInput(e.target.value)}
                  className="w-full text-base font-bold px-3.5 py-2 rounded-xl bg-white border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />

                {/* Quick cash pills */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => setAmountPaidInput(String(total))}
                    className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-bold text-xs shadow-xs"
                  >
                    Uang Pas
                  </button>
                  {quickCashValues.map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setAmountPaidInput(String(val))}
                      className="px-2.5 py-1 rounded-lg bg-white border border-gray-200 text-gray-800 font-bold text-xs hover:bg-gray-100"
                    >
                      Rp {val.toLocaleString('id-ID')}
                    </button>
                  ))}
                </div>

                {/* Change calculation */}
                <div className="pt-2 border-t border-emerald-200/60 flex items-center justify-between text-xs font-extrabold text-emerald-900">
                  <span>KEMBALIAN:</span>
                  <span className="text-sm font-heading font-extrabold text-emerald-700">
                    Rp {change.toLocaleString('id-ID')}
                  </span>
                </div>
              </div>
            )}

            {/* QRIS Display for Cashier / Customer */}
            {paymentMethod === 'QRIS' && (
              <div className="space-y-2 bg-blue-50/70 p-3.5 rounded-2xl border border-blue-200 text-center">
                <div className="flex items-center justify-between text-xs font-bold text-blue-900 mb-1">
                  <span>Pembayaran QRIS Statis / Dinamis</span>
                  <span className="text-[#FF4500]">Rp {total.toLocaleString('id-ID')}</span>
                </div>
                {settings?.qrisImageUrl ? (
                  <div className="space-y-2">
                    <div className="p-3 bg-white rounded-2xl border border-blue-200 inline-block shadow-sm">
                      <img
                        src={settings.qrisImageUrl}
                        alt="QRIS Barcode HUMA"
                        className="w-48 h-48 sm:w-56 sm:h-56 object-contain mx-auto"
                      />
                    </div>
                    <p className="text-[11px] text-blue-800 font-medium">
                      Tunjukkan barcode ini kepada pelanggan untuk discan via mobile banking / e-wallet.
                    </p>
                  </div>
                ) : (
                  <div className="p-4 bg-white rounded-xl border border-dashed border-blue-300 text-xs text-blue-700 space-y-1">
                    <p className="font-bold">Gambar Barcode QRIS Belum Diunggah</p>
                    <p className="text-[11px] text-gray-500">
                      Unggah barcode QRIS toko Anda di menu <strong>Admin &gt; Pengaturan &gt; Barcode QRIS</strong>.
                    </p>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          /* Split payment inputs */
          <div className="space-y-3 bg-purple-50/60 p-3.5 rounded-2xl border border-purple-100 text-xs">
            <h5 className="font-bold text-purple-900">Rincian Multi-Pembayaran:</h5>
            <div>
              <label className="block font-semibold text-gray-700 mb-1">Nominal Tunai (Cash):</label>
              <input
                type="number"
                value={splitCash}
                onChange={(e) => setSplitCash(Number(e.target.value) || 0)}
                className="w-full p-2 bg-white rounded-xl border border-gray-200 font-bold"
              />
            </div>
            <div>
              <label className="block font-semibold text-gray-700 mb-1">Nominal Non-Tunai (QRIS):</label>
              <input
                type="number"
                value={splitQris}
                onChange={(e) => setSplitQris(Number(e.target.value) || 0)}
                className="w-full p-2 bg-white rounded-xl border border-gray-200 font-bold"
              />
            </div>

            {/* Split QRIS Image Preview if splitQris > 0 */}
            {splitQris > 0 && settings?.qrisImageUrl && (
              <div className="p-2.5 bg-white rounded-xl border border-purple-200 text-center space-y-1">
                <span className="text-[11px] font-bold text-purple-900 block">
                  Scan QRIS: Rp {splitQris.toLocaleString('id-ID')}
                </span>
                <img
                  src={settings.qrisImageUrl}
                  alt="QRIS Split Payment"
                  className="w-36 h-36 object-contain mx-auto border border-gray-100 rounded-lg p-1"
                />
              </div>
            )}
            <div className="flex justify-between font-bold text-gray-800 pt-1 border-t border-purple-200">
              <span>Total Diinput:</span>
              <span className={splitCash + splitQris === total ? 'text-emerald-600' : 'text-rose-600'}>
                Rp {(splitCash + splitQris).toLocaleString('id-ID')} / Rp {total.toLocaleString('id-ID')}
              </span>
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-rose-700 text-xs font-semibold">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Process Button */}
        <div className="pt-2 border-t border-gray-100">
          <button
            id="btn-confirm-pos-payment"
            onClick={handleProcessPayment}
            disabled={isProcessing}
            className="w-full clay-button-primary py-3 px-4 flex items-center justify-center gap-2 text-sm font-bold shadow-lg disabled:opacity-60"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Menyelesaikan Transaksi...</span>
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                <span>Bayar & Cetak Struk • Rp {total.toLocaleString('id-ID')}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
};
