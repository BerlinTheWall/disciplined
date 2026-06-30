import type { Priority } from "@/types/task";

export const PRIORITIES: Priority[] = ["low", "medium", "high"];

// Label + (muted) colour for each priority level, used by the editor and the
// task displays.
export const PRIORITY_META: Record<Priority, { label: string; color: string }> = {
  low: { label: "Low", color: "#5f8c78" }, // muted green
  medium: { label: "Medium", color: "#b3a062" }, // muted gold
  high: { label: "High", color: "#a87070" }, // muted red
};

export const DEFAULT_PRIORITY: Priority = "medium";
