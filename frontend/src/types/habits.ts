import type { IconKey } from "@/lib/icons";

export interface Habit {
  id: string;
  title: string;
  startMinutes: number;
  durationMinutes: number;
  color: string;
  icon: IconKey;
  daysOfWeek: number[]; // 0 = Sunday ... 6 = Saturday; ignored when freq is "monthly"
  // Recurrence beyond "every week": freq picks the unit, interval how many of
  // them between occurrences (freq=weekly + interval=2 = every other week;
  // freq=monthly + interval=6 = every 6 months). Omitted/undefined = weekly,
  // interval 1 — the original always-on weekday model.
  freq?: "weekly" | "monthly";
  interval?: number;
  // The cycle's first occurrence, the reference point interval math counts
  // from. Only meaningful when interval > 1 or freq is "monthly".
  anchorDate?: string | null;
  reminderMinutesBefore?: number | null; // minutes before start to notify; null/unset = no reminder
  completedDates: string[]; // ISO dates this habit was checked off, e.g. "2026-06-17"
  skippedDates?: string[]; // ISO dates the user deleted just this occurrence for
  workoutSessionId?: string | null; // set when this habit is linked to a workout plan; explicit null clears it on the server
  recipeId?: string | null; // set when this habit is linked to a recipe (cooking / meal prep); explicit null clears it on the server
}
