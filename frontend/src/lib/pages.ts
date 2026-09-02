import { CalendarDays, Flame, Target } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type Page = "home" | "goals" | "schedule" | "habits" | "profile";

export const PAGE_ORDER: Page[] = ["home", "goals", "schedule", "habits", "profile"];

// Side-menu entries.
export const ALL_TABS: { id: Page; icon: LucideIcon; label: string; locked?: boolean }[] = [
  { id: "habits", icon: Flame, label: "Habits" },
  { id: "goals", icon: Target, label: "Goals & Plans" },
  { id: "schedule", icon: CalendarDays, label: "Schedule" },
];
