import React, { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { Order, StoreSettings } from '../../types';
import { Modal } from '../common/Modal';
import { WhatsAppService } from '../../services/whatsappService';
import { PrinterService } from '../../services/printerService';
import { ReceiptService } from '../../services/receiptService';
import { useAuth } from '../../context/AuthContext';
import {
  CheckCircle2,
  MessageCircle,
  ArrowRight,
  Printer,
  Share2,
  Star,
  ExternalLink,
  Download,
  Loader2,
  Receipt,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface OrderSuccessModalProps {
  order: Order | null;
  settings?: StoreSettings | null;
  isOpen: boolean;
  onClose: () => void;
}

export const OrderSuccessModal: React.FC<OrderSuccessModalProps> = ({
  order,
  settings,
  isOpen,
  onClose,
}) => {
  const { role, adminProfile } = useAuth();
  const isAdminOrStaff = Boolean(role || adminProfile);

  const [isSharingImage, setIsSharingImage] = useState(false);
  const [shareNotice, setShareNotice] = useState<string | null>(null);
  const [showReceiptPreview, setShowReceiptPreview] = useState(false);
  const [receiptImageDataUrl, setReceiptImageDataUrl] = useState<string>('');
  const [isRenderingReceipt, setIsRenderingReceipt] = useState(false);

  useEffect(() => {
    if (isOpen && order) {
      try {
        confetti({
          particleCount: 75,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#FF4500', '#2E1A47', '#E1AD01', '#10B981'],
        });
      } catch {
        // silent
      }

      // Pre-render receipt image
      setIsRenderingReceipt(true);
      ReceiptService.generateReceiptImage(order, settings || undefined)
        .then((url) => {
          setReceiptImageDataUrl(url);
        })
        .finally(() => {
          setIsRenderingReceipt(false);
        });
    }
  }, [isOpen, order, settings]);

  if (!order) return null;

  const storePhone = settings?.whatsapp || WhatsAppService.STORE_PHONE;
  const whatsappUrl = WhatsAppService.getWhatsAppUrl(order, storePhone.replace(/^0/, '62'));
  const googleReviewUrl =
    settings?.googleReviewUrl ||
    settings?.googleMapsUrl ||
    'https://maps.google.com/?q=Perum+Gina+Blok+B+No.+12';

  const handlePrint = () => {
    PrinterService.printViaBrowser(order, settings || undefined);
  };

  const handleShareReceiptImage = async () => {
    setIsSharingImage(true);
    setShareNotice(null);
    try {
      const res = await PrinterService.shareReceiptImageViaWhatsApp(order, settings || undefined);
      if (res.sharedViaNative) {
        setShareNotice('Struk berhasil dibagikan');
      } else if (res.downloaded) {
        setShareNotice('Gambar struk diunduh & WhatsApp terbuka');
      }
      setTimeout(() => setShareNotice(null), 4000);
    } catch (err) {
      console.error('Gagal membagikan struk:', err);
    } finally {
      setIsSharingImage(false);
    }
  };

  const handleDownloadImage = async () => {
    await ReceiptService.downloadReceiptImage(order, settings || undefined);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="max-w-md">
      <div className="text-center py-1 space-y-3">
        {/* Success Icon */}
        <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center shadow-inner">
          <CheckCircle2 className="w-8 h-8 stroke-[2.5]" />
        </div>

        <div>
          <h3 className="font-heading font-extrabold text-xl sm:text-2xl text-[#2E1A47]">
            Pesanan Berhasil Dibuat!
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Terima kasih telah jajan di {settings?.storeName || 'HUMA'}. Pesanan tersimpan di sistem.
          </p>
        </div>

        {/* Order Details Summary Card */}
        <div className="p-3.5 bg-gray-50 rounded-2xl border border-gray-200/80 text-left space-y-2">
          <div className="flex items-center justify-between pb-2 border-b border-gray-200/60 text-xs">
            <span className="text-gray-500 font-medium">Nomor Pesanan:</span>
            <span className="font-mono font-extrabold text-[#2E1A47] text-sm">
              {order.orderNumber}
            </span>
          </div>

          <div className="text-xs space-y-1">
            <div className="flex justify-between text-gray-600">
              <span>Pemesan:</span>
              <span className="font-semibold text-gray-900">{order.customer.name}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Layanan:</span>
              <span className="font-semibold text-gray-900">
                {order.serviceType === 'DELIVERY' ? `Delivery (${order.deliveryAreaName || 'Antar'})` : 'Takeaway'}
              </span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Total Tagihan:</span>
              <span className="font-heading font-extrabold text-[#FF4500] text-sm">
                Rp {order.total.toLocaleString('id-ID')}
              </span>
            </div>
          </div>

          {/* Toggle Receipt Preview */}
          <button
            type="button"
            onClick={() => setShowReceiptPreview(!showReceiptPreview)}
            className="w-full pt-2 border-t border-gray-200/60 flex items-center justify-between text-xs text-gray-600 hover:text-[#2E1A47] font-semibold"
          >
            <span className="flex items-center gap-1.5">
              <Receipt className="w-3.5 h-3.5 text-[#FF4500]" />
              <span>Preview Gambar Struk</span>
            </span>
            {showReceiptPreview ? (
              <ChevronUp className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            )}
          </button>

          {showReceiptPreview && (
            <div className="pt-2 flex flex-col items-center">
              {isRenderingReceipt ? (
                <div className="py-4 text-xs text-gray-400 flex items-center gap-1.5">
                  <Loader2 className="w-4 h-4 animate-spin text-[#FF4500]" />
                  <span>Merender struk...</span>
                </div>
              ) : receiptImageDataUrl ? (
                <div className="space-y-2 w-full flex flex-col items-center">
                  <img
                    src={receiptImageDataUrl}
                    alt="Struk Belanja"
                    className="max-h-60 rounded-xl shadow-md border border-gray-200 object-contain bg-white"
                  />
                  <button
                    type="button"
                    onClick={handleDownloadImage}
                    className="text-[11px] text-gray-600 hover:text-gray-900 font-semibold flex items-center gap-1 py-1"
                  >
                    <Download className="w-3 h-3 text-[#FF4500]" />
                    <span>Unduh Gambar Struk (PNG)</span>
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* Share Notice Banner */}
        {shareNotice && (
          <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-medium">
            {shareNotice}
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-2 pt-1">
          {/* Primary CTA: Send to Store WhatsApp */}
          <a
            id="btn-whatsapp-order-confirm"
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md shadow-emerald-600/25 transition-all"
          >
            <MessageCircle className="w-4 h-4 fill-white" />
            <span>Kirim Konfirmasi ke WhatsApp Toko</span>
            <ArrowRight className="w-4 h-4" />
          </a>

          {/* Share Receipt Image via WhatsApp */}
          <button
            id="btn-share-receipt-image"
            type="button"
            onClick={handleShareReceiptImage}
            disabled={isSharingImage}
            className="w-full py-2.5 px-4 rounded-2xl bg-[#2E1A47] hover:bg-[#3D235E] active:scale-98 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition-all disabled:opacity-50"
          >
            {isSharingImage ? (
              <Loader2 className="w-4 h-4 animate-spin text-[#FF4500]" />
            ) : (
              <Share2 className="w-4 h-4 text-[#FF4500]" />
            )}
            <span>Bagikan Gambar Struk via WhatsApp</span>
          </button>

          {/* Print Thermal Receipt (Role-based: Only rendered if user is Admin / Staff) */}
          {isAdminOrStaff && (
            <button
              id="btn-print-receipt-success"
              type="button"
              onClick={handlePrint}
              className="w-full py-2.5 px-4 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
            >
              <Printer className="w-4 h-4 text-gray-500" />
              <span>Cetak Struk Thermal</span>
            </button>
          )}

          {/* Google Review & Rating CTA (Section D.7 Requirement) */}
          {(settings?.isGoogleReviewEnabled !== false && googleReviewUrl) && (
            <div className="pt-2 border-t border-gray-100">
              <a
                id="btn-google-review"
                href={googleReviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2.5 px-4 rounded-2xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
              >
                <Star className="w-4 h-4 text-amber-500 fill-amber-400" />
                <span>⭐ Beri Review di Google</span>
                <ExternalLink className="w-3 h-3 text-amber-600 ml-0.5" />
              </a>
              <p className="text-[10px] text-gray-400 mt-1">
                Bantu UMKM lokal dengan ulasan bintang 5 Anda!
              </p>
            </div>
          )}

          <button
            onClick={onClose}
            className="w-full py-2 px-4 text-gray-500 hover:text-gray-700 font-medium text-xs transition-colors pt-2"
          >
            Tutup & Kembali Belanja
          </button>
        </div>
      </div>
    </Modal>
  );
};
