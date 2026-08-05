import { create } from "zustand";

import { api } from "@/lib/api";

// Connection status for Settings > Connected Calendars > Google Calendar
// (Google OAuth — see lib/googleCalendarAuth.ts). Mirrors outlookStore.ts —
// kept as its own store rather than a shared/generic one for the same
// reason the two backend services stay separate (see
// backend/app/services/google_calendar.py's docstring).
interface GoogleCalendarState {
  connected: boolean;
  googleAccountEmail?: string;
  loaded: boolean;
  refresh: () => Promise<void>;
}

export const useGoogleCalendarStore = create<GoogleCalendarState>((set) => ({
  connected: false,
  googleAccountEmail: undefined,
  loaded: false,
  refresh: async () => {
    try {
      const status = await api.googleCalendar.status();
      set({
        connected: status.connected,
        googleAccountEmail: status.googleAccountEmail,
        loaded: true,
      });
    } catch {
      set({ loaded: true });
    }
  },
}));
