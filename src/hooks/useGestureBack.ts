import { useEffect, useRef, useState, useCallback } from 'react';

export interface GestureBackOptions {
  onBack: () => void;
  enabled?: boolean;
  edgeWidth?: number; // Distance in px from left edge to start gesture
  threshold?: number; // Minimum horizontal drag distance to trigger back
  enableEdgeSwipe?: boolean; // Enable swipe from screen edge
  allowAnywhereSwipe?: boolean; // Enable swipe from anywhere if an overlay/modal is open
}

export interface GestureState {
  isSwiping: boolean;
  progress: number; // 0 to 1
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

/**
 * Custom hook to support swipe-to-back gestures (Edge swipe & touch drag)
 * and synchronize with mobile browser history (native Android / iOS back gesture).
 */
export function useGestureBack({
  onBack,
  enabled = true,
  edgeWidth = 45,
  threshold = 75,
  enableEdgeSwipe = true,
  allowAnywhereSwipe = false,
}: GestureBackOptions) {
  const [gestureState, setGestureState] = useState<GestureState>({
    isSwiping: false,
    progress: 0,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
  });

  const touchStartRef = useRef<{ x: number; y: number; time: number; valid: boolean }>({
    x: 0,
    y: 0,
    time: 0,
    valid: false,
  });

  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  // Handle touch events on window
  useEffect(() => {
    if (!enabled) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      const startX = touch.clientX;
      const startY = touch.clientY;

      // Check if started from left edge or if anywhere swipe is allowed
      const isFromEdge = startX <= edgeWidth;
      const isValidStart = allowAnywhereSwipe || (enableEdgeSwipe && isFromEdge);

      touchStartRef.current = {
        x: startX,
        y: startY,
        time: Date.now(),
        valid: isValidStart,
      };

      if (isValidStart) {
        setGestureState({
          isSwiping: false,
          progress: 0,
          startX,
          startY,
          currentX: startX,
          currentY: startY,
        });
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!touchStartRef.current.valid || e.touches.length !== 1) return;
      const touch = e.touches[0];
      const deltaX = touch.clientX - touchStartRef.current.x;
      const deltaY = touch.clientY - touchStartRef.current.y;

      // Must be swiping rightward and predominantly horizontal
      if (deltaX > 10 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
        const progress = Math.min(1, Math.max(0, deltaX / threshold));
        setGestureState({
          isSwiping: true,
          progress,
          startX: touchStartRef.current.x,
          startY: touchStartRef.current.y,
          currentX: touch.clientX,
          currentY: touch.clientY,
        });
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!touchStartRef.current.valid) return;
      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - touchStartRef.current.x;
      const deltaY = touch.clientY - touchStartRef.current.y;
      const duration = Date.now() - touchStartRef.current.time;

      const isHorizontal = Math.abs(deltaX) > Math.abs(deltaY) * 1.2;
      const isDistanceReached = deltaX >= threshold;
      const isQuickFlick = deltaX >= 40 && duration < 250;

      if (isHorizontal && (isDistanceReached || isQuickFlick)) {
        // Haptic feedback if supported by browser
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          try {
            navigator.vibrate(15);
          } catch {
            // Ignore vibration permission failures
          }
        }
        onBackRef.current();
      }

      touchStartRef.current.valid = false;
      setGestureState((prev) => ({
        ...prev,
        isSwiping: false,
        progress: 0,
      }));
    };

    const handleTouchCancel = () => {
      touchStartRef.current.valid = false;
      setGestureState((prev) => ({
        ...prev,
        isSwiping: false,
        progress: 0,
      }));
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    window.addEventListener('touchcancel', handleTouchCancel, { passive: true });

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchCancel);
    };
  }, [enabled, edgeWidth, threshold, enableEdgeSwipe, allowAnywhereSwipe]);

  return gestureState;
}

/**
 * Hook to sync modal or view state with browser history (popstate)
 * so Android predictive back and iOS back gestures naturally close the modal/view.
 */
export function useHistoryBackSync(isOpen: boolean, onClose: () => void, modalId: string) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const pushedRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      pushedRef.current = false;
      return;
    }

    // Push an isolated state for this modal
    const stateKey = `modal_${modalId}_${Date.now()}`;
    window.history.pushState({ modalOpen: true, modalId, key: stateKey }, '');
    pushedRef.current = true;

    const handlePopState = (e: PopStateEvent) => {
      if (pushedRef.current) {
        pushedRef.current = false;
        onCloseRef.current();
      }
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      // Clean up history state if closed programmatically without back button
      if (pushedRef.current && window.history.state?.modalOpen) {
        pushedRef.current = false;
        try {
          window.history.back();
        } catch {
          // Ignore
        }
      }
    };
  }, [isOpen, modalId]);
}
