import type { ScheduleRowData } from "./ScheduleRow";
import { parseISODate } from "@/lib/date";
import { getHabitStreak, isHabitActiveOnDate } from "@/lib/habits";
import type { Habit } from "@/types/habits";
import type { Task } from "@/types/task";

// A day's schedule rows: its tasks plus the habits active that day, mapped to
// the common row shape and sorted by start time. Shared by the daily timeline
// and the card-style day view so both always agree on what a day contains.
export function buildDayRows(tasks: Task[], habits: Habit[], date: string): ScheduleRowData[] {
  const dateObj = parseISODate(date);

  const taskItems: ScheduleRowData[] = tasks.filter((t) => t.date === date);

  const habitItems: ScheduleRowData[] = habits
    .filter((h) => isHabitActiveOnDate(h, dateObj))
    .map((h) => ({
      id: h.id,
      title: h.title,
      startMinutes: h.startMinutes,
      durationMinutes: h.durationMinutes,
      color: h.color,
      icon: h.icon,
      completed: h.completedDates.includes(date),
      streak: getHabitStreak(h, dateObj),
    }));

  return [...taskItems, ...habitItems].sort((a, b) => a.startMinutes - b.startMinutes);
}
