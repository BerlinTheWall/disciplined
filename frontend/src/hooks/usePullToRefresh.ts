import { useCallback, useEffect, useRef, useState } from "react";

const THRESHOLD = 56; // px pulled before release triggers a refresh
const MAX_PULL = 80; // indicator caps out here even if pulled further
const RESISTANCE = 0.5; // finger has to travel further than the indicator moves
const MIN_REFRESH_MS = 1000; // hold the spinner at least this long, so a fast local sync doesn't just flicker

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

interface PullToRefresh {
  // Named `attach` rather than `ref` so it doesn't read like a ref value
  // itself — it's a callback to pass to the scrollable element's `ref` prop.
  attach: (node: HTMLElement | null) => void;
  distance: number; // current indicator height, in px
  progress: number; // 0-1 toward the release threshold
  dragging: boolean; // finger is actively down and pulling — track it 1:1, no easing
  refreshing: boolean;
}

// Pull-to-refresh gesture for the app's scrollable page containers: dragging
// down past the threshold while already at the top re-syncs data from the
// backend (see lib/sync.ts's reloadAll) — a data refresh, not a webview
// reload. Pass the returned `attach` to the scrollable element's `ref` prop
// and render an indicator sized off `distance`/`progress`.
export function usePullToRefresh(onRefresh: () => Promise<unknown>): PullToRefresh {
  const [distance, setDistance] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Read fresh on every gesture without re-subscribing the DOM listeners.
  const onRefreshRef = useRef(onRefresh);
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  const startX = useRef(0);
  const startY = useRef(0);
  const tracking = useRef(false); // touch started at scrollTop 0
  const active = useRef(false); // gesture has moved into a real pull
  const busy = useRef(false); // a refresh is in flight — ignore new gestures

  const handleStart = useCallback((e: TouchEvent) => {
    if (busy.current || e.touches.length !== 1) {
      tracking.current = false;
      return;
    }
    const outer = e.currentTarget as HTMLElement;
    // This hook only ever sees `outer`'s own scrollTop — fine when `outer`
    // is the page's one scrollable region, but a page can now size itself
    // to fill exactly its available height (see useFillRemainingHeight) and
    // put its own independent overflow-y-auto box inside that, e.g.
    // PeriodOverview's rail. `outer`.scrollTop is permanently 0 in that
    // case, so every downward swipe anywhere on the page — including ones
    // meant to scroll that nested box — would otherwise read as "already at
    // the top, start pulling". Walk up from the actual touch target and
    // hand the gesture entirely to the nearest real scrollable ancestor
    // instead, if there is one before reaching `outer`.
    let node = e.target as HTMLElement | null;
    while (node && node !== outer) {
      const style = getComputedStyle(node);
      const scrollable =
        (style.overflowY === "auto" || style.overflowY === "scroll") &&
        node.scrollHeight > node.clientHeight;
      if (scrollable) {
        tracking.current = false;
        return;
      }
      node = node.parentElement;
    }
    tracking.current = outer.scrollTop <= 0;
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    active.current = false;
  }, []);

  const handleMove = useCallback((e: TouchEvent) => {
    if (!tracking.current) return;
    const el = e.currentTarget as HTMLElement;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;
    // A horizontal-dominant gesture is a page/week swipe, not a pull — bail
    // out for the rest of this touch sequence, however slight its vertical
    // component. Without this, swiping the week strip (which sits right at
    // scrollTop 0) reads as a downward pull and drags the indicator/page
    // along with it.
    if (!active.current && Math.abs(dx) > Math.abs(dy)) {
      tracking.current = false;
      return;
    }
    if (dy <= 0 || el.scrollTop > 0) {
      if (active.current) {
        active.current = false;
        setDragging(false);
        setDistance(0);
      }
      return;
    }
    // Own the gesture once it's unambiguously a downward pull from the top —
    // preventDefault stops the native rubber-band bounce so it doesn't fight
    // with the indicator underneath it.
    if (!active.current) {
      active.current = true;
      setDragging(true);
    }
    e.preventDefault();
    setDistance(Math.min(dy * RESISTANCE, MAX_PULL));
  }, []);

  const handleEnd = useCallback(() => {
    tracking.current = false;
    if (!active.current) return;
    active.current = false;
    // Dropping out of "dragging" here (rather than after the refresh settles)
    // is what lets the indicator spring-animate the snap-to-threshold /
    // spring-back-to-0 that follows — it tracks the finger 1:1 while
    // dragging is true and eases everything else.
    setDragging(false);
    setDistance((d) => {
      if (d < THRESHOLD) return 0;
      busy.current = true;
      setRefreshing(true);
      // Wait for both the real sync and a minimum hold time, so the spinner
      // stays put for a beat even when the sync itself finishes instantly —
      // otherwise it would flash and vanish before it reads as "it worked".
      void Promise.all([onRefreshRef.current(), wait(MIN_REFRESH_MS)])
        .catch(() => {})
        .finally(() => {
          busy.current = false;
          setRefreshing(false);
          setDistance(0);
        });
      return THRESHOLD;
    });
  }, []);

  const attach = useCallback(
    (node: HTMLElement | null) => {
      if (!node) return;
      node.addEventListener("touchstart", handleStart, { passive: true });
      node.addEventListener("touchmove", handleMove, { passive: false });
      node.addEventListener("touchend", handleEnd, { passive: true });
      node.addEventListener("touchcancel", handleEnd, { passive: true });
      return () => {
        node.removeEventListener("touchstart", handleStart);
        node.removeEventListener("touchmove", handleMove);
        node.removeEventListener("touchend", handleEnd);
        node.removeEventListener("touchcancel", handleEnd);
      };
    },
    [handleStart, handleMove, handleEnd]
  );

  return {
    attach,
    distance,
    progress: Math.min(distance / THRESHOLD, 1),
    dragging,
    refreshing,
  };
}
