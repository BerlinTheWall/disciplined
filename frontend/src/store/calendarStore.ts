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
// The write target is a *device* calendar OR the connected Outlook account
// (Settings > Connected Calendars > Outlook, via Microsoft Graph OAuth) —
// never both, since mirroring one Task to two places isn't wanted. "device"
// pushes client-side via the native plugin (lib/deviceCalendar.ts); "outlook"
// pushes server-side via lib/api.ts's api.outlook.push (the backend holds
// the Graph tokens, not the device).
export type CalendarWriteTarget =
  { kind: "device"; calendarId: string } | { kind: "outlook" } | null;

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
