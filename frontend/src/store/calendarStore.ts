import { create } from "zustand";
import { persist } from "zustand/middleware";

// Which device calendars (Apple/Google/Outlook — whatever the user has added
// in phone Settings) disciplined is connected to. Read calendars: many,
// one-way mirrored into the backend for AI/timeline awareness (see
// lib/deviceCalendarSync.ts). Write target: at most one — disciplined's own
// Tasks get mirrored out to it. Deliberately not the same calendar as any
// read one (see the guard in CalendarSheet.tsx) — writing an event that
// then gets read back in as "external" would be a pointless feedback loop.
//
// The write target is a *device* calendar, the connected Outlook account, or
// the connected Google Calendar account — never more than one at a time,
// since mirroring one Task to several places isn't wanted. "device" pushes
// client-side via the native plugin (lib/deviceCalendar.ts); "outlook" and
// "google" push server-side via api.outlook.push / api.googleCalendar.push
// (the backend holds those tokens, not the device).
export type CalendarWriteTarget =
  { kind: "device"; calendarId: string } | { kind: "outlook" } | { kind: "google" } | null;

interface CalendarState {
  readCalendarIds: string[];
  writeTarget: CalendarWriteTarget;
  setReadCalendarIds: (ids: string[]) => void;
  toggleReadCalendar: (id: string) => void;
  setWriteTarget: (target: CalendarWriteTarget) => void;
}

export const useCalendarStore = create<CalendarState>()(
  persist(
    (set, get) => ({
      readCalendarIds: [],
      writeTarget: null,
      setReadCalendarIds: (ids) => set({ readCalendarIds: ids }),
      toggleReadCalendar: (id) => {
        const current = get().readCalendarIds;
        set({
          readCalendarIds: current.includes(id)
            ? current.filter((c) => c !== id)
            : [...current, id],
        });
      },
      setWriteTarget: (target) => set({ writeTarget: target }),
    }),
    { name: "disciplined-calendar-connections" }
  )
);
