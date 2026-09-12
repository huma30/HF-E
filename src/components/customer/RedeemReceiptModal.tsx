import React, { useState } from 'react';
import { Modal } from '../common/Modal';
import { PointRedemption, Customer, StoreSettings } from '../../types';
import { ReceiptService } from '../../services/receiptService';
import { WhatsAppService } from '../../services/whatsappService';
import { 
  Printer, 
  Share2, 
  Check, 
  Copy, 
  Award, 
  Gift, 
  Sparkles, 
  Calendar, 
  Phone, 
  User, 
  CheckCircle2,
  ExternalLink
} from 'lucide-react';

interface RedeemReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  redemption: PointRedemption | null;
  customer: Customer | null;
  settings: StoreSettings | null;
}

export const RedeemReceiptModal: React.FC<RedeemReceiptModalProps> = ({
  isOpen,
  onClose,
  redemption,
  customer,
  settings,
}) => {
  const [copied, setCopied] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

  if (!isOpen || !redemption) return null;

  const storeName = settings?.storeName || 'HUMA FOOD';
  const tagline = settings?.tagline || 'Jajan dekat rasa bersahabat';
  const wa = settings?.whatsapp || WhatsAppService.STORE_PHONE;
  const logoUrl = ReceiptService.getEffectiveReceiptLogo(settings || undefined);
  const claimCode = redemption.redemptionCode || `RDM-${redemption.id.slice(-6).toUpperCase()}`;
  const formattedDate = new Date(redemption.createdAt).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const remainingPoints = redemption.pointsBalanceAfter !== undefined
    ? redemption.pointsBalanceAfter
    : (customer?.pointsBalance ?? 0);

  const formattedText = ReceiptService.formatTextRedeemReceipt(redemption, customer, settings || undefined);

  const handlePrint = () => {
    setIsPrinting(true);
    ReceiptService.printRedeemReceiptViaBrowser(redemption, customer, settings || undefined);
    setTimeout(() => setIsPrinting(false), 1200);
  };

  const handleCopyText = async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(formattedText);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch {
      // Fallback
    }
  };

  const handleShareWhatsApp = () => {
    const message = [
      `*STRUK BUKTI PENUKARAN POIN - ${storeName}*`,
      `==================================`,
      `*KODE KLAIM: ${claimCode}*`,
      `Waktu: ${formattedDate}`,
      `Status: BERHASIL DITUKARKAN (VALID)`,
      `----------------------------------`,
      `Pelanggan : ${redemption.customerName || customer?.name || 'Pelanggan HUMA'}`,
      `WhatsApp  : ${redemption.customerPhone || customer?.whatsapp || '-'}`,
      `----------------------------------`,
      `*Hadiah:* ${redemption.rewardName}`,
      `*Poin Ditukar:* -${redemption.pointsSpent} Poin`,
      `*Sisa Saldo:* ${remainingPoints} Poin`,
      `----------------------------------`,
      `Halo Admin ${storeName}, saya telah menukarkan poin untuk hadiah ini. Mohon proses klaim reward saya ya. Terima kasih! 🙏`,
    ].join('\n');

    const cleanStorePhone = wa.replace(/^0/, '62').replace(/\D/g, '');
    const url = `https://wa.me/${cleanStorePhone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleNativeShare = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `Struk Klaim Hadiah ${claimCode} - ${storeName}`,
          text: formattedText,
        });
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          handleShareWhatsApp();
        }
      }
    } else {
      handleShareWhatsApp();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Struk Penukaran Poin (Redeem)"
      maxWidth="max-w-md"
    >
      <div className="space-y-4">
        {/* Success Alert Banner */}
        <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-200 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-xs">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-heading font-extrabold text-xs text-emerald-900">
              Penukaran Poin Berhasil!
            </h4>
            <p className="text-[11px] text-emerald-700 leading-snug">
              Saldo poin Anda telah terpotong secara instan. Simpan atau bagikan struk ini sebagai bukti resmi.
            </p>
          </div>
        </div>

        {/* Visual Receipt Paper Layout */}
        <div 
          id="visual-redeem-receipt"
          className="bg-white rounded-2xl border-2 border-dashed border-gray-300 p-4 font-mono text-xs text-gray-800 shadow-xs relative overflow-hidden space-y-3"
        >
          {/* Top Notch Decorative line */}
          <div className="text-center space-y-1 pb-2 border-b border-dashed border-gray-200">
            {logoUrl && (
              <img
                src={logoUrl}
                alt={storeName}
                className="max-h-11 max-w-[130px] object-contain mx-auto mb-1"
              />
            )}
            <h3 className="font-heading font-black text-sm text-[#2E1A47] tracking-wide">
              {storeName}
            </h3>
            <p className="text-[10px] text-gray-500 italic">"{tagline}"</p>
            <p className="text-[10px] text-gray-400">WA: {wa}</p>
          </div>

          {/* Claim Code Badge */}
          <div className="text-center py-2 bg-amber-50 rounded-xl border border-amber-200">
            <span className="text-[10px] uppercase font-bold text-amber-800 tracking-wider block">
              KODE KLAIM RESMI
            </span>
            <span className="font-heading font-black text-lg text-amber-700 tracking-widest block mt-0.5">
              {claimCode}
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 font-bold mt-1 bg-emerald-100/70 px-2 py-0.5 rounded-full">
              <Check className="w-3 h-3" />
              <span>Status: VALID / TERVERIFIKASI</span>
            </span>
          </div>

          {/* Key metadata */}
          <div className="space-y-1.5 text-[11px] py-1 border-b border-dashed border-gray-200">
            <div className="flex justify-between items-center">
              <span className="text-gray-500">Waktu:</span>
              <span className="font-semibold">{formattedDate}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500">Pelanggan:</span>
              <span className="font-bold text-[#2E1A47]">{redemption.customerName || customer?.name || 'Pelanggan HUMA'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500">No. WhatsApp:</span>
              <span className="font-semibold">{redemption.customerPhone || customer?.whatsapp || '-'}</span>
            </div>
          </div>

          {/* Reward Details */}
          <div className="space-y-1.5 text-[11px] py-1 border-b border-dashed border-gray-200">
            <div className="flex justify-between items-start gap-2">
              <span className="text-gray-500 shrink-0">Item Hadiah:</span>
              <span className="font-extrabold text-[#2E1A47] text-right">{redemption.rewardName}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500">Kategori:</span>
              <span className="font-semibold text-gray-700">
                {redemption.type === 'DISCOUNT' ? 'Voucher Potongan' : 'Menu Spesial Gratis'}
              </span>
            </div>
            {redemption.discountAmount && (
              <div className="flex justify-between items-center text-emerald-600 font-bold">
                <span>Nilai Diskon:</span>
                <span>Rp {redemption.discountAmount.toLocaleString('id-ID')}</span>
              </div>
            )}
          </div>

          {/* Points Movement */}
          <div className="space-y-1.5 text-[11px] py-1">
            <div className="flex justify-between items-center">
              <span className="text-gray-500">Poin Ditukarkan:</span>
              <span className="font-extrabold text-amber-600">-{redemption.pointsSpent} Poin</span>
            </div>
            <div className="flex justify-between items-center bg-gray-50 p-2 rounded-lg border border-gray-200">
              <span className="text-gray-600 font-bold">Sisa Saldo Poin:</span>
              <span className="font-heading font-black text-sm text-[#2E1A47]">
                {remainingPoints} Poin
              </span>
            </div>
          </div>

          {/* Claim Instructions */}
          <div className="pt-2 border-t border-dashed border-gray-200 text-[10px] text-gray-500 leading-relaxed bg-gray-50/50 p-2 rounded-lg">
            <p className="font-bold text-gray-700">Cara Klaim Hadiah:</p>
            <p>1. Tunjukkan struk atau sebutkan kode klaim ke kasir outlet HUMA.</p>
            <p>2. Atau klik tombol "Bagikan ke WhatsApp" untuk mengirim bukti langsung ke admin saat memesan delivery.</p>
          </div>
        </div>

        {/* Action Buttons: Print, Share to WA, Copy */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            onClick={handlePrint}
            disabled={isPrinting}
            className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-gray-800 hover:bg-gray-900 active:scale-95 text-white font-bold text-xs shadow-xs transition-all"
          >
            <Printer className="w-4 h-4 text-gray-300" />
            <span>{isPrinting ? 'Mencetak...' : 'Cetak Struk'}</span>
          </button>

          <button
            type="button"
            onClick={handleShareWhatsApp}
            className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs shadow-xs transition-all"
          >
            <Share2 className="w-4 h-4" />
            <span>Bagikan ke WA</span>
          </button>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleCopyText}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold text-xs transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-emerald-700">Teks Tersalin!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-gray-500" />
                <span>Salin Teks Struk</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs transition-colors"
          >
            Selesai
          </button>
        </div>
      </div>
    </Modal>
  );
};
