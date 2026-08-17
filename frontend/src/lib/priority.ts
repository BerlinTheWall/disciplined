import { AlertCircle, AlertTriangle, Info } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { Priority } from "@/types/task";

export const PRIORITIES: Priority[] = ["low", "medium", "high"];

// Label + (muted) colour + level icon for each priority level, used by the
// editor and the task displays. Urgency rises with the glyph: circled i,
// circled !, warning triangle. Muted echo of the goal-priority coral/gold/
// teal family (goalPriority.ts) — deliberately NOT the same hex as a
// completed task's color (DayScheduleCards.tsx's DONE_GREEN and its other
// hardcoded copies), which used to collide with "low" here.
export const PRIORITY_META: Record<Priority, { label: string; color: string; icon: LucideIcon }> = {
  low: { label: "Low", color: "#4fae9c", icon: Info }, // muted teal
  medium: { label: "Medium", color: "#d99a3f", icon: AlertCircle }, // muted gold
  high: { label: "High", color: "#d9685a", icon: AlertTriangle }, // muted coral
};

export const DEFAULT_PRIORITY: Priority = "medium";
