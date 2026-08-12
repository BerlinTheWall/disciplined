import { createContext, useRef } from "react";
import {
  animate,
  useMotionValue,
  type AnimationPlaybackControls,
  type MotionValue,
} from "framer-motion";
import { flushSync } from "react-dom";

import { spring } from "@/lib/motion";

export interface SwipeController {
  x: MotionValue<number>;
  onPrev: () => void;
  onNext: () => void;
  settle: (target: number, commit?: () => void) => void;
  // Resolves any in-flight settle right away — its commit (if any) runs
  // synchronously and x snaps to 0 — instead of leaving it to keep animating.
  flushPending: () => void;
}

// A shared controller lets two pagers move together (e.g. the week strip and the
// weekly grid): they bind the same motion value and commit through the same
// handlers. `null` means each pager is independent.
export const WeekSwipeContext = createContext<SwipeController | null>(null);

export function useSwipeController(onPrev: () => void, onNext: () => void): SwipeController {
  const x = useMotionValue(0);
  // The settle animation still in flight, if any — tracked so a new gesture
  // (or another settle) starting mid-animation doesn't leave it running
  // alongside the new one. Both would keep writing to `x` every frame, and
  // the old one's onComplete could still fire mid-drag and stomp the live
  // gesture, which is what made fast repeated swipes look like they got stuck.
  const pendingRef = useRef<{ controls: AnimationPlaybackControls; commit?: () => void } | null>(
    null
  );

  function flushPending() {
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    pending.controls.stop();
    if (pending.commit) {
      // Commit synchronously so the reused panel is repositioned as the
      // current page before we reset the offset — one paint, no flicker.
      flushSync(() => pending.commit!());
      x.set(0);
    }
  }

  function settle(target: number, commit?: () => void) {
    flushPending();
    const controls = animate(x, target, {
      ...spring.gentle,
      onComplete: () => {
        pendingRef.current = null;
        if (commit) {
          flushSync(() => commit());
          x.set(0);
        }
      },
    });
    pendingRef.current = { controls, commit };
  }

  return { x, onPrev, onNext, settle, flushPending };
}
