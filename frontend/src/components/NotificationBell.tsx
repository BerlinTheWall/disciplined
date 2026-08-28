import { useState } from "react";
import { motion } from "framer-motion";
import { Bell, Sparkles, X } from "lucide-react";

import BottomSheet from "./BottomSheet";
import { addDaysISO, todayISODate } from "@/lib/date";
import { tap } from "@/lib/motion";
import { isPendingActionStale, runPendingAction } from "@/lib/pendingAction";
import { useChatStore } from "@/store/chatStore";
import { useNotificationHistoryStore, type HistoryEntry } from "@/store/notificationHistoryStore";
import { DISMISS_COOLDOWN_DAYS, useNudgeStore } from "@/store/nudgeStore";
import { useScheduleFocusStore } from "@/store/scheduleFocusStore";
import { useToastStore } from "@/store/toastStore";

interface Props {
  onOpenSchedule: (date: string) => void;
  onOpenGoals: () => void;
}

// Header icon + unread badge, opening a history of past reminders and AI
// nudges — the persistent counterpart to ReminderHost's/NudgeHost's
// transient banners, which otherwise vanish with no trace once dismissed.
export default function NotificationBell({ onOpenSchedule, onOpenGoals }: Props) {
  const entries = useNotificationHistoryStore((s) => s.entries);
  const markAllRead = useNotificationHistoryStore((s) => s.markAllRead);
  const removeEntry = useNotificationHistoryStore((s) => s.removeEntry);
  const [isOpen, setIsOpen] = useState(false);
  const unreadCount = entries.filter((e) => !e.read).length;

  function open() {
    setIsOpen(true);
    markAllRead();
    // A slot-proposing nudge (pendingAction) stops being honestly actionable
    // the moment its slot passes — sweep those out here too (App.tsx already
    // does this once on boot), so a stale one never sits there still looking
    // tappable in a long-lived session.
    useNotificationHistoryStore.getState().pruneStaleActions();
  }

  function handleTap(entry: HistoryEntry) {
    setIsOpen(false);
    if (!entry.date) return;
    // Scrolls the actual task/habit row into view once the schedule page
    // lands on that day, same mechanism GoalsPage's own "open this task"
    // already uses — not just the right day, but the right row on it.
    if (entry.itemId) useScheduleFocusStore.getState().focusItem(entry.itemId);
    onOpenSchedule(entry.date);
  }

  // "Agree" mirrors NudgeHost's live "Yes" — same three-way branch: run the
  // one-tap action directly if there is one, else send the action phrase as
  // if typed, else fall back to Goals (goal_pacing and friends, which carry
  // neither). Only recorded as "agreed" once the action actually succeeds,
  // so a failed attempt (or the phrase/Goals paths, which have no notion of
  // failure) leaves Yes/Dismiss available rather than falsely reading
  // "Confirmed" for something that never happened.
  async function respondAgree(entry: HistoryEntry) {
    if (entry.pendingAction) {
      if (isPendingActionStale(entry.pendingAction)) {
        removeEntry(entry.id);
        useToastStore.getState().show("That time already passed", "error");
        return;
      }
      const ok = await runPendingAction(entry.pendingAction, (date) => {
        setIsOpen(false);
        onOpenSchedule(date);
      });
      if (ok) useNotificationHistoryStore.getState().setResponse(entry.id, "agreed");
      return;
    }
    useNotificationHistoryStore.getState().setResponse(entry.id, "agreed");
    if (entry.actionPhrase) {
      setIsOpen(false);
      useChatStore.getState().openChat();
      void useChatStore
        .getState()
        .send(entry.actionPhrase)
        .catch(() => {});
    } else {
      setIsOpen(false);
      onOpenGoals();
    }
  }

  // "Disagree" mirrors NudgeHost's "Not now" — for nudges (not coach
  // check-ins, which are server-planned per day and have no cooldown key)
  // this also suppresses that exact subject for a few days.
  function respondDisagree(entry: HistoryEntry) {
    useNotificationHistoryStore.getState().setResponse(entry.id, "disagreed");
    if (entry.kind === "nudge" && entry.nudgeType && entry.subjectId) {
      const key = `${entry.nudgeType}:${entry.subjectId}`;
      useNudgeStore.getState().dismiss(key, addDaysISO(todayISODate(), DISMISS_COOLDOWN_DAYS));
    }
  }

  return (
    <>
      <motion.button
        onClick={open}
        whileTap={tap}
        aria-label="Notifications"
        className="relative w-10 h-10 rounded-full bg-surface-subtle text-fg-muted flex items-center justify-center shrink-0"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-semibold flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </motion.button>

      <BottomSheet
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        className="bg-surface-alt max-h-[70vh] flex flex-col overflow-hidden"
      >
        <div className="px-5 pt-4 pb-2 shrink-0">
          <h2 className="text-lg font-bold text-fg">Notifications</h2>
        </div>
        <div
          className="flex-1 overflow-y-auto px-5 pb-4"
          style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }}
        >
          {entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <Bell size={22} className="text-fg-faint" />
              <p className="text-sm text-fg-faint">No notifications yet</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {entries.map((entry) => {
                // Nudges/coach check-ins are the AI's proactive suggestions —
                // they get a firing date and an explicit Agree/Disagree
                // response instead of reminders' plain tap-to-jump.
                if (entry.kind !== "nudge" && entry.kind !== "coach") {
                  return (
                    <div
                      key={entry.id}
                      className="flex items-start gap-3 p-3 rounded-2xl bg-surface"
                    >
                      <button
                        onClick={() => handleTap(entry)}
                        className="flex flex-1 min-w-0 items-start gap-3 text-left"
                      >
                        <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-surface-raised text-fg-muted">
                          <Bell size={16} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-fg text-sm leading-tight">
                            {entry.title}
                          </p>
                          <p className="text-sm text-fg-muted mt-0.5">{entry.body}</p>
                        </div>
                      </button>
                      <motion.button
                        onClick={() => removeEntry(entry.id)}
                        whileTap={tap}
                        aria-label="Remove notification"
                        className="p-1 -m-1 text-fg-faint shrink-0"
                      >
                        <X size={16} />
                      </motion.button>
                    </div>
                  );
                }

                const dateLabel = new Date(entry.firedAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                });
                return (
                  <div key={entry.id} className="flex items-start gap-3 p-3 rounded-2xl bg-surface">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-surface-raised text-fg-muted">
                      <Sparkles size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="font-semibold text-fg text-sm leading-tight">{entry.title}</p>
                        <span className="text-[11px] text-fg-faint shrink-0">{dateLabel}</span>
                      </div>
                      <p className="text-sm text-fg-muted mt-0.5">{entry.body}</p>
                      {entry.response ? (
                        <p className="text-xs text-fg-faint mt-2 italic">
                          {entry.response === "agreed" ? "Confirmed" : "Discarded"}
                        </p>
                      ) : (
                        <div className="flex gap-2 mt-2">
                          <motion.button
                            onClick={() => respondAgree(entry)}
                            whileTap={tap}
                            className="h-7 px-3 rounded-full bg-fg text-fg-inverse text-xs font-semibold"
                          >
                            Yes
                          </motion.button>
                          <motion.button
                            onClick={() => respondDisagree(entry)}
                            whileTap={tap}
                            className="h-7 px-3 rounded-full bg-surface-raised text-fg text-xs font-medium"
                          >
                            Dismiss
                          </motion.button>
                        </div>
                      )}
                    </div>
                    <motion.button
                      onClick={() => removeEntry(entry.id)}
                      whileTap={tap}
                      aria-label="Remove notification"
                      className="p-1 -m-1 text-fg-faint shrink-0"
                    >
                      <X size={16} />
                    </motion.button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </BottomSheet>
    </>
  );
}
