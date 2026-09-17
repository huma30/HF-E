import React, { useState, useEffect } from 'react';
import { StoreSettings, PlatformLink } from '../../types';
import { FirestoreService } from '../../services/firestoreService';
import { errorService } from '../../services/errorService';
import {
  Store,
  MapPin,
  Phone,
  Clock,
  ExternalLink,
  Heart,
  Save,
  RotateCcw,
  Eye,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  Info,
  Receipt,
  Printer,
} from 'lucide-react';

interface AdminFooterManagerProps {
  settings: StoreSettings | null;
  platformLinks?: PlatformLink[];
  onRefresh: () => void;
}

const DEFAULT_FOOTER_VALUES = {
  tagline: 'Jajan dekat rasa bersahabat',
  footerDescription:
    'Pilihan kuliner lokal terpercaya untuk warga Perum Gina dan sekitarnya. Seblak otentik rempah kencur, mie jebew pedas gurih, baso aci, dan aneka minuman segar.',
  address: 'Perum Gina Blok B No. 12',
  whatsapp: '085878775527',
  googleMapsUrl: 'https://maps.google.com/?q=Perum+Gina+Blok+B+No.+12',
  footerDeliveryNote: 'Menerima pesanan antar ke kompleks Perum Gina dan sekitarnya.',
  footerBottomNote: 'Dibuat dengan penuh rasa bersahabat untuk seluruh warga.',
  footerCopyright: '© 2026 HUMA — All Rights Reserved.',
  isFooterEnabled: true,
  footerShowPlatforms: true,
  receiptFooterMessage: 'Terima kasih atas pesanan Anda!',
  receiptFooterNote: 'Simpan struk ini sebagai bukti transaksi sah',
  receiptFooterShowTagline: true,
  receiptFooterCustomText: '',
  receiptFooterShowGoogleReview: false,
};

