import { RefreshCw } from "lucide-react";

interface Props {
  distance: number;
  progress: number;
  dragging: boolean;
  refreshing: boolean;
}

// Sits as the first child of a usePullToRefresh-wired scroll container.
// While a finger is actually dragging, height tracks it 1:1 (no easing, so
// it feels physically attached); the moment it's released, dragging goes
// false and this CSS transition takes over to smoothly settle it to the
// refresh height or back to 0 — the same spring-back feel as native
// pull-to-refresh. The icon spins continuously the whole time it's visible,
// not just once refreshing starts.
export default function PullToRefreshIndicator({
  distance,
  progress,
  dragging,
  refreshing,
}: Props) {
  if (distance <= 0) return null;
  return (
    <div
      className={`flex items-center justify-center shrink-0 ${
        dragging ? "" : "transition-[height] duration-300 ease-out"
      }`}
      style={{ height: distance }}
    >
      <RefreshCw
        size={20}
        strokeWidth={1.8}
        className="text-fg-faint animate-spin"
        style={{ opacity: refreshing ? 1 : progress }}
      />
    </div>
  );
}
