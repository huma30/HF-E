import React from 'react';
import { ChevronLeft } from 'lucide-react';
import { GestureState } from '../../hooks/useGestureBack';

interface GestureBackIndicatorProps {
  gestureState: GestureState;
  label?: string;
}

export const GestureBackIndicator: React.FC<GestureBackIndicatorProps> = ({
  gestureState,
  label = 'Kembali',
}) => {
  if (!gestureState.isSwiping || gestureState.progress <= 0.05) {
    return null;
  }

  const { progress, currentY } = gestureState;
  const isTriggerReady = progress >= 0.85;

  // Clamp vertical position within visible viewport
  const topPos = Math.max(80, Math.min(window.innerHeight - 80, currentY || window.innerHeight / 2));

  return (
    <div
      className="fixed left-0 z-[9999] pointer-events-none flex items-center transition-transform duration-75 select-none"
      style={{
        top: `${topPos}px`,
        transform: `translateY(-50%) translateX(${Math.min(24, progress * 24)}px)`,
      }}
      aria-hidden="true"
    >
      <div
        className={`flex items-center gap-1.5 px-3 py-2 rounded-r-2xl shadow-xl backdrop-blur-md border transition-all duration-150 ${
          isTriggerReady
            ? 'bg-[#FF4500] text-white border-[#FF4500] scale-110 shadow-orange-500/30'
            : 'bg-[#2E1A47]/90 text-white border-white/20 scale-100'
        }`}
        style={{
          opacity: Math.min(1, progress * 1.4),
        }}
      >
        <ChevronLeft
          className={`w-5 h-5 transition-transform duration-150 ${
            isTriggerReady ? '-translate-x-1 stroke-[3]' : ''
          }`}
        />
        <span className="text-xs font-heading font-extrabold tracking-wide whitespace-nowrap pr-1">
          {label}
        </span>
      </div>
    </div>
  );
};
