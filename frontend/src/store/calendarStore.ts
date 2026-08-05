import { create } from "zustand";
import { persist } from "zustand/middleware";

// Which device calendars (Apple/Google/Outlook — whatever the user has added
// in phone Settings) disciplined is connected to. Read calendars: many,
// one-way mirrored into the backend for AI/timeline awareness (see
// lib/deviceCalendarSync.ts). Write calendar: at most one — disciplined's
// own Tasks get mirrored out to it. Deliberately not the same calendar as
// any read one (see the guard in CalendarSheet.tsx) — writing an event that
// then gets read back in as "external" would be a pointless feedback loop.
interface CalendarState {
  readCalendarIds: string[];
  writeCalendarId: string | null;
  setReadCalendarIds: (ids: string[]) => void;
  toggleReadCalendar: (id: string) => void;
  setWriteCalendarId: (id: string | null) => void;
}

export const useCalendarStore = create<CalendarState>()(
  persist(
    (set, get) => ({
      readCalendarIds: [],
      writeCalendarId: null,
      setReadCalendarIds: (ids) => set({ readCalendarIds: ids }),
      toggleReadCalendar: (id) => {
        const current = get().readCalendarIds;
        set({
          readCalendarIds: current.includes(id)
            ? current.filter((c) => c !== id)
            : [...current, id],
        });
      },
      setWriteCalendarId: (id) => set({ writeCalendarId: id }),
    }),
    { name: "disciplined-calendar-connections" }
  )
);
