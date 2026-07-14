import type { IconKey } from "@/lib/icons";

export type Priority = "low" | "medium" | "high";

export interface Task {
  id: string;
  title: string;
  startMinutes: number;
  durationMinutes: number;
  color: string;
  icon: IconKey;
  completed: boolean;
  date: string; // ISO date, e.g. "2026-06-17"
  priority?: Priority | null; // importance; optional — explicit null clears it on the server
  reminderMinutesBefore?: number | null; // minutes before start to notify; null/unset = no reminder
  shoppingListId?: string; // set when this task is a grocery run
  workoutSessionId?: string | null; // set when this task is linked to a workout plan; explicit null clears it on the server
  recipeId?: string | null; // set when this task is linked to a recipe (cooking / meal prep); explicit null clears it on the server
}
