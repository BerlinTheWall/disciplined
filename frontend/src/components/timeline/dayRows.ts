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

// Other items (tasks, plus habit occurrences active that day) whose time
// range overlaps the given one — used to warn before saving something that
// double-books a slot. `excludeId` skips the item being edited so saving it
// in place doesn't flag itself as its own conflict.
export function findTimeConflicts(
  tasks: Task[],
  habits: Habit[],
  date: string,
  startMinutes: number,
  durationMinutes: number,
  excludeId?: string
): ScheduleRowData[] {
  const end = startMinutes + durationMinutes;
  return buildDayRows(tasks, habits, date).filter((item) => {
    if (item.id === excludeId) return false;
    const itemEnd = item.startMinutes + item.durationMinutes;
    return startMinutes < itemEnd && item.startMinutes < end;
  });
}
