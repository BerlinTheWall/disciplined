import type { IconKey } from "@/lib/icons";

export interface Task {
  id: string;
  title: string;
  startMinutes: number;
  durationMinutes: number;
  color: string;
  icon: IconKey;
  completed: boolean;
  date: string; // ISO date, e.g. "2026-06-17"
  shoppingListId?: string; // set when this task is a grocery run
  workoutSessionId?: string; // set when this task is linked to a workout plan
  recipeId?: string; // set when this task is linked to a recipe (cooking / meal prep)
}
