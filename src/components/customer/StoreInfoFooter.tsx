import React from 'react';
import { StoreSettings, PlatformLink } from '../../types';
import { MapPin, Phone, Clock, ExternalLink, Heart, ShieldCheck } from 'lucide-react';

interface StoreInfoFooterProps {
  settings: StoreSettings | null;
  platformLinks: PlatformLink[];
  onOpenAdmin?: () => void;
}

export const StoreInfoFooter: React.FC<StoreInfoFooterProps> = ({
  settings,
  platformLinks,
  onOpenAdmin,
}) => {
  if (settings?.isFooterEnabled === false) {
    return null;
  }

  const address = settings?.address || 'Perum Gina Blok B No. 12';
  const whatsapp = settings?.whatsapp || '085878775527';
  const tagline = settings?.tagline || 'Jajan dekat rasa bersahabat';
  const footerDesc =
    settings?.footerDescription ||
    'Pilihan kuliner lokal terpercaya untuk warga Perum Gina dan sekitarnya. Seblak otentik rempah kencur, mie jebew pedas gurih, baso aci, dan aneka minuman segar.';
  const deliveryNote =
    settings?.footerDeliveryNote ||
    'Menerima pesanan antar ke kompleks Perum Gina dan sekitarnya.';
  const bottomNote =
    settings?.footerBottomNote || 'Dibuat dengan rasa bersahabat untuk seluruh pelanggan.';
  const copyrightText =
    settings?.footerCopyright ||
    `© ${new Date().getFullYear()} ${settings?.storeName || 'HUMA'} — All Rights Reserved.`;
  const showPlatforms = settings?.footerShowPlatforms !== false;

  const googleMapsUrl =
    settings?.googleMapsUrl ||
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      'Perum Gina Blok B No. 12'
    )}`;

  const configuredPlatforms = platformLinks.filter((p) => p.isActive && p.url);

  const activePlatforms: PlatformLink[] = [...configuredPlatforms];
  if (settings?.isGoFoodEnabled !== false && settings?.goFoodUrl?.trim()) {
    const hasGoFood = configuredPlatforms.some(
      (p) => p.url.trim() === settings.goFoodUrl!.trim() || p.name.toLowerCase().includes('gofood')
    );
    if (!hasGoFood) {
      activePlatforms.push({
        id: 'settings-gofood',
        name: settings.goFoodLabel?.trim() || 'GoFood',
        url: settings.goFoodUrl.trim(),
        isActive: true,
      });
    }
  }

  return (
    <footer className="mt-12 bg-white border-t border-gray-100 pt-10 pb-24 sm:pb-12 text-[#2E1A47]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Brand Col */}
          <div>
            <div className="flex items-center gap-2.5">
              {settings?.logoUrl ? (
                <img
                  src={settings.logoUrl}
                  alt={settings.storeName || 'HUMA'}
                  className="w-9 h-9 rounded-xl object-contain shadow-xs border border-gray-100 bg-white shrink-0 p-0.5"
                />
              ) : (
                <img
                  src="/huma_brand_logo.png"
                  alt="HUMA"
                  className="w-9 h-9 rounded-xl object-contain shadow-xs border border-gray-100 bg-white shrink-0 p-0.5"
                />
              )}
              <span className="font-heading font-extrabold text-xl text-[#2E1A47]">
                {settings?.storeName || 'HUMA'}
              </span>
            </div>
            <p className="text-xs text-[#FF4500] font-bold mt-1">"{tagline}"</p>
            <p className="text-xs text-gray-500 mt-2 max-w-sm leading-relaxed whitespace-pre-line">
              {footerDesc}
            </p>

            {/* Platform Links (GoFood, ShopeeFood) */}
            {showPlatforms && activePlatforms.length > 0 && (
              <div className="mt-4">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                  Juga Tersedia di:
                </p>
                <div className="flex flex-wrap gap-2">
                  {activePlatforms.map((pl) => (
                    <a
                      key={pl.id}
                      href={pl.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-50 hover:bg-gray-100 border border-gray-200 text-xs font-semibold text-gray-700 transition-colors shadow-2xs"
                    >
                      <span>{pl.name}</span>
                      <ExternalLink className="w-3 h-3 text-gray-400" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Location & Contact */}
          <div>
            <h4 className="font-heading font-bold text-sm text-[#2E1A47] mb-3">
              Lokasi & Kontak
            </h4>
            <ul className="space-y-2.5 text-xs text-gray-600">
              <li className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-[#FF4500] shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-gray-800">{address}</p>
                  <a
                    href={googleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-[#FF4500] font-bold hover:underline inline-flex items-center gap-0.5 mt-0.5"
                  >
                    <span>Buka Petunjuk Google Maps</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
              </li>
              <li className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-emerald-600 shrink-0" />
                <a
                  href={`https://wa.me/62${whatsapp.replace(/^0/, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline font-semibold text-gray-800"
                >
                  WhatsApp: {whatsapp}
                </a>
              </li>
            </ul>
          </div>

          {/* Operating Hours */}
          <div>
            <h4 className="font-heading font-bold text-sm text-[#2E1A47] mb-3">
              Jam Operasional
            </h4>
            <div className="bg-gray-50 p-3 rounded-2xl border border-gray-100 text-xs space-y-1.5">
              <div className="flex items-center gap-2 text-gray-700">
                <Clock className="w-4 h-4 text-[#E1AD01]" />
                <span className="font-semibold">
                  Buka Setiap Hari: {settings?.operatingHours?.open || '10:00'} -{' '}
                  {settings?.operatingHours?.close || '22:00'} WIB
                </span>
              </div>
              <p className="text-[11px] text-gray-500 pl-6 whitespace-pre-line">
                {deliveryNote}
              </p>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-8 pt-6 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between text-xs text-gray-400 gap-3">
          <p>{copyrightText}</p>
          <div className="flex items-center gap-4 flex-wrap justify-center">
            <p className="flex items-center gap-1">
              <span>{bottomNote}</span>
              <Heart className="w-3.5 h-3.5 text-[#FF4500] fill-[#FF4500] shrink-0" />
            </p>
            {onOpenAdmin && (
              <button
                id="footer-staff-login-btn"
                onClick={onOpenAdmin}
                className="text-[11px] text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1 cursor-pointer"
                title="Akses Portal Khusus Staff Toko"
              >
                <ShieldCheck className="w-3 h-3 text-gray-400" />
                <span>Akses Staff</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
};
