import { AlertCircle, AlertTriangle, Info } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { Priority } from "@/types/task";

export const PRIORITIES: Priority[] = ["low", "medium", "high"];

// Label + (muted) colour + level icon for each priority level, used by the
// editor and the task displays. Urgency rises with the glyph: circled i,
// circled !, warning triangle.
export const PRIORITY_META: Record<Priority, { label: string; color: string; icon: LucideIcon }> =
  {
    low: { label: "Low", color: "#5f8c78", icon: Info }, // muted green
    medium: { label: "Medium", color: "#b3a062", icon: AlertCircle }, // muted gold
    high: { label: "High", color: "#a87070", icon: AlertTriangle }, // muted red
  };

export const DEFAULT_PRIORITY: Priority = "medium";
