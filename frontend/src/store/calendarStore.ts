import { create } from "zustand";
import { persist } from "zustand/middleware";

// The one Apple/iCloud calendar (iOS only) disciplined is connected to, plus
// the connected Outlook/Google accounts (see outlookStore.ts /
// googleCalendarStore.ts for those). Any connected provider syncs two-way —
// its events become real Tasks, and Task edits/deletes flow back out — see
// lib/deviceCalendarSync.ts (Apple, client-side) and
// backend/app/services/outlook_graph.py / google_calendar.py (Outlook/Google,
// server-side).
//
// The write target only controls where a brand-new Task with no provider
// link yet gets pushed — it does NOT gate syncing for Tasks already linked
// to a connected-but-non-write-target provider, those keep syncing
// regardless. Never more than one write target at a time, since mirroring a
// new Task to several places isn't wanted. "apple" pushes client-side via
// the native plugin (lib/deviceCalendar.ts); "outlook" and "google" push
// server-side via api.outlook.reconcile / api.googleCalendar.reconcile (the
// backend holds those tokens, not the device).
export type CalendarWriteTarget =
  { kind: "apple"; calendarId: string } | { kind: "outlook" } | { kind: "google" } | null;

interface CalendarState {
  appleCalendarId: string | null;
  writeTarget: CalendarWriteTarget;
  setAppleCalendarId: (id: string | null) => void;
  setWriteTarget: (target: CalendarWriteTarget) => void;
}

export const useCalendarStore = create<CalendarState>()(
  persist(
    (set) => ({
      appleCalendarId: null,
      writeTarget: null,
      setAppleCalendarId: (id) => set({ appleCalendarId: id }),
      setWriteTarget: (target) => set({ writeTarget: target }),
    }),
    { name: "disciplined-calendar-connections" }
  )
);