export const AdminFooterManager: React.FC<AdminFooterManagerProps> = ({
  settings,
  platformLinks = [],
  onRefresh,
}) => {
  const [isFooterEnabled, setIsFooterEnabled] = useState(settings?.isFooterEnabled !== false);
  const [tagline, setTagline] = useState(settings?.tagline || DEFAULT_FOOTER_VALUES.tagline);
  const [footerDescription, setFooterDescription] = useState(
    settings?.footerDescription || DEFAULT_FOOTER_VALUES.footerDescription
  );
  const [address, setAddress] = useState(settings?.address || DEFAULT_FOOTER_VALUES.address);
  const [whatsapp, setWhatsapp] = useState(settings?.whatsapp || DEFAULT_FOOTER_VALUES.whatsapp);
  const [googleMapsUrl, setGoogleMapsUrl] = useState(
    settings?.googleMapsUrl || DEFAULT_FOOTER_VALUES.googleMapsUrl
  );
  const [footerDeliveryNote, setFooterDeliveryNote] = useState(
    settings?.footerDeliveryNote || DEFAULT_FOOTER_VALUES.footerDeliveryNote
  );
  const [footerBottomNote, setFooterBottomNote] = useState(
    settings?.footerBottomNote || DEFAULT_FOOTER_VALUES.footerBottomNote
  );
  const [footerCopyright, setFooterCopyright] = useState(
    settings?.footerCopyright || DEFAULT_FOOTER_VALUES.footerCopyright
  );
  const [footerShowPlatforms, setFooterShowPlatforms] = useState(
    settings?.footerShowPlatforms !== false
  );

  // Struk Thermal Footer Customization State
  const [activeTab, setActiveTab] = useState<'web' | 'receipt'>('receipt');
  const [receiptFooterMessage, setReceiptFooterMessage] = useState(
    settings?.receiptFooterMessage || DEFAULT_FOOTER_VALUES.receiptFooterMessage
  );
  const [receiptFooterNote, setReceiptFooterNote] = useState(
    settings?.receiptFooterNote || DEFAULT_FOOTER_VALUES.receiptFooterNote
  );
  const [receiptFooterShowTagline, setReceiptFooterShowTagline] = useState(
    settings?.receiptFooterShowTagline !== false
  );
  const [receiptFooterCustomText, setReceiptFooterCustomText] = useState(
    settings?.receiptFooterCustomText || DEFAULT_FOOTER_VALUES.receiptFooterCustomText
  );
  const [receiptFooterShowGoogleReview, setReceiptFooterShowGoogleReview] = useState(
    settings?.receiptFooterShowGoogleReview === true
  );

  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (settings) {
      setIsFooterEnabled(settings.isFooterEnabled !== false);
      setTagline(settings.tagline || DEFAULT_FOOTER_VALUES.tagline);
      setFooterDescription(settings.footerDescription || DEFAULT_FOOTER_VALUES.footerDescription);
      setAddress(settings.address || DEFAULT_FOOTER_VALUES.address);
      setWhatsapp(settings.whatsapp || DEFAULT_FOOTER_VALUES.whatsapp);
      setGoogleMapsUrl(settings.googleMapsUrl || DEFAULT_FOOTER_VALUES.googleMapsUrl);
      setFooterDeliveryNote(settings.footerDeliveryNote || DEFAULT_FOOTER_VALUES.footerDeliveryNote);
      setFooterBottomNote(settings.footerBottomNote || DEFAULT_FOOTER_VALUES.footerBottomNote);
      setFooterCopyright(settings.footerCopyright || DEFAULT_FOOTER_VALUES.footerCopyright);
      setFooterShowPlatforms(settings.footerShowPlatforms !== false);
      setReceiptFooterMessage(
        settings.receiptFooterMessage !== undefined
          ? settings.receiptFooterMessage
          : DEFAULT_FOOTER_VALUES.receiptFooterMessage
      );
      setReceiptFooterNote(
        settings.receiptFooterNote !== undefined
          ? settings.receiptFooterNote
          : DEFAULT_FOOTER_VALUES.receiptFooterNote
      );
      setReceiptFooterShowTagline(settings.receiptFooterShowTagline !== false);
      setReceiptFooterCustomText(
        settings.receiptFooterCustomText || DEFAULT_FOOTER_VALUES.receiptFooterCustomText
      );
      setReceiptFooterShowGoogleReview(settings.receiptFooterShowGoogleReview === true);
    }
  }, [settings]);

  const handleApplyDefaults = () => {
    if (activeTab === 'web') {
      setIsFooterEnabled(DEFAULT_FOOTER_VALUES.isFooterEnabled);
      setTagline(DEFAULT_FOOTER_VALUES.tagline);
      setFooterDescription(DEFAULT_FOOTER_VALUES.footerDescription);
      setAddress(DEFAULT_FOOTER_VALUES.address);
      setWhatsapp(DEFAULT_FOOTER_VALUES.whatsapp);
      setGoogleMapsUrl(DEFAULT_FOOTER_VALUES.googleMapsUrl);
      setFooterDeliveryNote(DEFAULT_FOOTER_VALUES.footerDeliveryNote);
      setFooterBottomNote(DEFAULT_FOOTER_VALUES.footerBottomNote);
      setFooterCopyright(DEFAULT_FOOTER_VALUES.footerCopyright);
      setFooterShowPlatforms(DEFAULT_FOOTER_VALUES.footerShowPlatforms);
    } else {
      setReceiptFooterMessage(DEFAULT_FOOTER_VALUES.receiptFooterMessage);
      setReceiptFooterNote(DEFAULT_FOOTER_VALUES.receiptFooterNote);
      setReceiptFooterShowTagline(DEFAULT_FOOTER_VALUES.receiptFooterShowTagline);
      setReceiptFooterCustomText(DEFAULT_FOOTER_VALUES.receiptFooterCustomText);
      setReceiptFooterShowGoogleReview(DEFAULT_FOOTER_VALUES.receiptFooterShowGoogleReview);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setErrorMsg(null);
    setSuccessMsg(false);

    try {
      await FirestoreService.updateStoreSettings({
        isFooterEnabled,
        tagline: tagline.trim(),
        footerDescription: footerDescription.trim(),
        address: address.trim(),
        whatsapp: whatsapp.trim(),
        googleMapsUrl: googleMapsUrl.trim(),
        footerDeliveryNote: footerDeliveryNote.trim(),
        footerBottomNote: footerBottomNote.trim(),
        footerCopyright: footerCopyright.trim(),
        footerShowPlatforms,
        receiptFooterMessage: receiptFooterMessage.trim(),
        receiptFooterNote: receiptFooterNote.trim(),
        receiptFooterShowTagline,
        receiptFooterCustomText: receiptFooterCustomText.trim(),
        receiptFooterShowGoogleReview,
      });

      setSuccessMsg(true);
      setTimeout(() => setSuccessMsg(false), 4000);
      onRefresh();
    } catch (err: any) {
      console.error('Failed to update footer settings:', err);
      errorService.capture(err, { action: 'saveFooterSettings' });
      setErrorMsg('Gagal menyimpan perubahan footer. Silakan coba kembali.');
    } finally {
      setIsSaving(false);
    }
  };

  const activePlatforms = platformLinks.filter((p) => p.isActive && p.url);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-2xl border border-gray-100 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-purple-50 text-[#2E1A47] rounded-xl">
              {activeTab === 'receipt' ? (
                <Receipt className="w-5 h-5 text-[#FF4500]" />
              ) : (
                <Store className="w-5 h-5 text-[#FF4500]" />
              )}
            </span>
            <h2 className="font-heading font-extrabold text-xl text-[#2E1A47]">
              {activeTab === 'receipt' ? 'Kustomisasi Footer Struk Kasir' : 'Kustomisasi Footer Web Toko'}
            </h2>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {activeTab === 'receipt'
              ? 'Kelola ucapan terima kasih, pesan penutup, catatan transaksi, dan promosi di bagian bawah struk cetak thermal.'
              : 'Kelola teks deskripsi tentang kami, informasi kontak, catatan pengantaran, dan hak cipta di bagian bawah web storefront.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleApplyDefaults}
            className="px-3.5 py-2 text-xs font-bold text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-xl border border-gray-200 transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Isi dengan teks default"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Default</span>
          </button>
        </div>
      </div>

      {/* Tabs Selector: Footer Struk Kasir vs Footer Web Storefront */}
      <div className="flex items-center gap-2 border-b border-gray-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('receipt')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
            activeTab === 'receipt'
              ? 'bg-[#2E1A47] text-white shadow-md'
              : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
          }`}
        >
          <Receipt className="w-4 h-4 text-[#FF4500]" />
          <span>Footer Struk Kasir (Thermal)</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('web')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
            activeTab === 'web'
              ? 'bg-[#2E1A47] text-white shadow-md'
              : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
          }`}
        >
          <Store className="w-4 h-4 text-[#FF4500]" />
          <span>Footer Web Toko (Storefront)</span>
        </button>
      </div>

      {/* Alert status feedback */}
      {successMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-2xl flex items-center gap-2.5 text-xs text-emerald-900 shadow-xs animate-in fade-in duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-bold">
            Pengaturan footer berhasil disimpan dan disinkronkan ke halaman utama!
          </span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 bg-rose-50 border border-rose-300 rounded-2xl flex items-center gap-2.5 text-xs text-rose-900 shadow-xs">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span className="font-bold">{errorMsg}</span>
        </div>
      )}

      {/* Main Grid: Form + Live Preview */}
      <form onSubmit={handleSave} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Form Settings (7 cols) */}
          <div className="lg:col-span-7 space-y-5">
            {activeTab === 'receipt' ? (
              /* TAB 1: FOOTER STRUK KASIR */
              <>
                <div className="clay-card p-5 space-y-4">
                  <div className="flex items-center gap-2 text-[#2E1A47] font-bold text-sm border-b border-gray-100 pb-2">
                    <Receipt className="w-4 h-4 text-[#FF4500]" />
                    <span>Pesan & Ucapan Terima Kasih Struk</span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Ucapan Terima Kasih (Teks Tebal Utama):
                    </label>
                    <input
                      type="text"
                      value={receiptFooterMessage}
                      onChange={(e) => setReceiptFooterMessage(e.target.value)}
                      placeholder="Terima kasih atas pesanan Anda!"
                      className="w-full text-xs px-3.5 py-2.5 rounded-xl bg-gray-50 border border-gray-200 font-semibold text-gray-800 focus:bg-white focus:outline-hidden focus:border-[#2E1A47]"
                    />
                    <span className="text-[11px] text-gray-400 mt-1 block">
                      Dicetak tebal di tengah struk sebagai ucapan utama ke pembeli.
                    </span>
                  </div>

                  <div className="pt-1 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-gray-700 block">
                        Cetak Slogan Toko di Struk
                      </span>
                      <span className="text-[11px] text-gray-400">
                        Menampilkan "{tagline || 'Jajan dekat rasa bersahabat'}" dalam tanda kutip miring.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setReceiptFooterShowTagline(!receiptFooterShowTagline)}
                      className="cursor-pointer"
                    >
                      {receiptFooterShowTagline ? (
                        <ToggleRight className="w-6 h-6 text-emerald-600" />
                      ) : (
                        <ToggleLeft className="w-6 h-6 text-gray-400" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="clay-card p-5 space-y-4">
                  <div className="flex items-center gap-2 text-[#2E1A47] font-bold text-sm border-b border-gray-100 pb-2">
                    <Printer className="w-4 h-4 text-purple-600" />
                    <span>Catatan Kaki & Informasi Tambahan Struk</span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Catatan Kaki Struk (Bukti Transaksi):
                    </label>
                    <input
                      type="text"
                      value={receiptFooterNote}
                      onChange={(e) => setReceiptFooterNote(e.target.value)}
                      placeholder="Simpan struk ini sebagai bukti transaksi sah"
                      className="w-full text-xs px-3.5 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-gray-800 focus:bg-white focus:outline-hidden focus:border-[#2E1A47]"
                    />
                    <span className="text-[11px] text-gray-400 mt-1 block">
                      Catatan umum seperti bukti sah, kebijakan retur/tukar, dll.
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Teks Kustom Tambahan (Multi-Baris / Opsional):
                    </label>
                    <textarea
                      rows={3}
                      value={receiptFooterCustomText}
                      onChange={(e) => setReceiptFooterCustomText(e.target.value)}
                      placeholder="Contoh:&#10;Follow IG @humafood&#10;WiFi: HUMA-FREE / Pass: jajanlagi&#10;Kritik & Saran: 0858-7877-5527"
                      className="w-full text-xs px-3.5 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-gray-800 focus:bg-white focus:outline-hidden focus:border-[#2E1A47] font-mono leading-relaxed"
                    />
                    <span className="text-[11px] text-gray-400 mt-0.5 block">
                      Informasi ekstra seperti sosial media, info promo esok hari, atau Wi-Fi (setiap baris terpisah akan dicetak teratur).
                    </span>
                  </div>

                  <div className="pt-1 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-gray-700 block">
                        Ajak Pelanggan Beri Ulasan Google Maps
                      </span>
                      <span className="text-[11px] text-gray-400">
                        Mencetak ajakan ulasan "Beri ulasan kami di Google Maps!" pada struk.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setReceiptFooterShowGoogleReview(!receiptFooterShowGoogleReview)}
                      className="cursor-pointer"
                    >
                      {receiptFooterShowGoogleReview ? (
                        <ToggleRight className="w-6 h-6 text-emerald-600" />
                      ) : (
                        <ToggleLeft className="w-6 h-6 text-gray-400" />
                      )}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              /* TAB 2: FOOTER WEB STOREFRONT */
              <>
                {/* Section 1: Visibility & Tagline */}
                <div className="clay-card p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                    <div className="flex items-center gap-2 text-[#2E1A47] font-bold text-sm">
                      <Sparkles className="w-4 h-4 text-[#FF4500]" />
                      <span>Visibilitas & Slogan Brand</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsFooterEnabled(!isFooterEnabled)}
                      className="flex items-center gap-2 text-xs font-bold text-gray-700 cursor-pointer"
                    >
                      <span>{isFooterEnabled ? 'Footer Aktif' : 'Footer Disembunyikan'}</span>
                      {isFooterEnabled ? (
                        <ToggleRight className="w-6 h-6 text-emerald-600" />
                      ) : (
                        <ToggleLeft className="w-6 h-6 text-gray-400" />
                      )}
                    </button>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Slogan / Tagline Toko di Footer:
                    </label>
                    <input
                      type="text"
                      value={tagline}
                      onChange={(e) => setTagline(e.target.value)}
                      placeholder="Jajan dekat rasa bersahabat"
                      className="w-full text-xs px-3.5 py-2.5 rounded-xl bg-gray-50 border border-gray-200 font-semibold text-gray-800 focus:bg-white focus:outline-hidden focus:border-[#2E1A47]"
                    />
                    <span className="text-[11px] text-gray-400 mt-1 block">
                      Tampil tepat di bawah nama toko dalam tanda petik berwarna oranye.
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Deskripsi Singkat / Tentang Kami (Profil Toko):
                    </label>
                    <textarea
                      rows={3}
                      value={footerDescription}
                      onChange={(e) => setFooterDescription(e.target.value)}
                      placeholder="Pilihan kuliner lokal terpercaya untuk warga..."
                      className="w-full text-xs px-3.5 py-2.5 rounded-xl bg-gray-50 border border-gray-200 font-medium text-gray-800 focus:bg-white focus:outline-hidden focus:border-[#2E1A47] leading-relaxed"
                    />
                    <span className="text-[11px] text-gray-400 mt-0.5 block">
                      Ceritakan keistimewaan menu atau keramahan tokomu kepada pengunjung web.
                    </span>
                  </div>

                  <div className="pt-1 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-gray-700 block">
                        Tampilkan Link Platform Luar (GoFood / ShopeeFood)
                      </span>
                      <span className="text-[11px] text-gray-400">
                        Memperlihatkan tautan pemesanan online di bawah profil toko.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFooterShowPlatforms(!footerShowPlatforms)}
                      className="cursor-pointer"
                    >
                      {footerShowPlatforms ? (
                        <ToggleRight className="w-6 h-6 text-emerald-600" />
                      ) : (
                        <ToggleLeft className="w-6 h-6 text-gray-400" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Section 2: Alamat, WhatsApp, & Maps */}
                <div className="clay-card p-5 space-y-4">
                  <div className="flex items-center gap-2 text-[#2E1A47] font-bold text-sm border-b border-gray-100 pb-2">
                    <MapPin className="w-4 h-4 text-[#FF4500]" />
                    <span>Informasi Lokasi & Kontak</span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Alamat Lengkap Toko:
                    </label>
                    <input
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Perum Gina Blok B No. 12"
                      className="w-full text-xs px-3.5 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-gray-800 font-semibold focus:bg-white focus:outline-hidden focus:border-[#2E1A47]"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">
                        Nomor WhatsApp:
                      </label>
                      <input
                        type="text"
                        value={whatsapp}
                        onChange={(e) => setWhatsapp(e.target.value)}
                        placeholder="085878775527"
                        className="w-full text-xs px-3.5 py-2.5 rounded-xl bg-gray-50 border border-gray-200 font-mono text-gray-800 focus:bg-white focus:outline-hidden focus:border-[#2E1A47]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">
                        Tautan Google Maps:
                      </label>
                      <input
                        type="url"
                        value={googleMapsUrl}
                        onChange={(e) => setGoogleMapsUrl(e.target.value)}
                        placeholder="https://maps.google.com/?q=..."
                        className="w-full text-xs px-3.5 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-gray-800 focus:bg-white focus:outline-hidden focus:border-[#2E1A47]"
                      />
                    </div>
                  </div>
                </div>

                {/* Section 3: Jam Operasional & Catatan Pengantaran */}
                <div className="clay-card p-5 space-y-4">
                  <div className="flex items-center gap-2 text-[#2E1A47] font-bold text-sm border-b border-gray-100 pb-2">
                    <Clock className="w-4 h-4 text-[#E1AD01]" />
                    <span>Catatan Jam Operasional & Pengantaran</span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Catatan Area Pengantaran di Bawah Jam Buka:
                    </label>
                    <input
                      type="text"
                      value={footerDeliveryNote}
                      onChange={(e) => setFooterDeliveryNote(e.target.value)}
                      placeholder="Menerima pesanan antar ke kompleks Perum Gina dan sekitarnya."
                      className="w-full text-xs px-3.5 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-gray-800 focus:bg-white focus:outline-hidden focus:border-[#2E1A47]"
                    />
                    <span className="text-[11px] text-gray-400 mt-1 block">
                      Informasi ini ditampilkan di kotak jam operasional footer.
                    </span>
                  </div>
                </div>

                {/* Section 4: Catatan Kaki & Hak Cipta */}
                <div className="clay-card p-5 space-y-4">
                  <div className="flex items-center gap-2 text-[#2E1A47] font-bold text-sm border-b border-gray-100 pb-2">
                    <Heart className="w-4 h-4 text-[#FF4500]" />
                    <span>Bar Bawah: Hak Cipta & Salam Hangat</span>
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
                        className="w-full text-xs px-3.5 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-gray-800 focus:bg-white focus:outline-hidden focus:border-[#2E1A47]"
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
                        placeholder="Dibuat dengan rasa bersahabat untuk seluruh warga."
                        className="w-full text-xs px-3.5 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-gray-800 focus:bg-white focus:outline-hidden focus:border-[#2E1A47]"
                      />
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Submit Action */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="submit"
                disabled={isSaving}
                className="clay-button-primary px-6 py-3 text-xs sm:text-sm font-extrabold flex items-center gap-2 shadow-lg disabled:opacity-50 cursor-pointer"
              >
                <Save className="w-4 h-4 text-white" />
                <span>
                  {isSaving
                    ? 'Menyimpan Perubahan...'
                    : activeTab === 'receipt'
                    ? 'Simpan Footer Struk'
                    : 'Simpan Footer Web'}
                </span>
              </button>
            </div>
          </div>

          {/* Real-Time Live Preview (5 cols) */}
          <div className="lg:col-span-5 sticky top-20 space-y-3">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2 text-xs font-bold text-gray-700">
                <Eye className="w-4 h-4 text-[#FF4500]" />
                <span>
                  {activeTab === 'receipt'
                    ? 'Simulasi Struk Kasir 58mm'
                    : 'Pratinjau Langsung Web'}
                </span>
              </div>
              <span className="text-[10px] font-semibold bg-purple-50 text-[#2E1A47] px-2 py-0.5 rounded-full border border-purple-200">
                {activeTab === 'receipt' ? 'Thermal Receipt' : isFooterEnabled ? 'Tampak di Pelanggan' : 'Nonaktif'}
              </span>
            </div>

            {activeTab === 'receipt' ? (
              /* PREVIEW STRUK THERMAL (KERTAS STRUK KASIR ASLI) */
              <div className="bg-white rounded-2xl border-2 border-dashed border-gray-300 shadow-md p-5 text-gray-800 font-mono text-xs max-w-sm mx-auto">
                <div className="text-center pb-3 border-b border-dashed border-gray-300">
                  <p className="font-bold text-sm tracking-wider uppercase">
                    {settings?.storeName || 'HUMA'}
                  </p>
                  <p className="text-[10px] text-gray-500">
                    {settings?.tagline || 'Jajan dekat rasa bersahabat'}
                  </p>
                  <p className="text-[9px] text-gray-400 mt-0.5">
                    {settings?.address || 'Perum Gina Blok B No. 12'}
                  </p>
                  <p className="text-[9px] text-gray-400">
                    WA: {settings?.whatsapp || '085878775527'}
                  </p>
                </div>

                {/* Dummy receipt item list for realistic context */}
                <div className="py-2.5 border-b border-dashed border-gray-300 text-[11px] space-y-1">
                  <div className="flex justify-between text-[10px] text-gray-400 pb-1">
                    <span>#ORD-88219 (DINE IN)</span>
                    <span>16/09 14:30</span>
                  </div>
                  <div className="flex justify-between">
                    <span>1x Seblak Komplit Original</span>
                    <span>Rp 18.000</span>
                  </div>
                  <div className="flex justify-between">
                    <span>1x Es Teh Manis Segar</span>
                    <span>Rp 5.000</span>
                  </div>
                  <div className="flex justify-between font-bold pt-1 border-t border-dotted border-gray-200">
                    <span>TOTAL BAYAR (QRIS)</span>
                    <span>Rp 23.000</span>
                  </div>
                </div>

                {/* LIVE FOOTER STRUK YANG SEDANG DIEDIT */}
                <div className="pt-3 pb-1 text-center space-y-1.5">
                  {receiptFooterShowTagline && (
                    <p className="text-[10px] italic text-gray-600">
                      "{tagline || settings?.tagline || 'Jajan dekat rasa bersahabat'}"
                    </p>
                  )}

                  {receiptFooterMessage && (
                    <p className="font-bold text-[11px] text-gray-900 tracking-wide">
                      {receiptFooterMessage}
                    </p>
                  )}

                  {receiptFooterNote && (
                    <p className="text-[10px] text-gray-600">
                      {receiptFooterNote}
                    </p>
                  )}

                  {receiptFooterCustomText && (
                    <div className="py-1 text-[9px] text-gray-700 bg-gray-50 rounded-md border border-gray-200 whitespace-pre-line leading-tight px-2">
                      {receiptFooterCustomText}
                    </div>
                  )}

                  {receiptFooterShowGoogleReview && (
                    <p className="text-[9px] text-amber-700 font-bold bg-amber-50 rounded-sm py-0.5 border border-amber-200">
                      ⭐ Beri ulasan kami di Google Maps! ⭐
                    </p>
                  )}

                  <div className="pt-2 text-[9px] text-gray-400 border-t border-dotted border-gray-300">
                    <p>*** TERIMA KASIH ***</p>
                  </div>
                </div>
              </div>
            ) : (
              /* PREVIEW FOOTER WEB STOREFRONT */
              <div className="bg-white rounded-2xl border border-gray-200 shadow-md p-4 sm:p-5 overflow-hidden text-[#2E1A47]">
                {!isFooterEnabled ? (
                  <div className="py-12 text-center text-gray-400 space-y-2">
                    <Info className="w-8 h-8 mx-auto text-gray-300" />
                    <p className="text-xs font-bold text-gray-500">Footer Saat Ini Disembunyikan</p>
                    <p className="text-[11px] text-gray-400 max-w-xs mx-auto">
                      Aktifkan sakelar toggle di atas untuk menampilkan kembali footer di halaman pelanggan.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Brand & Tagline Preview */}
                    <div>
                      <div className="flex items-center gap-2">
                        <img
                          src={settings?.logoUrl || '/huma_brand_logo.png'}
                          alt="HUMA"
                          className="w-7 h-7 rounded-lg object-contain border border-gray-100 p-0.5"
                        />
                        <span className="font-heading font-extrabold text-base text-[#2E1A47]">
                          {settings?.storeName || 'HUMA'}
                        </span>
                      </div>
                      <p className="text-xs text-[#FF4500] font-bold mt-1">
                        "{tagline || 'Slogan toko...'}"
                      </p>
                      <p className="text-[11px] text-gray-500 mt-1.5 leading-relaxed">
                        {footerDescription || 'Deskripsi profil toko...'}
                      </p>

                      {footerShowPlatforms && activePlatforms.length > 0 && (
                        <div className="mt-3">
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
                            Juga Tersedia di:
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {activePlatforms.map((pl) => (
                              <span
                                key={pl.id}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-50 border border-gray-200 text-[10px] font-semibold text-gray-700"
                              >
                                <span>{pl.name}</span>
                                <ExternalLink className="w-2.5 h-2.5 text-gray-400" />
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Lokasi & Kontak Preview */}
                    <div className="border-t border-gray-100 pt-3">
                      <h5 className="font-heading font-bold text-xs text-[#2E1A47] mb-2">
                        Lokasi & Kontak
                      </h5>
                      <div className="space-y-1.5 text-[11px] text-gray-600">
                        <div className="flex items-start gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-[#FF4500] shrink-0 mt-0.5" />
                          <div>
                            <p className="font-semibold text-gray-800">{address || 'Alamat toko'}</p>
                            <span className="text-[10px] text-[#FF4500] font-bold inline-flex items-center gap-0.5">
                              <span>Google Maps Aktif</span>
                              <ExternalLink className="w-2 h-2" />
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span className="font-semibold text-gray-800">
                            WhatsApp: {whatsapp || '08...'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Jam Operasional Preview */}
                    <div className="border-t border-gray-100 pt-3">
                      <h5 className="font-heading font-bold text-xs text-[#2E1A47] mb-2">
                        Jam Operasional
                      </h5>
                      <div className="bg-gray-50 p-2.5 rounded-xl border border-gray-100 text-[11px] space-y-1">
                        <div className="flex items-center gap-1.5 text-gray-700 font-semibold">
                          <Clock className="w-3.5 h-3.5 text-[#E1AD01]" />
                          <span>
                            {settings?.operatingHours?.open || '10:00'} -{' '}
                            {settings?.operatingHours?.close || '22:00'} WIB
                          </span>
                        </div>
                        <p className="text-[10px] text-gray-500 pl-5">
                          {footerDeliveryNote || 'Catatan pengantaran...'}
                        </p>
                      </div>
                    </div>

                    {/* Bottom Bar Preview */}
                    <div className="border-t border-gray-100 pt-3 flex flex-col gap-1.5 text-[10px] text-gray-400">
                      <p>{footerCopyright || '© Hak Cipta Toko'}</p>
                      <p className="flex items-center gap-1 text-gray-500 font-medium">
                        <span>{footerBottomNote || 'Catatan kaki...'}</span>
                        <Heart className="w-3 h-3 text-[#FF4500] fill-[#FF4500]" />
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </form>
    </div>
  );
};
