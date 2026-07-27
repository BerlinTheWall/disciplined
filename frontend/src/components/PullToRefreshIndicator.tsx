import { RefreshCw } from "lucide-react";

import { PULL_THRESHOLD } from "@/hooks/usePullToRefresh";

// The little floating spinner a pull gesture reveals from behind the header.
// No transition while actively dragging (it must track the finger exactly,
// 1:1); once released, a CSS transition takes over for the snap-back/settle.
export default function PullToRefreshIndicator({
  pull,
  dragging,
  refreshing,
}: {
  pull: number;
  dragging: boolean;
  refreshing: boolean;
}) {
  const progress = Math.min(pull / PULL_THRESHOLD, 1);
  const offset = (refreshing ? PULL_THRESHOLD : pull) - 40;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center overflow-hidden h-0">
      <div
        className={`w-9 h-9 rounded-full bg-surface shadow-soft border border-border-strong flex items-center justify-center text-fg-muted ${
          dragging ? "" : "transition-transform duration-200 ease-out"
        }`}
        style={{
          transform: `translateY(${offset}px)`,
          opacity: refreshing ? 1 : progress,
          marginTop: "env(safe-area-inset-top)",
        }}
      >
        <RefreshCw
          size={16}
          className={refreshing ? "animate-spin" : ""}
          style={refreshing ? undefined : { transform: `rotate(${progress * 180}deg)` }}
        />
      </div>
    </div>
  );
}
