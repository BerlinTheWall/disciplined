import { addDays, toISODate } from './date'
import type { Habit } from '../types/habits'

export function isHabitActiveOnDate(habit: Habit, date: Date) {
  if (!habit.daysOfWeek.includes(date.getDay())) return false
  // A single occurrence the user deleted for just that day is no longer active.
  if (habit.skippedDates?.includes(toISODate(date))) return false
  return true
}

export function getHabitStreak(habit: Habit, referenceDate: Date = new Date()) {
  let cursor = new Date(referenceDate)
  cursor.setHours(0, 0, 0, 0)

  // Don't let an unfinished "today" zero out an otherwise intact streak —
  // start counting from yesterday if today hasn't been checked off yet.
  if (isHabitActiveOnDate(habit, cursor) && !habit.completedDates.includes(toISODate(cursor))) {
    cursor = addDays(cursor, -1)
  }

  let streak = 0
  while (streak < 3650) {
    if (isHabitActiveOnDate(habit, cursor)) {
      if (habit.completedDates.includes(toISODate(cursor))) {
        streak++
      } else {
        break
      }
    }
    cursor = addDays(cursor, -1)
  }
  return streak
}