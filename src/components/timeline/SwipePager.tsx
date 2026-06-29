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

  function onDragEnd(_: unknown, info: PanInfo) {
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
    <div ref={viewportRef} className="relative overflow-x-clip">
      <motion.div
        className="relative touch-pan-y"
        style={{ x: ctrl.x }}
        drag="x"
        dragDirectionLock
        dragMomentum={false}
        onDragEnd={onDragEnd}
      >
        {/* Each page clips to its own width so edge effects (e.g. the "happening
            now" highlight, which bleeds a few px past the row) don't spill across
            the seam into the neighbouring day. */}
        {/* Current page — normal flow, defines the height. */}
        <div key={pageKey?.(0)} className="overflow-x-clip">{renderPage(0)}</div>
        {/* Previous page — parked just off the left edge. */}
        <div key={pageKey?.(-1)} className="absolute top-0 right-full w-full overflow-x-clip">{renderPage(-1)}</div>
        {/* Next page — parked just off the right edge. */}
        <div key={pageKey?.(1)} className="absolute top-0 left-full w-full overflow-x-clip">{renderPage(1)}</div>
      </motion.div>
    </div>
  );
}
