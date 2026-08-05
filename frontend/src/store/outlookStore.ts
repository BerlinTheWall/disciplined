import { create } from "zustand";

import { api } from "@/lib/api";

// Connection status for Settings > Connected Calendars > Outlook (Microsoft
// Graph OAuth — see lib/outlookAuth.ts). Kept in its own store, separate
// from calendarStore's device-calendar state, since it's backed by a
// different mechanism (server-held OAuth tokens, not a native plugin) and
// refreshed by a different trigger (the appUrlOpen deep-link callback).
interface OutlookState {
  connected: boolean;
  msAccountEmail?: string;
  loaded: boolean;
  refresh: () => Promise<void>;
}

export const useOutlookStore = create<OutlookState>((set) => ({
  connected: false,
  msAccountEmail: undefined,
  loaded: false,
  refresh: async () => {
    try {
      const status = await api.outlook.status();
      set({ connected: status.connected, msAccountEmail: status.msAccountEmail, loaded: true });
    } catch {
      // Offline, or not logged in yet — leave the last-known state as is,
      // just mark that a refresh was attempted.
      set({ loaded: true });
    }
  },
}));
