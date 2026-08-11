import { motion } from "framer-motion";
import { RefreshCw } from "lucide-react";

import { spring } from "@/lib/motion";

interface Props {
  distance: number;
  progress: number;
  dragging: boolean;
  refreshing: boolean;
}

// Sits as the first child of a usePullToRefresh-wired scroll container.
// While a finger is actually dragging, height tracks it 1:1 (transition
// duration 0, so it feels physically attached); the moment it's released,
// dragging goes false and a spring takes over — settling to the refresh
// height, or bouncing back to 0 — the same feel as a native pull-to-refresh.
// Stays mounted at height 0 rather than unmounting, so that spring-back
// actually gets to play instead of being cut off mid-animation.
export default function PullToRefreshIndicator({
  distance,
  progress,
  dragging,
  refreshing,
}: Props) {
  return (
    <motion.div
      animate={{ height: distance }}
      transition={dragging ? { duration: 0 } : spring.gentle}
      className="flex items-center justify-center overflow-hidden shrink-0"
    >
      <RefreshCw
        size={20}
        strokeWidth={1.8}
        className="text-fg-faint animate-spin"
        style={{ opacity: refreshing ? 1 : progress }}
      />
    </motion.div>
  );
}
