import { create } from "zustand";
import { persist } from "zustand/middleware";

// A record of a reminder or nudge that actually became visible to the user
// (banner shown, notification delivered, or tapped to reopen the app) — the
// persistent counterpart to ReminderHost's/NudgeHost's transient banners,
// which vanish once dismissed with no other trace.
export interface HistoryEntry {
  id: string; // reminder's alert key, or `${type}:${subjectId}:${date}` for nudges/coach
  kind: "reminder" | "nudge" | "coach";
  title: string;
  body: string;
  firedAt: number; // epoch ms
  read: boolean;
  date?: string; // reminders only — day to jump to
  actionPhrase?: string | null; // nudges/coach only
  nudgeType?: "habit_gap" | "workout_gap" | "goal_pacing"; // nudges only
  subjectId?: string; // nudges only — pairs with nudgeType for the dismiss-cooldown key
  response?: "agreed" | "disagreed"; // nudges/coach only, once the user has acted on it
}

interface NotificationHistoryState {
  entries: HistoryEntry[];
  addEntry: (entry: Omit<HistoryEntry, "read" | "response">) => void;
  markAllRead: () => void;
  setResponse: (id: string, response: "agreed" | "disagreed") => void;
}

const MAX_ENTRIES = 50;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export const useNotificationHistoryStore = create<NotificationHistoryState>()(
  persist(
    (set) => ({
      entries: [],

      addEntry: (entry) =>
        set((state) => {
          const cutoff = Date.now() - MAX_AGE_MS;
          const kept = state.entries.filter((e) => e.id !== entry.id && e.firedAt >= cutoff);
          return { entries: [{ ...entry, read: false }, ...kept].slice(0, MAX_ENTRIES) };
        }),

      markAllRead: () =>
        set((state) => ({ entries: state.entries.map((e) => ({ ...e, read: true })) })),

      setResponse: (id, response) =>
        set((state) => ({
          entries: state.entries.map((e) => (e.id === id ? { ...e, response } : e)),
        })),
    }),
    { name: "disciplined-notification-history" }
  )
);
