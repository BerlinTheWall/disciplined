import {
  CalendarDays,
  ChefHat,
  Dumbbell,
  Flame,
  Package,
  Target,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type Page =
  | "home"
  | "goals"
  | "meals"
  | "recipes"
  | "food"
  | "workout"
  | "schedule"
  | "habits"
  | "expenses"
  | "profile";

export const PAGE_ORDER: Page[] = [
  "home",
  "goals",
  "meals",
  "recipes",
  "food",
  "workout",
  "schedule",
  "habits",
  "expenses",
  "profile",
];

export const ALL_TABS: { id: Page; icon: LucideIcon; label: string }[] = [
  { id: "goals", icon: Target, label: "Goals & Plans" },
  { id: "meals", icon: UtensilsCrossed, label: "Meals" },
  { id: "recipes", icon: ChefHat, label: "Recipes" },
  { id: "food", icon: Package, label: "Food & Products" },
  { id: "workout", icon: Dumbbell, label: "Workout" },
  { id: "schedule", icon: CalendarDays, label: "Schedule" },
  { id: "habits", icon: Flame, label: "Habits" },
  { id: "expenses", icon: Wallet, label: "Expenses" },
];
