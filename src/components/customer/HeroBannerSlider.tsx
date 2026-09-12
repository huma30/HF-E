import React, { useState, useEffect } from 'react';
import { Banner } from '../../types';
import { ChevronLeft, ChevronRight, Flame } from 'lucide-react';

interface HeroBannerSliderProps {
  banners: Banner[];
  onBannerClick?: (banner?: Banner) => void;
}

export const HeroBannerSlider: React.FC<HeroBannerSliderProps> = ({ banners, onBannerClick }) => {
  const activeBanners = banners.filter((b) => b.isActive);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (activeBanners.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % activeBanners.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [activeBanners.length]);

  if (activeBanners.length === 0) {
    return (
      <div className="relative overflow-hidden rounded-3xl clay-card bg-gradient-to-r from-[#2E1A47] to-[#45276B] text-white p-6 sm:p-8 my-4 shadow-xl">
        <div className="max-w-xl">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FF4500]/20 text-[#FF7A45] text-xs font-bold mb-3 border border-[#FF4500]/30">
            <Flame className="w-3.5 h-3.5 text-[#FF4500]" />
            <span>Jajanan Favorit Warga Gina</span>
          </div>
          <h2 className="font-heading font-extrabold text-2xl sm:text-3xl lg:text-4xl tracking-tight leading-tight">
            Jajan Dekat Rasa Bersahabat
          </h2>
          <p className="text-gray-300 text-xs sm:text-sm mt-2 font-medium">
            Seblak kuah kental rempah asli, mie jebew pedas gurih, baso aci segar, & aneka cemilan nikmat siap antar ke rumahmu.
          </p>
        </div>
      </div>
    );
  }

  const currentBanner = activeBanners[currentIndex];

  return (
    <div className="relative my-4 overflow-hidden rounded-3xl clay-card shadow-lg group">
      <div className="relative h-44 sm:h-64 md:h-72 w-full overflow-hidden bg-gray-900">
        <img
          src={currentBanner.imageUrl}
          alt={currentBanner.title}
          fetchPriority="high"
          decoding="async"
          className="w-full h-full object-cover opacity-85 transition-transform duration-700 ease-out group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent flex flex-col justify-end p-5 sm:p-8 text-white">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FF4500] text-white text-xs font-bold mb-2 w-max shadow-md">
            <Flame className="w-3.5 h-3.5" />
            <span>Spesial HUMA</span>
          </div>
          <h2 className="font-heading font-extrabold text-xl sm:text-2xl md:text-3xl max-w-lg leading-snug">
            {currentBanner.title}
          </h2>
        </div>
      </div>

      {/* Slider Controls */}
      {activeBanners.length > 1 && (
        <>
          <button
            onClick={() => setCurrentIndex((prev) => (prev - 1 + activeBanners.length) % activeBanners.length)}
            aria-label="Banner sebelumnya"
            className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/70 hover:bg-white text-[#2E1A47] flex items-center justify-center shadow-md backdrop-blur-xs opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setCurrentIndex((prev) => (prev + 1) % activeBanners.length)}
            aria-label="Banner berikutnya"
            className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/70 hover:bg-white text-[#2E1A47] flex items-center justify-center shadow-md backdrop-blur-xs opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          {/* Dots Indicator */}
          <div className="absolute bottom-3 right-5 flex items-center gap-1.5">
            {activeBanners.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentIndex(i)}
                className={`h-1.5 rounded-full transition-all ${
                  currentIndex === i ? 'w-6 bg-[#FF4500]' : 'w-2 bg-white/50'
                }`}
                aria-label={`Slide ${i + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};
