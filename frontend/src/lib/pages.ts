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
  { id: "habits", icon: Flame, label: "Habits" },
  { id: "goals", icon: Target, label: "Goals & Plans" },
  { id: "kitchen", icon: UtensilsCrossed, label: "Meals", locked: true },
  { id: "workout", icon: Dumbbell, label: "Workout", locked: true },
  { id: "schedule", icon: CalendarDays, label: "Schedule" },
  { id: "expenses", icon: Wallet, label: "Expenses", locked: true },
];

// Progressive unlock ("earn the right to add complexity"): a brand-new
// account only has Schedule for real at first — Habits and Goals stay
// locked (same padlock treatment as ALL_TABS' permanently-locked entries)
// until this many days have passed since onboarding finished. Distinct from
// ALL_TABS.locked, which is permanent and product-scoped (Meals/Workout/
// Expenses) rather than per-user and time-based.
export const UNLOCK_AFTER_DAYS: Partial<Record<Page, number>> = {
  habits: 3,
  goals: 6,
};

export function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
}

// completedAt is null both before onboarding finishes and, transiently, for
// the instant a fresh account is created — either way, nothing progressive
// is unlocked yet.
export function isProgressivelyLocked(id: Page, completedAt: string | null): boolean {
  const need = UNLOCK_AFTER_DAYS[id];
  if (need === undefined) return false;
  if (completedAt === null) return true;
  return daysSince(completedAt) < need;
}
