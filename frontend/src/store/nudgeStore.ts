import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { NudgeType, PendingAction } from "@/lib/api";
import { rehydrateOnAccountChange, userScopedStorage } from "@/lib/userScopedStorage";
import { useNotificationHistoryStore } from "@/store/notificationHistoryStore";

// How long an explicitly (or automatically) dismissed nudge stays suppressed
// for that exact subject, so declining once doesn't mean forever.
export const DISMISS_COOLDOWN_DAYS = 3;

export interface NudgeAlert {
  type: NudgeType;
  subjectId: string;
  message: string;
  // Preferred over actionPhrase when present — executed directly via
  // confirmChatActions, no chat round-trip. See NudgeHost's "Yes" handler.
  pendingAction: PendingAction | null;
  // Fallback for types with no single safe one-tap action (opens chat with
  // this phrase instead) — null too for purely informational types, which
  // get a "View" action instead.
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

      setCurrent: (alert) => {
        if (alert) {
          const today = new Date().toISOString().slice(0, 10);
          useNotificationHistoryStore.getState().addEntry({
            id: `${alert.type}:${alert.subjectId}:${today}`,
            kind: "nudge",
            title: "Disciplined noticed something",
            body: alert.message,
            firedAt: Date.now(),
            actionPhrase: alert.actionPhrase,
            nudgeType: alert.type,
            subjectId: alert.subjectId,
          });
        }
        set({ current: alert });
      },
    }),
    {
      name: "disciplined-nudges",
      storage: createJSONStorage(() => userScopedStorage("disciplined-nudges")),
      partialize: (state) => ({
        lastShownDate: state.lastShownDate,
        dismissedUntil: state.dismissedUntil,
      }),
    }
  )
);

rehydrateOnAccountChange(useNudgeStore);
