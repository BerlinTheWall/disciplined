import { useCallback, useEffect, useRef, useState } from "react";

// Pull distance (px, already resistance-scaled) needed to trigger a refresh
// on release.
export const PULL_THRESHOLD = 70;
// Visual cap — pulling further than this doesn't move the indicator any more.
const MAX_PULL = 110;
// Finger travel feels heavier than a 1:1 follow, like native pull-to-refresh.
const RESISTANCE = 0.5;

// Drives a pull-to-refresh gesture on a scrollable container. Returns a
// callback ref (not a plain useRef + effect) because the container this
// attaches to in App.tsx is re-mounted on every page switch — AnimatePresence
// gives it a fresh `key` — so listeners need to be torn down and reattached
// each time the underlying DOM node changes, which is exactly what a
// callback ref does automatically and a one-shot effect would not.
export function usePullToRefresh(onRefresh: () => Promise<void>) {
  const [pull, setPull] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Always-fresh handler without re-running the attach/detach effect below.
  const onRefreshRef = useRef(onRefresh);
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  });

  const cleanupRef = useRef<() => void>(() => {});

  const containerRef = useCallback((el: HTMLDivElement | null) => {
    cleanupRef.current();
    cleanupRef.current = () => {};
    if (!el) return;

    // Local (non-React-state) tracking for the gesture itself — touchmove
    // fires far too often to route every sample through setState first.
    const gesture = { startY: null as number | null, active: false, pull: 0 };

    function onTouchStart(e: TouchEvent) {
      if (el!.scrollTop > 0) return;
      gesture.startY = e.touches[0].clientY;
      gesture.active = true;
    }

    function onTouchMove(e: TouchEvent) {
      if (!gesture.active || gesture.startY === null) return;
      if (el!.scrollTop > 0) {
        // Scrolled away mid-gesture (e.g. content grew) — abandon the pull.
        gesture.active = false;
        gesture.pull = 0;
        setDragging(false);
        setPull(0);
        return;
      }
      const delta = e.touches[0].clientY - gesture.startY;
      if (delta <= 0) {
        gesture.pull = 0;
        setPull(0);
        return;
      }
      // Only now — once it's clearly a downward pull at the very top — steal
      // the gesture from native scroll/bounce.
      e.preventDefault();
      setDragging(true);
      gesture.pull = Math.min(delta * RESISTANCE, MAX_PULL);
      setPull(gesture.pull);
    }

    async function onTouchEnd() {
      if (!gesture.active) return;
      gesture.active = false;
      gesture.startY = null;
      setDragging(false);
      if (gesture.pull < PULL_THRESHOLD) {
        setPull(0);
        return;
      }
      setPull(PULL_THRESHOLD); // hold the indicator in place while refreshing
      setRefreshing(true);
      try {
        await onRefreshRef.current();
      } finally {
        setRefreshing(false);
        setPull(0);
      }
    }

    // touchmove must be non-passive — this is the one browsers otherwise
    // treat as passive by default, and preventDefault() inside a passive
    // listener is a silent no-op (the page would scroll/bounce underneath).
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });
    cleanupRef.current = () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, []);

  return { containerRef, pull, dragging, refreshing };
}
