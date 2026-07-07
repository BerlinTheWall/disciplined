import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { IconKey } from "@/lib/icons";

// A reminder that fired while the app was in the foreground — shown as an
// in-app banner by ReminderHost until dismissed (or auto-expired).
export interface ReminderAlert {
  key: string;
  title: string;
  body: string;
  color: string;
  icon: IconKey;
  date: string; // ISO date of the item, for jump-to-schedule
}

interface ReminderState {
  // Reminder key -> when it fired (ms). Persisted so a reload doesn't re-fire
  // the same reminder; pruned so it doesn't grow forever.
  fired: Record<string, number>;
  // Foreground banners currently on screen. Not persisted.
  alerts: ReminderAlert[];
  markFired: (key: string) => void;
  pushAlert: (alert: ReminderAlert) => void;
  dismissAlert: (key: string) => void;
}

// Anything older than this can never fire again (the grace window is minutes),
// so it's safe to drop from the fired map.
const FIRED_TTL_MS = 2 * 24 * 60 * 60 * 1000;

function prune(fired: Record<string, number>) {
  const cutoff = Date.now() - FIRED_TTL_MS;
  const next: Record<string, number> = {};
  for (const [key, at] of Object.entries(fired)) {
    if (at >= cutoff) next[key] = at;
  }
  return next;
}

export const useReminderStore = create<ReminderState>()(
  persist(
    (set) => ({
      fired: {},
      alerts: [],

      markFired: (key) => set((state) => ({ fired: { ...prune(state.fired), [key]: Date.now() } })),

      pushAlert: (alert) =>
        set((state) =>
          state.alerts.some((a) => a.key === alert.key)
            ? state
            : { alerts: [...state.alerts, alert] }
        ),

      dismissAlert: (key) =>
        set((state) => ({ alerts: state.alerts.filter((a) => a.key !== key) })),
    }),
    {
      name: "disciplined-reminders",
      partialize: (state) => ({ fired: state.fired }),
    }
  )
);
