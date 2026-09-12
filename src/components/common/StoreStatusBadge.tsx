import React from 'react';
import { StoreSettings, StoreStatusType } from '../../types';

interface StoreStatusBadgeProps {
  settings: StoreSettings | null;
  className?: string;
}

export const getStoreCurrentStatus = (settings: StoreSettings | null): {
  status: StoreStatusType;
  label: string;
  isOpen: boolean;
  colorClass: string;
  dotColorClass: string;
} => {
  if (!settings) {
    return {
      status: 'OPEN',
      label: 'Buka',
      isOpen: true,
      colorClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      dotColorClass: 'bg-emerald-500',
    };
  }

  // Priority 1: Manual closed
  if (settings.manualStatusOverride === 'CLOSED') {
    return {
      status: 'CLOSED',
      label: 'Toko Tutup',
      isOpen: false,
      colorClass: 'bg-rose-50 text-rose-700 border-rose-200',
      dotColorClass: 'bg-rose-500',
    };
  }

  if (settings.manualStatusOverride === 'TEMPORARILY_CLOSED') {
    return {
      status: 'TEMPORARILY_CLOSED',
      label: 'Tutup Sementara',
      isOpen: false,
      colorClass: 'bg-amber-50 text-amber-700 border-amber-200',
      dotColorClass: 'bg-amber-500',
    };
  }

  // Priority 2: Manual open override
  if (settings.manualStatusOverride === 'OPEN') {
    return {
      status: 'OPEN',
      label: 'Buka Sekarang',
      isOpen: true,
      colorClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      dotColorClass: 'bg-emerald-500',
    };
  }

  // Priority 3: Operating hours check
  if (settings.operatingHours) {
    const now = new Date();
    const day = now.getDay();
    const allowedDays = settings.operatingHours.days || [0, 1, 2, 3, 4, 5, 6];

    if (!allowedDays.includes(day)) {
      return {
        status: 'CLOSED',
        label: 'Tutup Hari Ini',
        isOpen: false,
        colorClass: 'bg-rose-50 text-rose-700 border-rose-200',
        dotColorClass: 'bg-rose-500',
      };
    }

    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const [openH, openM] = (settings.operatingHours.open || '10:00').split(':').map(Number);
    const [closeH, closeM] = (settings.operatingHours.close || '22:00').split(':').map(Number);

    const openMinutes = openH * 60 + openM;
    const closeMinutes = closeH * 60 + closeM;

    if (currentMinutes >= openMinutes && currentMinutes <= closeMinutes) {
      return {
        status: 'OPEN',
        label: `Buka • s/d ${settings.operatingHours.close}`,
        isOpen: true,
        colorClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        dotColorClass: 'bg-emerald-500',
      };
    } else {
      return {
        status: 'CLOSED',
        label: `Tutup • Buka ${settings.operatingHours.open}`,
        isOpen: false,
        colorClass: 'bg-rose-50 text-rose-700 border-rose-200',
        dotColorClass: 'bg-rose-500',
      };
    }
  }

  return {
    status: 'OPEN',
    label: 'Buka',
    isOpen: true,
    colorClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dotColorClass: 'bg-emerald-500',
  };
};

export const StoreStatusBadge: React.FC<StoreStatusBadgeProps> = ({ settings, className = '' }) => {
  const current = getStoreCurrentStatus(settings);

  return (
    <div
      id="store-status-badge"
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border transition-colors shadow-xs ${current.colorClass} ${className}`}
      title={settings?.operatingHours ? `Jam Operasional: ${settings.operatingHours.open} - ${settings.operatingHours.close}` : ''}
    >
      <span className="relative flex h-2 w-2">
        {current.isOpen && (
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${current.dotColorClass} opacity-75`} />
        )}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${current.dotColorClass}`} />
      </span>
      <span className="whitespace-nowrap">{current.label}</span>
    </div>
  );
};
