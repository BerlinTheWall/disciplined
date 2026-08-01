import { COLOR_OPTIONS } from "@/components/timeline/addItemOptions";
import type { IconKey } from "@/lib/icons";
import type { Priority } from "@/types/task";

// A fully-configured task, one tap away from being added to the schedule —
// no title/time/duration decisions left for the user to make. Built-ins ship
// with the app; users can also turn any task they create into one of these
// (see AddItemSheet's "Save as preset" toggle).
export interface TaskPreset {
  id: string;
  title: string;
  icon: IconKey;
  color: string;
  durationMinutes: number;
  reminderMinutesBefore: number | null;
  priority: Priority | null;
}

// Ids are stable strings (not crypto.randomUUID()) since these are static and
// never change identity across app versions.
export const BUILTIN_PRESETS: TaskPreset[] = [
  {
    id: "builtin-morning-workout",
    title: "Morning workout",
    icon: "workout",
    color: COLOR_OPTIONS[0],
    durationMinutes: 45,
    reminderMinutesBefore: 10,
    priority: null,
  },
  {
    id: "builtin-drink-water",
    title: "Drink water",
    icon: "health",
    color: COLOR_OPTIONS[6],
    durationMinutes: 5,
    reminderMinutesBefore: null,
    priority: null,
  },
  {
    id: "builtin-read",
    title: "Read 20 min",
    icon: "reading",
    color: COLOR_OPTIONS[7],
    durationMinutes: 20,
    reminderMinutesBefore: null,
    priority: null,
  },
  {
    id: "builtin-meditate",
    title: "Meditate",
    icon: "health",
    color: COLOR_OPTIONS[4],
    durationMinutes: 10,
    reminderMinutesBefore: null,
    priority: null,
  },
  {
    id: "builtin-walk",
    title: "Walk",
    icon: "bike",
    color: COLOR_OPTIONS[2],
    durationMinutes: 20,
    reminderMinutesBefore: null,
    priority: null,
  },
  {
    id: "builtin-meal-prep",
    title: "Meal prep",
    icon: "meal",
    color: COLOR_OPTIONS[3],
    durationMinutes: 60,
    reminderMinutesBefore: null,
    priority: null,
  },
  {
    id: "builtin-deep-work",
    title: "Deep work block",
    icon: "work",
    color: COLOR_OPTIONS[5],
    durationMinutes: 90,
    reminderMinutesBefore: 5,
    priority: "high",
  },
  {
    id: "builtin-inbox-zero",
    title: "Inbox zero",
    icon: "work",
    color: COLOR_OPTIONS[8],
    durationMinutes: 20,
    reminderMinutesBefore: null,
    priority: null,
  },
  {
    id: "builtin-stretch",
    title: "Stretch",
    icon: "health",
    color: COLOR_OPTIONS[9],
    durationMinutes: 10,
    reminderMinutesBefore: null,
    priority: null,
  },
  {
    id: "builtin-plan-tomorrow",
    title: "Plan tomorrow",
    icon: "default",
    color: COLOR_OPTIONS[1],
    durationMinutes: 10,
    reminderMinutesBefore: null,
    priority: null,
  },
  {
    id: "builtin-journal",
    title: "Journal",
    icon: "default",
    color: COLOR_OPTIONS[7],
    durationMinutes: 10,
    reminderMinutesBefore: null,
    priority: null,
  },
  {
    id: "builtin-tidy-up",
    title: "Tidy up",
    icon: "default",
    color: COLOR_OPTIONS[4],
    durationMinutes: 15,
    reminderMinutesBefore: null,
    priority: null,
  },
];
