import React, { useEffect, useRef, useState } from 'react';
import { X, ChevronRight } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  maxWidth?: string;
  className?: string;
  enableGestureBack?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  maxWidth = 'max-w-lg',
  className = '',
  enableGestureBack = true,
}) => {
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const modalContentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onClose();
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        document.body.style.overflow = '';
        window.removeEventListener('keydown', handleKeyDown);
      };
    } else {
      document.body.style.overflow = '';
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!enableGestureBack || e.touches.length !== 1) return;
    const touch = e.touches[0];
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
    };
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current || e.touches.length !== 1) return;
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const deltaX = currentX - touchStartRef.current.x;
    const deltaY = currentY - touchStartRef.current.y;

    // Check if inner content is scrolled down
    const innerScrollTop = modalContentRef.current?.scrollTop || 0;

    // Detect downward pull (only if at top of scroll or dragging from handle/header)
    if (deltaY > 0 && innerScrollTop <= 2 && deltaY > Math.abs(deltaX) * 0.8) {
      setDragOffset({ x: 0, y: deltaY });
    } else if (deltaX > 0 && deltaX > Math.abs(deltaY) * 1.5) {
      // Swiping right to go back
      setDragOffset({ x: Math.min(120, deltaX * 0.6), y: 0 });
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;
    const duration = Date.now() - touchStartRef.current.time;

    // Pull down threshold: 50px or quick downward flick (duration < 300ms & deltaY > 35px)
    const isSwipeDown = deltaY >= 50 || (deltaY >= 35 && duration < 300 && deltaY > Math.abs(deltaX));
    const isSwipeRight = deltaX >= 75 || (deltaX >= 40 && duration < 250 && deltaX > Math.abs(deltaY));

    if (isSwipeDown || isSwipeRight) {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate(15);
        } catch {}
      }
      onClose();
    }

    touchStartRef.current = null;
    setIsDragging(false);
    setDragOffset({ x: 0, y: 0 });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal / Bottom Sheet Container */}
      <div
        style={{
          transform:
            dragOffset.x !== 0 || dragOffset.y !== 0
              ? `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0)`
              : undefined,
          opacity: dragOffset.y > 0 ? Math.max(0.4, 1 - dragOffset.y / 250) : 1,
          transition: !isDragging ? 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s' : 'none',
        }}
        className={`relative w-full ${maxWidth} bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl z-10 max-h-[92vh] flex flex-col transition-all overflow-hidden ${className}`}
        role="dialog"
        aria-modal="true"
      >
        {/* Top Grab Handle Area (Dedicated Pull-Down Zone) */}
        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="w-full pt-2.5 pb-1 flex flex-col items-center justify-center cursor-grab active:cursor-grabbing select-none shrink-0"
          title="Tarik ke bawah untuk menutup"
        >
          <div className="w-12 h-1.5 rounded-full bg-gray-300 hover:bg-gray-400 transition-colors" />
        </div>

        {/* Header */}
        {(title || subtitle) && (
          <div
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className="flex items-start justify-between px-5 sm:px-6 pb-3 border-b border-gray-100 shrink-0 select-none"
          >
            <div>
              {title && <h3 className="font-heading font-extrabold text-base sm:text-lg text-[#2E1A47]">{title}</h3>}
              {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
            </div>
            <button
              onClick={onClose}
              className="p-1.5 -mr-1 -mt-1 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
              aria-label="Tutup"
              title="Tutup (Bisa geser ke bawah untuk menutup)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Content Area */}
        <div
          ref={modalContentRef}
          className="flex-1 overflow-y-auto px-5 sm:px-6 py-4"
          onTouchStart={(e) => {
            // If inner content is at top, allow pull-down gesture
            if (modalContentRef.current && modalContentRef.current.scrollTop <= 2) {
              handleTouchStart(e);
            }
          }}
          onTouchMove={(e) => {
            if (modalContentRef.current && modalContentRef.current.scrollTop <= 2 && touchStartRef.current) {
              const deltaY = e.touches[0].clientY - touchStartRef.current.y;
              if (deltaY > 0) {
                handleTouchMove(e);
              }
            }
          }}
          onTouchEnd={handleTouchEnd}
        >
          {children}
        </div>
      </div>
    </div>
  );
};
