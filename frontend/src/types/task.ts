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
  // ISO UTC datetime, stamped on every local edit — drives the most-recent-
  // edit-wins calendar reconciliation (backend outlook_graph.py/google_calendar.py,
  // frontend lib/deviceCalendarSync.ts).
  updatedAt?: string;
  // Read-only, set server-side once mirrored to that provider — never
  // written by any UI mutator. Lets deviceCalendarSync.ts skip pushing a
  // task already linked to a *different* provider.
  outlookEventId?: string | null;
  googleEventId?: string | null;
  // Read-only-in-practice: set by lib/deviceCalendarSync.ts once linked to
  // the connected Apple calendar (Apple has no server-side connection row,
  // so this bool is the only place that link is recorded).
  appleLinked?: boolean;
}
