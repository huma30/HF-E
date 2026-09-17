import React, { useState, useEffect } from 'react';
import { StoreSettings } from '../../types';
import { FirestoreService } from '../../services/firestoreService';
import { StorageService } from '../../services/storageService';
import { errorService } from '../../services/errorService';
import { StoreStatusBadge } from '../common/StoreStatusBadge';
import { ImageUploadField } from '../common/ImageUploadField';
import {
  Save,
  Store,
  Clock,
  MapPin,
  Phone,
  Printer,
  QrCode,
  Award,
  Star,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Scissors,
  Loader2,
  Gift,
  CreditCard,
  Banknote,
  PanelBottom,
  Receipt,
} from 'lucide-react';

interface AdminSettingsProps {
  settings: StoreSettings | null;
  onRefresh: () => void;
}

export const AdminSettings: React.FC<AdminSettingsProps> = ({ settings, onRefresh }) => {
  // Store profile
  const [storeName, setStoreName] = useState(settings?.storeName || 'HUMA FOOD');
  const [tagline, setTagline] = useState(settings?.tagline || 'Jajan dekat rasa bersahabat');
  const [address, setAddress] = useState(settings?.address || 'Perum Gina Blok B No. 12');
  const [whatsapp, setWhatsapp] = useState(settings?.whatsapp || '085878775527');
  const [logoUrl, setLogoUrl] = useState(settings?.logoUrl || '');
  const [receiptLogoUrl, setReceiptLogoUrl] = useState(settings?.receiptLogoUrl || '');
  const [qrisImageUrl, setQrisImageUrl] = useState(settings?.qrisImageUrl || '');

  // Payment Methods Configuration (COD, QRIS, Bank Transfer)
  const [isCodEnabled, setIsCodEnabled] = useState(settings?.isCodEnabled !== false);
  const [codInstructions, setCodInstructions] = useState(
    settings?.codInstructions || 'Siapkan uang pas saat pesanan diantar oleh kurir'
  );
  const [isQrisEnabled, setIsQrisEnabled] = useState(settings?.isQrisEnabled !== false);
  const [isTransferEnabled, setIsTransferEnabled] = useState(settings?.isTransferEnabled !== false);
  const [bankName, setBankName] = useState(settings?.bankName || 'BCA');
  const [accountNumber, setAccountNumber] = useState(settings?.accountNumber || '');
  const [accountHolder, setAccountHolder] = useState(settings?.accountHolder || '');
  const [transferInstructions, setTransferInstructions] = useState(
    settings?.transferInstructions || 'Sertakan nomor pesanan pada berita transfer dan simpan bukti transfer'
  );

  // Operating Hours & Manual Override
  const [manualStatus, setManualStatus] = useState<'AUTO' | 'FORCE_OPEN' | 'FORCE_CLOSED'>(
    (settings?.manualStatusOverride as 'AUTO' | 'FORCE_OPEN' | 'FORCE_CLOSED') || 'AUTO'
  );
  const [openTime, setOpenTime] = useState(settings?.operatingHours?.open || '10:00');
  const [closeTime, setCloseTime] = useState(settings?.operatingHours?.close || '22:00');

  // Google Review & GoFood
  const [googleMapsUrl, setGoogleMapsUrl] = useState(settings?.googleMapsUrl || '');
  const [isGoogleReviewEnabled, setIsGoogleReviewEnabled] = useState(
    settings?.isGoogleReviewEnabled !== false
  );
  const [googleReviewUrl, setGoogleReviewUrl] = useState(
    settings?.googleReviewUrl || 'https://search.google.com/local/writereview?placeid=ChIJHUMAFOOD'
  );
  const [isGoFoodEnabled, setIsGoFoodEnabled] = useState(settings?.isGoFoodEnabled !== false);
  const [goFoodUrl, setGoFoodUrl] = useState(settings?.goFoodUrl || 'https://gofood.link/u/humafood');
  const [goFoodLabel, setGoFoodLabel] = useState(settings?.goFoodLabel || 'Pesan via GoFood');

  // Printer & Hardware Settings
  const [paperWidth, setPaperWidth] = useState<'58mm' | '80mm'>(settings?.paperWidth || '58mm');
  const [autoCutEnabled, setAutoCutEnabled] = useState(settings?.autoCutEnabled !== false);

  // Loyalty Point System Settings & Kotak Hadiah Feature Flag
  const [isPointsEnabled, setIsPointsEnabled] = useState(settings?.isPointsEnabled !== false);
  const [isGiftBoxEnabled, setIsGiftBoxEnabled] = useState(settings?.isGiftBoxEnabled !== false);
  const [pointsPerRupiah, setPointsPerRupiah] = useState<number>(settings?.pointsPerRupiah || 10000);
  const [minOrderForPoints, setMinOrderForPoints] = useState<number>(settings?.minOrderForPoints || 10000);
  const [pointsRedeemRate, setPointsRedeemRate] = useState<number>(settings?.pointsRedeemRate || 100);
  const [pointsRounding, setPointsRounding] = useState<'FLOOR' | 'ROUND'>(
    settings?.pointsRounding || 'FLOOR'
  );
  const [maxPointsPerOrder, setMaxPointsPerOrder] = useState<number>(settings?.maxPointsPerOrder || 100);

  // Footer Customization Settings
  const [footerDescription, setFooterDescription] = useState(
    settings?.footerDescription ||
      'Pilihan kuliner lokal terpercaya untuk warga Perum Gina dan sekitarnya. Seblak otentik rempah kencur, mie jebew pedas gurih, baso aci, dan aneka minuman segar.'
  );
  const [footerDeliveryNote, setFooterDeliveryNote] = useState(
    settings?.footerDeliveryNote || 'Menerima pesanan antar ke kompleks Perum Gina dan sekitarnya.'
  );
  const [footerBottomNote, setFooterBottomNote] = useState(
    settings?.footerBottomNote || 'Dibuat dengan penuh rasa bersahabat untuk seluruh warga.'
  );
  const [footerCopyright, setFooterCopyright] = useState(
    settings?.footerCopyright || '© 2026 HUMA — All Rights Reserved.'
  );
  const [isFooterEnabled, setIsFooterEnabled] = useState(settings?.isFooterEnabled !== false);
  const [footerShowPlatforms, setFooterShowPlatforms] = useState(settings?.footerShowPlatforms !== false);

  // Struk Thermal Footer Customization Settings
  const [receiptFooterMessage, setReceiptFooterMessage] = useState(
    settings?.receiptFooterMessage || 'Terima kasih atas pesanan Anda!'
  );
  const [receiptFooterNote, setReceiptFooterNote] = useState(
    settings?.receiptFooterNote || 'Simpan struk ini sebagai bukti transaksi sah'
  );
  const [receiptFooterShowTagline, setReceiptFooterShowTagline] = useState(
    settings?.receiptFooterShowTagline !== false
  );
  const [receiptFooterCustomText, setReceiptFooterCustomText] = useState(
    settings?.receiptFooterCustomText || ''
  );
  const [receiptFooterShowGoogleReview, setReceiptFooterShowGoogleReview] = useState(
    settings?.receiptFooterShowGoogleReview === true
  );

  // Sync state with incoming props whenever settings changes or loads from Firestore
  useEffect(() => {
    if (settings) {
      setStoreName(settings.storeName || 'HUMA FOOD');
      setTagline(settings.tagline || 'Jajan dekat rasa bersahabat');
      setAddress(settings.address || 'Perum Gina Blok B No. 12');
      setWhatsapp(settings.whatsapp || '085878775527');
      setLogoUrl(settings.logoUrl || '');
      setReceiptLogoUrl(settings.receiptLogoUrl || '');
      setQrisImageUrl(settings.qrisImageUrl || '');
      setManualStatus((settings.manualStatusOverride as 'AUTO' | 'FORCE_OPEN' | 'FORCE_CLOSED') || 'AUTO');
      setOpenTime(settings.operatingHours?.open || '10:00');
      setCloseTime(settings.operatingHours?.close || '22:00');
      setGoogleMapsUrl(settings.googleMapsUrl || '');
      setIsGoogleReviewEnabled(settings.isGoogleReviewEnabled !== false);
      setGoogleReviewUrl(settings.googleReviewUrl || 'https://search.google.com/local/writereview?placeid=ChIJHUMAFOOD');
      setIsGoFoodEnabled(settings.isGoFoodEnabled !== false);
      setGoFoodUrl(settings.goFoodUrl || 'https://gofood.link/u/humafood');
      setGoFoodLabel(settings.goFoodLabel || 'Pesan via GoFood');
      setPaperWidth(settings.paperWidth || '58mm');
      setAutoCutEnabled(settings.autoCutEnabled !== false);
      setIsPointsEnabled(settings.isPointsEnabled !== false);
      setIsGiftBoxEnabled(settings.isGiftBoxEnabled !== false);
      setPointsPerRupiah(settings.pointsPerRupiah || 10000);
      setMinOrderForPoints(settings.minOrderForPoints || 10000);
      setPointsRedeemRate(settings.pointsRedeemRate || 100);
      setPointsRounding(settings.pointsRounding || 'FLOOR');
      setMaxPointsPerOrder(settings.maxPointsPerOrder || 100);
      setIsCodEnabled(settings.isCodEnabled !== false);
      setCodInstructions(settings.codInstructions || 'Siapkan uang pas saat pesanan diantar oleh kurir');
      setIsQrisEnabled(settings.isQrisEnabled !== false);
      setIsTransferEnabled(settings.isTransferEnabled !== false);
      setBankName(settings.bankName || 'BCA');
      setAccountNumber(settings.accountNumber || '');
      setAccountHolder(settings.accountHolder || '');
      setTransferInstructions(
        settings.transferInstructions || 'Sertakan nomor pesanan pada berita transfer dan simpan bukti transfer'
      );
      setFooterDescription(
        settings.footerDescription ||
          'Pilihan kuliner lokal terpercaya untuk warga Perum Gina dan sekitarnya. Seblak otentik rempah kencur, mie jebew pedas gurih, baso aci, dan aneka minuman segar.'
      );
      setFooterDeliveryNote(
        settings.footerDeliveryNote || 'Menerima pesanan antar ke kompleks Perum Gina dan sekitarnya.'
      );
      setFooterBottomNote(
        settings.footerBottomNote || 'Dibuat dengan penuh rasa bersahabat untuk seluruh warga.'
      );
      setFooterCopyright(settings.footerCopyright || '© 2026 HUMA — All Rights Reserved.');
      setIsFooterEnabled(settings.isFooterEnabled !== false);
      setFooterShowPlatforms(settings.footerShowPlatforms !== false);
      setReceiptFooterMessage(settings.receiptFooterMessage !== undefined ? settings.receiptFooterMessage : 'Terima kasih atas pesanan Anda!');
      setReceiptFooterNote(settings.receiptFooterNote !== undefined ? settings.receiptFooterNote : 'Simpan struk ini sebagai bukti transaksi sah');
      setReceiptFooterShowTagline(settings.receiptFooterShowTagline !== false);
      setReceiptFooterCustomText(settings.receiptFooterCustomText || '');
      setReceiptFooterShowGoogleReview(settings.receiptFooterShowGoogleReview === true);
    }
  }, [settings]);

  const [isSaving, setIsSaving] = useState(false);
  const [saveStage, setSaveStage] = useState('');
  const [successMsg, setSuccessMsg] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveStage('Menyiapkan gambar...');
    setSuccessMsg(false);
    setErrorMsg(null);

    try {
      // Parallel image uploads with client-side WebP compression
      setSaveStage('Mengompresi & mengunggah gambar WebP...');
      const [finalLogoUrl, finalReceiptLogoUrl, finalQrisImageUrl] = await Promise.all([
        logoUrl.trim().startsWith('data:')
          ? StorageService.uploadDataUrl(logoUrl.trim(), 'settings', 'store_logo.webp')
          : Promise.resolve(logoUrl.trim()),
        receiptLogoUrl.trim().startsWith('data:')
          ? StorageService.uploadDataUrl(receiptLogoUrl.trim(), 'settings', 'receipt_logo.webp')
          : Promise.resolve(receiptLogoUrl.trim()),
        qrisImageUrl.trim().startsWith('data:')
          ? StorageService.uploadDataUrl(qrisImageUrl.trim(), 'settings', 'qris_barcode.webp')
          : Promise.resolve(qrisImageUrl.trim()),
      ]);

      setLogoUrl(finalLogoUrl);
      setReceiptLogoUrl(finalReceiptLogoUrl);
      setQrisImageUrl(finalQrisImageUrl);

      setSaveStage('Menyimpan pengaturan ke database...');
      const settingsPayload = StorageService.cleanPayload({
        storeName: storeName.trim(),
        tagline: tagline.trim(),
        address: address.trim(),
        whatsapp: whatsapp.trim(),
        logoUrl: finalLogoUrl,
        receiptLogoUrl: finalReceiptLogoUrl,
        qrisImageUrl: finalQrisImageUrl,
        googleMapsUrl: googleMapsUrl.trim(),
        isGoogleReviewEnabled,
        googleReviewUrl: googleReviewUrl.trim(),
        isGoFoodEnabled,
        goFoodUrl: goFoodUrl.trim(),
        goFoodLabel: goFoodLabel.trim(),
        manualStatusOverride: manualStatus,
        operatingHours: {
          open: openTime || '09:00',
          close: closeTime || '21:00',
          days: settings?.operatingHours?.days || [0, 1, 2, 3, 4, 5, 6],
        },
        paperWidth,
        autoCutEnabled,
        isPointsEnabled,
        isGiftBoxEnabled,
        pointsPerRupiah: Number(pointsPerRupiah) || 10000,
        minOrderForPoints: Number(minOrderForPoints) || 10000,
        pointsRedeemRate: Number(pointsRedeemRate) || 100,
        pointsRounding,
        maxPointsPerOrder: Number(maxPointsPerOrder) || 100,
        isCodEnabled,
        codInstructions: codInstructions.trim(),
        isQrisEnabled,
        isTransferEnabled,
        bankName: bankName.trim(),
        accountNumber: accountNumber.trim(),
        accountHolder: accountHolder.trim(),
        transferInstructions: transferInstructions.trim(),
        footerDescription: footerDescription.trim(),
        footerDeliveryNote: footerDeliveryNote.trim(),
        footerBottomNote: footerBottomNote.trim(),
        footerCopyright: footerCopyright.trim(),
        isFooterEnabled,
        footerShowPlatforms,
        receiptFooterMessage: receiptFooterMessage.trim(),
        receiptFooterNote: receiptFooterNote.trim(),
        receiptFooterShowTagline,
        receiptFooterCustomText: receiptFooterCustomText.trim(),
        receiptFooterShowGoogleReview,
      });

      await FirestoreService.updateStoreSettings(settingsPayload);

      setSuccessMsg(true);
      onRefresh();
      setTimeout(() => setSuccessMsg(false), 4000);
    } catch (err: any) {
      errorService.capture(err, { action: 'saveStoreSettings', storeName });
      setErrorMsg(err?.message || 'Gagal menyimpan pengaturan toko.');
    } finally {
      setIsSaving(false);
      setSaveStage('');
    }
  };

  return (
    <div className="space-y-6 max-w-4xl pb-12">
      <div>
        <h2 className="font-heading font-extrabold text-xl text-[#2E1A47]">
          Pengaturan Toko & Konfigurasi Sistem
        </h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Kelola profil usaha HUMA, barcode QRIS, printer struk, ulasan Google, dan program loyalitas poin pelanggan
        </p>
      </div>

      <form onSubmit={handleSaveSettings} className="space-y-6">
        {/* Status Operasional Real-time */}
        <div className="clay-card p-5 space-y-4">
          <div className="flex items-center gap-2 text-[#2E1A47] font-bold text-sm border-b border-gray-100 pb-2">
            <Clock className="w-4 h-4 text-[#FF4500]" />
            <span>Jam Operasional & Status Buka-Tutup Toko</span>
          </div>

          <div className="p-3.5 bg-gray-50 rounded-2xl border border-gray-200 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-gray-700 block">
                Status Toko Saat Ini di Aplikasi:
              </span>
              <span className="text-[11px] text-gray-400">
                Otomatis disinkronkan ke seluruh pelanggan
              </span>
            </div>
            <StoreStatusBadge settings={settings} />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5">
              Kendali Status Toko:
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setManualStatus('AUTO')}
                className={`p-2.5 rounded-xl border text-xs font-bold transition-all ${
                  manualStatus === 'AUTO'
                    ? 'bg-[#2E1A47] text-white border-[#2E1A47] shadow-xs'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                }`}
              >
                <span>Otomatis (Ikuti Jam)</span>
              </button>
              <button
                type="button"
                onClick={() => setManualStatus('FORCE_OPEN')}
                className={`p-2.5 rounded-xl border text-xs font-bold transition-all ${
                  manualStatus === 'FORCE_OPEN'
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                }`}
              >
                <span>Paksa Buka (Lembur)</span>
              </button>
              <button
                type="button"
                onClick={() => setManualStatus('FORCE_CLOSED')}
                className={`p-2.5 rounded-xl border text-xs font-bold transition-all ${
                  manualStatus === 'FORCE_CLOSED'
                    ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                }`}
              >
                <span>Paksa Tutup (Libur)</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Jam Buka (WIB):
              </label>
              <input
                type="time"
                value={openTime}
                onChange={(e) => setOpenTime(e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-xl bg-gray-50 border border-gray-200"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Jam Tutup (WIB):
              </label>
              <input
                type="time"
                value={closeTime}
                onChange={(e) => setCloseTime(e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-xl bg-gray-50 border border-gray-200"
              />
            </div>
          </div>
        </div>

        {/* Profil Usaha & Logo */}
        <div className="clay-card p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-2">
            <div className="flex items-center gap-2 text-[#2E1A47] font-bold text-sm">
              <Store className="w-4 h-4 text-[#FF4500]" />
              <span>Identitas Toko & Logo Branding</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ImageUploadField
              label="Logo Utama Toko"
              helperText="Ditampilkan di header aplikasi & media sosial (WebP/PNG, maks 400x400px, < 80 KB)"
              value={logoUrl}
              onChange={setLogoUrl}
              aspectRatio="square"
              preset="logo"
            />

            <ImageUploadField
              label="Logo Khusus Struk Thermal"
              helperText="Ditampilkan di bagian atas struk cetak (disarankan monokrom/hitam-putih, < 80 KB)"
              value={receiptLogoUrl}
              onChange={setReceiptLogoUrl}
              aspectRatio="receipt"
              preset="receipt"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Nama Brand Toko:</label>
              <input
                type="text"
                required
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Tagline Slogan:</label>
              <input
                type="text"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-xl bg-gray-50 border border-gray-200"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Nomor WhatsApp Toko (Order & Notifikasi):
              </label>
              <input
                type="tel"
                required
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="085878775527"
                className="w-full text-xs px-3 py-2 rounded-xl bg-gray-50 border border-gray-200"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Tautan Google Maps Toko:
              </label>
              <input
                type="url"
                value={googleMapsUrl}
                onChange={(e) => setGoogleMapsUrl(e.target.value)}
                placeholder="https://maps.google.com/..."
                className="w-full text-xs px-3 py-2 rounded-xl bg-gray-50 border border-gray-200"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              Alamat Lengkap Toko:
            </label>
            <textarea
              rows={2}
              required
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Perum Gina Blok B No. 12"
              className="w-full text-xs px-3 py-2 rounded-xl bg-gray-50 border border-gray-200"
            />
          </div>
        </div>

        {/* Metode Pembayaran: COD, QRIS & Transfer Bank */}
        <div className="clay-card p-5 space-y-4">
          <div className="flex items-center gap-2 text-[#2E1A47] font-bold text-sm border-b border-gray-100 pb-2">
            <CreditCard className="w-4 h-4 text-emerald-600" />
            <span>Konfigurasi Metode Pembayaran (COD, QRIS & Transfer)</span>
          </div>

          {/* 1. COD (Bayar di Tempat) */}
          <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200/70 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs font-bold text-[#2E1A47] cursor-pointer">
                <input
                  type="checkbox"
                  checked={isCodEnabled}
                  onChange={(e) => setIsCodEnabled(e.target.checked)}
                  className="rounded-sm text-[#2E1A47]"
                />
                <span className="flex items-center gap-1.5">
                  <Banknote className="w-3.5 h-3.5 text-emerald-600" />
                  Aktifkan Bayar di Tempat (COD / Tunai)
                </span>
              </label>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isCodEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-500'}`}>
                {isCodEnabled ? 'Aktif' : 'Nonaktif'}
              </span>
            </div>
            {isCodEnabled && (
              <div>
                <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                  Petunjuk untuk Pelanggan (COD):
                </label>
                <input
                  type="text"
                  value={codInstructions}
                  onChange={(e) => setCodInstructions(e.target.value)}
                  placeholder="Siapkan uang pas saat pesanan diantar oleh kurir"
                  className="w-full text-xs px-3 py-2 rounded-xl bg-white border border-gray-200"
                />
              </div>
            )}
          </div>

          {/* 2. QRIS (Barcode Dinamis / Statis) */}
          <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200/70 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs font-bold text-[#2E1A47] cursor-pointer">
                <input
                  type="checkbox"
                  checked={isQrisEnabled}
                  onChange={(e) => setIsQrisEnabled(e.target.checked)}
                  className="rounded-sm text-[#2E1A47]"
                />
                <span className="flex items-center gap-1.5">
                  <QrCode className="w-3.5 h-3.5 text-blue-600" />
                  Aktifkan Pembayaran QRIS
                </span>
              </label>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isQrisEnabled ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-500'}`}>
                {isQrisEnabled ? 'Aktif' : 'Nonaktif'}
              </span>
            </div>
            {isQrisEnabled && (
              <div className="pt-2 border-t border-gray-200/60">
                <ImageUploadField
                  label="Gambar Barcode QRIS Resmi Toko"
                  helperText="Format JPG/PNG/WebP, otomatis dioptimasi dengan latar putih tajam (maks 600x600px, < 100 KB)"
                  value={qrisImageUrl}
                  onChange={setQrisImageUrl}
                  aspectRatio="qris"
                  preset="qris"
                />
              </div>
            )}
          </div>

          {/* 3. Transfer Bank Manual */}
          <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200/70 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs font-bold text-[#2E1A47] cursor-pointer">
                <input
                  type="checkbox"
                  checked={isTransferEnabled}
                  onChange={(e) => setIsTransferEnabled(e.target.checked)}
                  className="rounded-sm text-[#2E1A47]"
                />
                <span className="flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-indigo-600" />
                  Aktifkan Transfer Bank
                </span>
              </label>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isTransferEnabled ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-200 text-gray-500'}`}>
                {isTransferEnabled ? 'Aktif' : 'Nonaktif'}
              </span>
            </div>

            {isTransferEnabled && (
              <div className="pt-2 border-t border-gray-200/60 space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                      Nama Bank:
                    </label>
                    <input
                      type="text"
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      placeholder="Cth: BCA / Mandiri / BRI"
                      className="w-full text-xs px-3 py-2 rounded-xl bg-white border border-gray-200 font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                      Nomor Rekening:
                    </label>
                    <input
                      type="text"
                      value={accountNumber}
                      onChange={(e) => setAccountNumber(e.target.value)}
                      placeholder="Cth: 1234567890"
                      className="w-full text-xs px-3 py-2 rounded-xl bg-white border border-gray-200 font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                      Atas Nama (A/N):
                    </label>
                    <input
                      type="text"
                      value={accountHolder}
                      onChange={(e) => setAccountHolder(e.target.value)}
                      placeholder="Cth: HUMA FOOD / Nama Pemilik"
                      className="w-full text-xs px-3 py-2 rounded-xl bg-white border border-gray-200 font-medium"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                    Petunjuk Tambahan Transfer:
                  </label>
                  <input
                    type="text"
                    value={transferInstructions}
                    onChange={(e) => setTransferInstructions(e.target.value)}
                    placeholder="Cth: Sertakan nomor pesanan pada berita transfer dan kirim bukti pembayaran via WhatsApp"
                    className="w-full text-xs px-3 py-2 rounded-xl bg-white border border-gray-200"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Printer Struk & Hardware Auto-Cut */}
        <div className="clay-card p-5 space-y-4">
          <div className="flex items-center gap-2 text-[#2E1A47] font-bold text-sm border-b border-gray-100 pb-2">
            <Printer className="w-4 h-4 text-purple-600" />
            <span>Konfigurasi Printer Struk Thermal</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Lebar Kertas Thermal:
              </label>
              <select
                value={paperWidth}
                onChange={(e) => setPaperWidth(e.target.value as '58mm' | '80mm')}
                className="w-full text-xs px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 font-semibold"
              >
                <option value="58mm">58mm (Kecil / Standar Mini POS)</option>
                <option value="80mm">80mm (Lebar / Desktop POS)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Fitur Auto-Cut Kertas:
              </label>
              <div className="flex items-center gap-2 mt-1.5">
                <input
                  type="checkbox"
                  id="toggle-autocut"
                  checked={autoCutEnabled}
                  onChange={(e) => setAutoCutEnabled(e.target.checked)}
                  className="w-4 h-4 text-[#FF4500] rounded-sm"
                />
                <label htmlFor="toggle-autocut" className="text-xs text-gray-700 font-medium">
                  Kirim perintah ESC/POS Potong Kertas Otomatis (Auto Cut)
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Kustomisasi Footer Struk Thermal */}
        <div className="clay-card p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-2">
            <div className="flex items-center gap-2 text-[#2E1A47] font-bold text-sm">
              <Receipt className="w-4 h-4 text-[#FF4500]" />
              <span>Kustomisasi Teks Footer Struk Cetak</span>
            </div>
            <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 px-2.5 py-0.5 rounded-full">
              Cetak Bluetooth & Gambar Struk
            </span>
          </div>

          <p className="text-xs text-gray-500 leading-relaxed">
            Atur ucapan terima kasih, pesan khusus, dan catatan yang tercetak pada bagian bawah struk fisik pelanggan.
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Ucapan Terima Kasih (Baris Utama):
              </label>
              <input
                type="text"
                value={receiptFooterMessage}
                onChange={(e) => setReceiptFooterMessage(e.target.value)}
                placeholder="Terima kasih atas pesanan Anda!"
                className="w-full text-xs px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-gray-800 focus:bg-white focus:outline-hidden focus:border-[#2E1A47]"
              />
              <span className="text-[11px] text-gray-400 mt-1 block">
                Dicetak tebal di tengah sebagai ucapan terima kasih utama.
              </span>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="toggle-receipt-tagline"
                checked={receiptFooterShowTagline}
                onChange={(e) => setReceiptFooterShowTagline(e.target.checked)}
                className="w-4 h-4 text-[#FF4500] rounded-sm"
              />
              <label htmlFor="toggle-receipt-tagline" className="text-xs text-gray-700 font-medium cursor-pointer">
                Sertakan slogan toko "{tagline || 'Jajan dekat rasa bersahabat'}" pada footer struk
              </label>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Catatan Penutup / Keterangan Struk:
              </label>
              <input
                type="text"
                value={receiptFooterNote}
                onChange={(e) => setReceiptFooterNote(e.target.value)}
                placeholder="Simpan struk ini sebagai bukti transaksi sah"
                className="w-full text-xs px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-gray-800 focus:bg-white focus:outline-hidden focus:border-[#2E1A47]"
              />
              <span className="text-[11px] text-gray-400 mt-1 block">
                Contoh: "Simpan struk ini sebagai bukti transaksi sah" atau "Barang yang sudah dibeli tidak dapat ditukar".
              </span>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Teks Kustom Tambahan (Multi-baris / Opsional):
              </label>
              <textarea
                rows={2}
                value={receiptFooterCustomText}
                onChange={(e) => setReceiptFooterCustomText(e.target.value)}
                placeholder="Contoh: Follow IG @humafood&#10;WiFi: HUMA-FREE / Pass: jajanlagi"
                className="w-full text-xs px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-gray-800 focus:bg-white focus:outline-hidden focus:border-[#2E1A47] font-mono"
              />
              <span className="text-[11px] text-gray-400 mt-0.5 block">
                Teks tambahan seperti sosial media, info promo hari esok, atau password Wi-Fi toko (pisahkan baris dengan Enter).
              </span>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="toggle-receipt-review"
                checked={receiptFooterShowGoogleReview}
                onChange={(e) => setReceiptFooterShowGoogleReview(e.target.checked)}
                className="w-4 h-4 text-[#FF4500] rounded-sm"
              />
              <label htmlFor="toggle-receipt-review" className="text-xs text-gray-700 font-medium cursor-pointer">
                Tampilkan ajakan ulasan Google Maps di struk ("Beri ulasan kami di Google Maps!")
              </label>
            </div>
          </div>
        </div>

        {/* Google Maps Review & GoFood Link */}
        <div className="clay-card p-5 space-y-4">
          <div className="flex items-center gap-2 text-[#2E1A47] font-bold text-sm border-b border-gray-100 pb-2">
            <Star className="w-4 h-4 text-amber-500" />
            <span>Ulasan Google Review & Integrasi GoFood</span>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="toggle-google-review"
                checked={isGoogleReviewEnabled}
                onChange={(e) => setIsGoogleReviewEnabled(e.target.checked)}
                className="w-4 h-4 text-amber-500 rounded-sm"
              />
              <label htmlFor="toggle-google-review" className="text-xs text-gray-800 font-bold">
                Tampilkan Tombol Ajakan Ulasan Bintang 5 Google Review setelah Belanja
              </label>
            </div>

            {isGoogleReviewEnabled && (
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Tautan Langsung Google Review Usaha:
                </label>
                <input
                  type="url"
                  value={googleReviewUrl}
                  onChange={(e) => setGoogleReviewUrl(e.target.value)}
                  placeholder="https://search.google.com/local/writereview?placeid=..."
                  className="w-full text-xs px-3 py-2 rounded-xl bg-gray-50 border border-gray-200"
                />
              </div>
            )}
          </div>

          <div className="space-y-3 pt-3 border-t border-gray-100">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="toggle-gofood"
                checked={isGoFoodEnabled}
                onChange={(e) => setIsGoFoodEnabled(e.target.checked)}
                className="w-4 h-4 text-emerald-600 rounded-sm"
              />
              <label htmlFor="toggle-gofood" className="text-xs text-gray-800 font-bold">
                Tampilkan Panel & Tautan Cepat GoFood di Halaman Depan
              </label>
            </div>

            {isGoFoodEnabled && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Label Tombol GoFood:
                  </label>
                  <input
                    type="text"
                    value={goFoodLabel}
                    onChange={(e) => setGoFoodLabel(e.target.value)}
                    placeholder="Pesan via GoFood"
                    className="w-full text-xs px-3 py-2 rounded-xl bg-gray-50 border border-gray-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    URL Restoran di GoFood:
                  </label>
                  <input
                    type="url"
                    value={goFoodUrl}
                    onChange={(e) => setGoFoodUrl(e.target.value)}
                    placeholder="https://gofood.link/u/humafood"
                    className="w-full text-xs px-3 py-2 rounded-xl bg-gray-50 border border-gray-200"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Program Loyalitas Poin Pelanggan */}
        <div className="clay-card p-5 space-y-4">
          <div className="flex items-center gap-2 text-[#2E1A47] font-bold text-sm border-b border-gray-100 pb-2">
            <Award className="w-4 h-4 text-[#FF4500]" />
            <span>Sistem Loyalitas Poin Pelanggan (Loyalty Points)</span>
          </div>

          <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Privasi Poin Dijamin Aman (Admin-Only):</p>
              <p className="text-[11px] text-amber-800 mt-0.5">
                Poin hanya dapat dilihat dan dikelola oleh Admin/Kasir di panel administrasi. Data poin terisolasi secara ketat oleh Firestore Security Rules.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="toggle-points"
              checked={isPointsEnabled}
              onChange={(e) => setIsPointsEnabled(e.target.checked)}
              className="w-4 h-4 text-[#FF4500] rounded-sm"
            />
            <label htmlFor="toggle-points" className="text-xs text-gray-800 font-bold">
              Aktifkan Program Poin Loyalitas Pelanggan
            </label>
          </div>

          {isPointsEnabled && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-2 border-t border-gray-100">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Nominal Transaksi per 1 Poin:
                </label>
                <div className="relative">
                  <span className="text-xs text-gray-500 absolute left-3 top-2.5">Rp</span>
                  <input
                    type="number"
                    min={1000}
                    step={1000}
                    value={pointsPerRupiah}
                    onChange={(e) => setPointsPerRupiah(Number(e.target.value) || 10000)}
                    className="w-full text-xs pl-9 pr-3 py-2 rounded-xl bg-gray-50 border border-gray-200 font-bold"
                  />
                </div>
                <span className="text-[10px] text-gray-400 block mt-0.5">
                  Cth: 10.000 (Setiap belanja Rp 10.000 = 1 Poin)
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Minimal Belanja Dapat Poin:
                </label>
                <div className="relative">
                  <span className="text-xs text-gray-500 absolute left-3 top-2.5">Rp</span>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={minOrderForPoints}
                    onChange={(e) => setMinOrderForPoints(Number(e.target.value) || 0)}
                    className="w-full text-xs pl-9 pr-3 py-2 rounded-xl bg-gray-50 border border-gray-200 font-bold"
                  />
                </div>
                <span className="text-[10px] text-gray-400 block mt-0.5">
                  Belanja di bawah nilai ini tidak mendapatkan poin
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Nilai Tukar 1 Poin (Diskon):
                </label>
                <div className="relative">
                  <span className="text-xs text-gray-500 absolute left-3 top-2.5">Rp</span>
                  <input
                    type="number"
                    min={1}
                    value={pointsRedeemRate}
                    onChange={(e) => setPointsRedeemRate(Number(e.target.value) || 100)}
                    className="w-full text-xs pl-9 pr-3 py-2 rounded-xl bg-gray-50 border border-gray-200 font-bold"
                  />
                </div>
                <span className="text-[10px] text-gray-400 block mt-0.5">
                  Cth: 100 (100 poin = Diskon Rp 10.000)
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Metode Pembulatan Poin:
                </label>
                <select
                  value={pointsRounding}
                  onChange={(e) => setPointsRounding(e.target.value as 'FLOOR' | 'ROUND')}
                  className="w-full text-xs px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 font-semibold"
                >
                  <option value="FLOOR">Pembulatan ke Bawah (Floor)</option>
                  <option value="ROUND">Pembulatan Terdekat (Round)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Maksimal Poin per Transaksi:
                </label>
                <input
                  type="number"
                  min={10}
                  value={maxPointsPerOrder}
                  onChange={(e) => setMaxPointsPerOrder(Number(e.target.value) || 100)}
                  className="w-full text-xs px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 font-bold"
                />
                <span className="text-[10px] text-gray-400 block mt-0.5">
                  Batas atas poin yang dapat diraih dalam 1 pesanan
                </span>
              </div>
            </div>
          )}

          {/* Feature Flag: Kotak Hadiah on Customer Storefront */}
          <div className="pt-3 border-t border-gray-100">
            <div className="p-3.5 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/80 rounded-2xl flex items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-white shadow-2xs border border-amber-200 flex items-center justify-center shrink-0">
                  <Gift className="w-4 h-4 text-[#FF4500]" />
                </div>
                <div>
                  <label htmlFor="toggle-giftbox" className="text-xs font-extrabold text-[#2E1A47] cursor-pointer">
                    Tampilkan Ikon "Kotak Hadiah" di Sisi Customer (Feature Flag)
                  </label>
                  <p className="text-[11px] text-amber-900 mt-0.5 leading-relaxed">
                    {isGiftBoxEnabled
                      ? 'Ikon Kotak Hadiah AKTIF di Navbar customer. Pelanggan dapat melihat katalog hadiah & mengecek saldo poin.'
                      : 'Ikon Kotak Hadiah NONAKTIF. Seluruh tampilan & modul hadiah disembunyikan secara dinamis dari sisi customer.'}
                  </p>
                </div>
              </div>

              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  id="toggle-giftbox"
                  checked={isGiftBoxEnabled}
                  onChange={(e) => setIsGiftBoxEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#FF4500]"></div>
              </label>
            </div>
          </div>
        </div>

        {/* Section 7: Kustomisasi Footer Toko */}
        <div className="clay-card p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-2">
            <div className="flex items-center gap-2 text-[#2E1A47] font-bold text-sm">
              <PanelBottom className="w-4 h-4 text-[#FF4500]" />
              <span>Kustomisasi Footer Toko (Catatan Bawah & Hak Cipta)</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                id="toggle-footer-enabled"
                checked={isFooterEnabled}
                onChange={(e) => setIsFooterEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
              <span className="ml-2 text-xs font-bold text-gray-700">
                {isFooterEnabled ? 'Footer Aktif' : 'Disembunyikan'}
              </span>
            </label>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Deskripsi Toko / Tentang Kami di Footer:
              </label>
              <textarea
                rows={2}
                value={footerDescription}
                onChange={(e) => setFooterDescription(e.target.value)}
                placeholder="Pilihan kuliner lokal terpercaya..."
                className="w-full text-xs px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:bg-white focus:outline-hidden focus:border-[#2E1A47] text-gray-800"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Catatan Pengiriman di Bawah Jam Operasional:
              </label>
              <input
                type="text"
                value={footerDeliveryNote}
                onChange={(e) => setFooterDeliveryNote(e.target.value)}
                placeholder="Menerima pesanan antar ke kompleks Perum Gina dan sekitarnya."
                className="w-full text-xs px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:bg-white focus:outline-hidden focus:border-[#2E1A47] text-gray-800"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Teks Hak Cipta (Copyright):
                </label>
                <input
                  type="text"
                  value={footerCopyright}
                  onChange={(e) => setFooterCopyright(e.target.value)}
                  placeholder="© 2026 HUMA — All Rights Reserved."
                  className="w-full text-xs px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:bg-white focus:outline-hidden focus:border-[#2E1A47] text-gray-800"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Catatan Kaki / Salam Hangat:
                </label>
                <input
                  type="text"
                  value={footerBottomNote}
                  onChange={(e) => setFooterBottomNote(e.target.value)}
                  placeholder="Dibuat dengan rasa bersahabat..."
                  className="w-full text-xs px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:bg-white focus:outline-hidden focus:border-[#2E1A47] text-gray-800"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Error / Success Feedback */}
        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-rose-800 text-xs font-semibold">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-2 text-emerald-800 text-xs font-bold animate-in fade-in">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>Seluruh pengaturan toko berhasil disimpan dan diperbarui di database!</span>
          </div>
        )}

        <div className="pt-2 flex justify-end">
          <button
            type="submit"
            disabled={isSaving}
            className="clay-button-primary py-3 px-8 text-xs font-bold flex items-center gap-2 shadow-lg disabled:opacity-60"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>{isSaving ? (saveStage || 'Menyimpan Pengaturan...') : 'Simpan Semua Pengaturan'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
