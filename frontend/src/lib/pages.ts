import { CalendarDays, Dumbbell, Flame, Target, UtensilsCrossed, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type Page =
  "home" | "goals" | "kitchen" | "workout" | "schedule" | "habits" | "expenses" | "profile";

export const PAGE_ORDER: Page[] = [
  "home",
  "goals",
  "kitchen",
  "workout",
  "schedule",
  "habits",
  "expenses",
  "profile",
];

// Side-menu entries. `locked` ones show a padlock and aren't navigable yet.
export const ALL_TABS: { id: Page; icon: LucideIcon; label: string; locked?: boolean }[] = [
  { id: "goals", icon: Target, label: "Goals & Plans" },
  { id: "kitchen", icon: UtensilsCrossed, label: "Meals" },
  { id: "workout", icon: Dumbbell, label: "Workout", locked: true },
  { id: "schedule", icon: CalendarDays, label: "Schedule" },
  { id: "habits", icon: Flame, label: "Habits" },
  { id: "expenses", icon: Wallet, label: "Expenses", locked: true },
];
