import { isLightColor } from "./color";
import type { Priority } from "@/types/task";

// Goal priority palette — coral/gold/teal, plus neutral slate for "no
// priority". Vivid on purpose (distinct from the muted task-priority
// colours), since the numbered rank circle is the goal's main visual
// anchor. Deliberately its own hue family, not the red/amber/green a
// goal's pace (GOAL_PACE_COLOR in lib/goalProgress.ts) uses — the two used
// to be the exact same three colors, so a high-priority goal that was also
// behind pace showed identical yellow for two unrelated facts.
export const GOAL_PRIORITY_COLOR: Record<Priority, string> = {
  high: "#ff6b5e", // coral
  medium: "#ffb443", // gold
  low: "#2dd4bf", // teal
};
export const GOAL_NONE_COLOR = "#a1a1aa"; // neutral slate

export const goalColor = (p: Priority | null) => (p ? GOAL_PRIORITY_COLOR[p] : GOAL_NONE_COLOR);

// Sort weight: high first … none last. Used to auto-place new/re-prioritized
// goals before the user drags them.
export const priorityRank = (p: Priority | null): number =>
  p === "high" ? 0 : p === "medium" ? 1 : p === "low" ? 2 : 3;

// The Goals & Plans feature's own identity color (same sage as
// --path-accent, index.css) — moved here from GoalsPage.tsx so anything
// representing "Goals" in aggregate (not one specific goal's own priority)
// can share it.
export const GOAL_ACCENT = "#3fcd9b";
export const GOAL_ACCENT_ON = isLightColor(GOAL_ACCENT) ? "#111827" : "#ffffff";
