import { addDays, toISODate } from "./date";
import type { Habit } from "@/types/habits";

// Monday-start week boundary, matching the app's convention elsewhere (see
// lib/date.ts's getWeekDates).
function mondayOf(d: Date): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() - ((copy.getDay() + 6) % 7));
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

// Single source of truth for "does this habit have an occurrence on this
// date". Mirrored exactly by backend/app/services/tools.py::habit_active_on
// — keep both in sync if this changes.
//
// freq="weekly" + interval<=1 (or no anchorDate) is byte-for-byte the
// original weekday-only check, so every pre-existing habit behaves
// identically to before this was added.
export function isHabitActiveOnDate(habit: Habit, date: Date) {
  if (habit.skippedDates?.includes(toISODate(date))) return false;
  const freq = habit.freq ?? "weekly";
  const interval = Math.max(1, habit.interval ?? 1);

  if (freq === "monthly") {
    if (!habit.anchorDate) return false;
    const anchor = new Date(habit.anchorDate + "T00:00:00");
    const monthDiff =
      (date.getFullYear() - anchor.getFullYear()) * 12 + (date.getMonth() - anchor.getMonth());
    if (monthDiff < 0 || monthDiff % interval !== 0) return false;
    const targetDay = Math.min(anchor.getDate(), daysInMonth(date.getFullYear(), date.getMonth()));
    return date.getDate() === targetDay;
  }

  if (!habit.daysOfWeek.includes(date.getDay())) return false;
  if (interval <= 1 || !habit.anchorDate) return true;
  const anchor = new Date(habit.anchorDate + "T00:00:00");
  const weekDiff = Math.round(
    (mondayOf(date).getTime() - mondayOf(anchor).getTime()) / (86_400_000 * 7)
  );
  return weekDiff >= 0 && weekDiff % interval === 0;
}

export function getHabitStreak(habit: Habit, referenceDate: Date = new Date()) {
  let cursor = new Date(referenceDate);
  cursor.setHours(0, 0, 0, 0);

  // Don't let an unfinished "today" zero out an otherwise intact streak —
  // start counting from yesterday if today hasn't been checked off yet.
  if (isHabitActiveOnDate(habit, cursor) && !habit.completedDates.includes(toISODate(cursor))) {
    cursor = addDays(cursor, -1);
  }

  // Guard on iterations (not the streak count) so a habit with no active days
  // can't spin this loop forever.
  let streak = 0;
  let guard = 0;
  while (guard++ < 3650) {
    if (isHabitActiveOnDate(habit, cursor)) {
      if (habit.completedDates.includes(toISODate(cursor))) {
        streak++;
      } else {
        break;
      }
    }
    cursor = addDays(cursor, -1);
  }
  return streak;
}
