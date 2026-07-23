import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface NudgeAlert {
  type: "habit_gap" | "workout_gap" | "goal_pacing";
  subjectId: string;
  message: string;
  // null for goal_pacing — it gets a "View" action instead of a chat send.
  actionPhrase: string | null;
}

interface NudgeState {
  // Date (ISO) a nudge was last shown — at most one per calendar day, and the
  // gate that keeps a quiet day from ever reaching Gemini more than once.
  lastShownDate: string | null;
  // "{type}:{subjectId}" -> ISO date the suppression lasts until (exclusive).
  dismissedUntil: Record<string, string>;
  // The on-screen banner, not persisted — a session-only render concern.
  current: NudgeAlert | null;
  markShown: (date: string) => void;
  dismiss: (key: string, untilDate: string) => void;
  setCurrent: (alert: NudgeAlert | null) => void;
}

export const useNudgeStore = create<NudgeState>()(
  persist(
    (set) => ({
      lastShownDate: null,
      dismissedUntil: {},
      current: null,

      markShown: (date) => set({ lastShownDate: date }),

      dismiss: (key, untilDate) =>
        set((state) => ({
          dismissedUntil: { ...state.dismissedUntil, [key]: untilDate },
        })),

      setCurrent: (alert) => set({ current: alert }),
    }),
    {
      name: "disciplined-nudges",
      partialize: (state) => ({
        lastShownDate: state.lastShownDate,
        dismissedUntil: state.dismissedUntil,
      }),
    }
  )
);
