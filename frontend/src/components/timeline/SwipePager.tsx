import { useRef } from "react";
import type { ReactNode } from "react";
import { motion, type PanInfo } from "framer-motion";

import { useSwipeController, type SwipeController } from "./swipeController";

const COMMIT_RATIO = 0.3; // fraction of the width dragged to commit
const COMMIT_MAX = 140; // …but never require more than this many px
const SWIPE_VELOCITY = 500; // …or a fast flick commits regardless of distance

const noop = () => {};

interface SwipePagerProps {
  // Renders the page at the given offset from the current one: -1 = previous,
  // 0 = current, +1 = next.
  renderPage: (offset: -1 | 0 | 1) => ReactNode;
  // Used only when this pager manages its own drag (no shared controller).
  onPrev?: () => void;
  onNext?: () => void;
  // A stable identity per page (e.g. its date). When provided, React reuses the
  // already-rendered neighbour as the new current page after a commit instead of
  // remounting it — so its contents don't replay their entrance animation.
  pageKey?: (offset: -1 | 0 | 1) => string;
  // When set, this pager shares drag state with others using the same
  // controller, so they move and commit together.
  controller?: SwipeController | null;
}

// A horizontally swipeable pager: the current page sits in normal flow (and
// defines the height), while the previous/next pages are parked just off each
// edge. Dragging follows the finger 1:1, revealing the neighbour; on release it
// snaps to the committed page or back, then swaps content seamlessly.
export default function SwipePager({
  renderPage,
  onPrev,
  onNext,
  pageKey,
  controller,
}: SwipePagerProps) {
  const internal = useSwipeController(onPrev ?? noop, onNext ?? noop);
  const ctrl = controller ?? internal;
  const viewportRef = useRef<HTMLDivElement>(null);

  // The drag surface allows native vertical panning to pass through (see
  // touch-pan-y below) so the page can still be scrolled by touching it —
  // but that means a horizontal swipe, which never has a perfectly straight
  // finger path, also nudges the page up/down as it goes, reading as wiggle.
  // While a horizontal drag is live, pin the ancestor scroller's scrollTop
  // back to where it was when the drag started, cancelling that creep out
  // every frame without blocking real vertical scrolls the rest of the time.
  const lockedScrollTopRef = useRef<number | null>(null);

  function onDragStart() {
    // A prior settle may still be animating (fast repeated swipes) — resolve
    // it immediately rather than letting it keep running alongside this new
    // drag, which is what caused the strip to visibly get stuck.
    ctrl.flushPending();
    const scroller = viewportRef.current?.closest("[data-scroll-lock]") as HTMLElement | null;
    lockedScrollTopRef.current = scroller?.scrollTop ?? null;
  }

  function onDrag() {
    if (lockedScrollTopRef.current === null) return;
    const scroller = viewportRef.current?.closest("[data-scroll-lock]") as HTMLElement | null;
    if (scroller) scroller.scrollTop = lockedScrollTopRef.current;
  }

  function onDragEnd(_: unknown, info: PanInfo) {
    lockedScrollTopRef.current = null;
    const w = viewportRef.current?.offsetWidth ?? 0;
    const threshold = Math.min(w * COMMIT_RATIO, COMMIT_MAX);
    if (info.offset.x <= -threshold || info.velocity.x <= -SWIPE_VELOCITY) {
      ctrl.settle(-w, ctrl.onNext);
    } else if (info.offset.x >= threshold || info.velocity.x >= SWIPE_VELOCITY) {
      ctrl.settle(w, ctrl.onPrev);
    } else {
      ctrl.settle(0);
    }
  }

  return (
    // min-h-full: when the host scroll area has a definite height (the daily
    // schedule inside its flex-1 scroller) but a day's content is shorter
    // than the viewport, this stretches the drag surface down to fill it —
    // otherwise the swipe gesture only registers over the content itself,
    // leaving the empty space below unswipeable. In contexts with no definite
    // parent height (e.g. the week strip), the percentage has no effect, so
    // this is a no-op there.
    <div ref={viewportRef} className="relative overflow-x-clip min-h-full flex flex-col">
      <motion.div
        className="relative touch-pan-y flex-1 flex flex-col"
        style={{ x: ctrl.x }}
        drag="x"
        dragDirectionLock
        dragMomentum={false}
        onDragStart={onDragStart}
        onDrag={onDrag}
        onDragEnd={onDragEnd}
      >
        {/* Each page clips to its own width so edge effects (e.g. the "happening
            now" highlight, which bleeds a few px past the row) don't spill across
            the seam into the neighbouring day. The px-1 inset means neighbouring
            pages — parked flush against each other — leave an 8px gap at the seam
            (4px each side), so content doesn't touch as it slides past. */}
        {/* Current page — normal flow, defines the height. */}
        <div key={pageKey?.(0)} className="overflow-x-clip px-1 flex-1 flex flex-col">
          {renderPage(0)}
        </div>
        {/* Previous page — parked just off the left edge. */}
        <div
          key={pageKey?.(-1)}
          className="absolute top-0 right-full w-full h-full overflow-x-clip px-1"
        >
          {renderPage(-1)}
        </div>
        {/* Next page — parked just off the right edge. */}
        <div
          key={pageKey?.(1)}
          className="absolute top-0 left-full w-full h-full overflow-x-clip px-1"
        >
          {renderPage(1)}
        </div>
      </motion.div>
    </div>
  );
}
