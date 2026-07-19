import type { Priority } from "@/types/task";

// Goal priority palette — a traffic-light plus blue for "no priority".
// Vivid on purpose (distinct from the muted task-priority colours), since the
// numbered rank circle is the goal's main visual anchor.
export const GOAL_PRIORITY_COLOR: Record<Priority, string> = {
  high: "#f87171", // red
  medium: "#fbbf24", // yellow
  low: "#4ade80", // green
};
export const GOAL_NONE_COLOR = "#60a5fa"; // blue

export const goalColor = (p: Priority | null) => (p ? GOAL_PRIORITY_COLOR[p] : GOAL_NONE_COLOR);

// Sort weight: high first … none last. Used to auto-place new/re-prioritized
// goals before the user drags them.
export const priorityRank = (p: Priority | null): number =>
  p === "high" ? 0 : p === "medium" ? 1 : p === "low" ? 2 : 3;
