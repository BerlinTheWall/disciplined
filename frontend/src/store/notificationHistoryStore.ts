import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { NudgeType, PendingAction } from "@/lib/api";
import { isPendingActionStale } from "@/lib/pendingAction";
import { rehydrateOnAccountChange, userScopedStorage } from "@/lib/userScopedStorage";

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
  // reminders only — the underlying task/habit id, so tapping the
  // notification can scroll it into view on the schedule page (see
  // scheduleFocusStore) instead of just landing on the right day.
  itemId?: string;
  // One-tap action (nudges/coach only) — preferred over actionPhrase when
  // present, executed directly via confirmChatActions (see lib/pendingAction).
  pendingAction?: PendingAction | null;
  actionPhrase?: string | null; // nudges/coach only, when there's no pendingAction
  nudgeType?: NudgeType; // nudges only
  subjectId?: string; // nudges only — pairs with nudgeType for the dismiss-cooldown key
  // Nudges/coach only, once the user has acted on it. In practice only
  // "agreed" is ever written now — a discard deletes the entry instead of
  // marking it — so "disagreed" survives solely on entries persisted before
  // that changed, which age out within the week.
  response?: "agreed" | "disagreed";
}

interface NotificationHistoryState {
  entries: HistoryEntry[];
  // Ids the user explicitly discarded, mapped to when they did it. Coach
  // check-ins are re-planned several times a day under a stable id
  // (`coach:<subject>:<date>`), so without a tombstone the entry someone
  // just discarded would reappear minutes later looking brand new and
  // unread. Aged out on the same clock as the entries themselves.
  discarded: Record<string, number>;
  addEntry: (entry: Omit<HistoryEntry, "read" | "response">) => void;
  markAllRead: () => void;
  setResponse: (id: string, response: "agreed" | "disagreed") => void;
  // User-initiated: the notification's own X button. Leaves no tombstone —
  // a snoozed reminder re-fires under the same key, and that genuinely is a
  // new alert worth recording again.
  removeEntry: (id: string) => void;
  // User-initiated too, but a stronger statement than the X: "Dismiss" on a
  // nudge/coach check-in means they've answered it, so it's deleted outright
  // instead of lingering as a resolved record — and stays deleted.
  discardEntry: (id: string) => void;
  // Time-initiated: sweeps anything past MAX_AGE_MS regardless of whether a
  // new entry has ever arrived to trigger addEntry's own inline prune below —
  // called once on app load (App.tsx) so the unread badge and the list can't
  // stay inflated by week-old entries just because nothing new fired since.
  pruneExpired: () => void;
  // Time-initiated too, but on a different clock: an un-responded nudge whose
  // pendingAction proposed a specific slot (e.g. "add reading tonight at
  // 8pm") stops being honestly actionable the moment that slot passes, no
  // matter how recently it fired — saying "yes" to it later can't un-pass
  // the time. Swept separately from the age-based prune above (also called
  // once on app load) so a stale one never sits there looking tappable.
  // Already-responded entries are left alone — they're a resolved record,
  // not a pending action anymore.
  pruneStaleActions: () => void;
}

const MAX_ENTRIES = 50;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // a week

// Drops tombstones older than the cutoff, returning the same object when
// there's nothing to drop so callers can skip a pointless re-render.
function pruneDiscarded(discarded: Record<string, number>, cutoff: number) {
  const kept = Object.entries(discarded).filter(([, at]) => at >= cutoff);
  return kept.length === Object.keys(discarded).length ? discarded : Object.fromEntries(kept);
}

export const useNotificationHistoryStore = create<NotificationHistoryState>()(
  persist(
    (set) => ({
      entries: [],
      discarded: {},

      addEntry: (entry) =>
        set((state) => {
          const cutoff = Date.now() - MAX_AGE_MS;
          const discarded = pruneDiscarded(state.discarded, cutoff);
          if (discarded[entry.id]) return { discarded };
          const kept = state.entries.filter((e) => e.id !== entry.id && e.firedAt >= cutoff);
          return { entries: [{ ...entry, read: false }, ...kept].slice(0, MAX_ENTRIES), discarded };
        }),

      markAllRead: () =>
        set((state) => ({ entries: state.entries.map((e) => ({ ...e, read: true })) })),

      setResponse: (id, response) =>
        set((state) => ({
          entries: state.entries.map((e) => (e.id === id ? { ...e, response } : e)),
        })),

      removeEntry: (id) => set((state) => ({ entries: state.entries.filter((e) => e.id !== id) })),

      discardEntry: (id) =>
        set((state) => ({
          entries: state.entries.filter((e) => e.id !== id),
          discarded: {
            ...pruneDiscarded(state.discarded, Date.now() - MAX_AGE_MS),
            [id]: Date.now(),
          },
        })),

      pruneExpired: () =>
        set((state) => {
          const cutoff = Date.now() - MAX_AGE_MS;
          const kept = state.entries.filter((e) => e.firedAt >= cutoff);
          const discarded = pruneDiscarded(state.discarded, cutoff);
          if (kept.length === state.entries.length && discarded === state.discarded) return state;
          return { entries: kept, discarded };
        }),

      pruneStaleActions: () =>
        set((state) => {
          const kept = state.entries.filter(
            (e) => e.response || !isPendingActionStale(e.pendingAction)
          );
          return kept.length === state.entries.length ? state : { entries: kept };
        }),
    }),
    {
      name: "disciplined-notification-history",
      storage: createJSONStorage(() => userScopedStorage("disciplined-notification-history")),
    }
  )
);

rehydrateOnAccountChange(useNotificationHistoryStore);
