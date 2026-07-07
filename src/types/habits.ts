import type { IconKey } from "@/lib/icons";

export interface Habit {
  id: string;
  title: string;
  startMinutes: number;
  durationMinutes: number;
  color: string;
  icon: IconKey;
  daysOfWeek: number[]; // 0 = Sunday ... 6 = Saturday
  reminderMinutesBefore?: number | null; // minutes before start to notify; null/unset = no reminder
  completedDates: string[]; // ISO dates this habit was checked off, e.g. "2026-06-17"
  skippedDates?: string[]; // ISO dates the user deleted just this occurrence for
}
