import { useEffect, useRef } from "react";

interface Options {
  enabled?: boolean;
  edgeWidth?: number; // how close to the left edge (px) the touch must start
  threshold?: number; // how far right (px) it must travel to trigger
}

// Fires `onOpen` on a left-edge swipe: a touch that starts within `edgeWidth`
// of the left screen edge and drags right past `threshold` while staying mostly
// horizontal. Listeners are passive, so they never block normal taps or scrolls
// — the callback runs only once the rightward pull is unambiguous. Used for the
// side-menu drawer gesture.
export function useLeftEdgeSwipe(
  onOpen: () => void,
  { enabled = true, edgeWidth = 24, threshold = 60 }: Options = {}
) {
  // Keep the latest callback without re-subscribing the listeners each render.
  const onOpenRef = useRef(onOpen);
  useEffect(() => {
    onOpenRef.current = onOpen;
  });

  useEffect(() => {
    if (!enabled) return;

    let startX = 0;
    let startY = 0;
    let tracking = false;

    function onStart(e: TouchEvent) {
      if (e.touches.length !== 1) {
        tracking = false;
        return;
      }
      const t = e.touches[0];
      tracking = t.clientX <= edgeWidth;
      startX = t.clientX;
      startY = t.clientY;
    }

    function onMove(e: TouchEvent) {
      if (!tracking) return;
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      // A mostly-vertical move is a scroll, not a drawer pull — let it go.
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 12) {
        tracking = false;
        return;
      }
      if (dx >= threshold) {
        tracking = false;
        onOpenRef.current();
      }
    }

    function onEnd() {
      tracking = false;
    }

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [enabled, edgeWidth, threshold]);
}
