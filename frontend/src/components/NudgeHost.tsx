import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, X } from "lucide-react";

import { api } from "@/lib/api";
import { initCoachNotifications, scheduleCoachPlan } from "@/lib/coach";
import { todayISODate } from "@/lib/date";
import { spring, tap } from "@/lib/motion";
import { useChatStore } from "@/store/chatStore";
import { useGoalStore } from "@/store/goalStore";
import { useHabitStore } from "@/store/habitStore";
import { useNudgeStore } from "@/store/nudgeStore";
import { useTaskStore } from "@/store/taskStore";

// Debounces bursts of foreground/data-change events into one check.
const CHECK_DEBOUNCE_MS = 1500;
// Auto-dismiss mirrors ReminderHost's banner timing but a touch longer, since
// a nudge asks a real yes/no question rather than just naming an event.
const AUTO_DISMISS_MS = 15_000;
// How long an explicitly (or automatically) dismissed nudge stays suppressed
// for that exact subject, so declining once doesn't mean forever.
const DISMISS_COOLDOWN_DAYS = 3;

function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(dateISO + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function runCheck() {
  const today = todayISODate();
  const { lastShownDate, dismissedUntil } = useNudgeStore.getState();
  // Daily cap: once a nudge has been shown today, every later check is a
  // no-op before any fetch — this is what keeps a quiet day (and a rapid
  // foreground/background flap) from ever reaching Gemini more than once.
  if (lastShownDate === today) return;

  const excludedKeys = Object.entries(dismissedUntil)
    .filter(([, until]) => until > today)
    .map(([key]) => key);

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const res = await api.nudges.check(nowMinutes, excludedKeys).catch(() => null);
  if (!res?.type) return;

  useNudgeStore.getState().markShown(today);
  useNudgeStore.getState().setCurrent({
    type: res.type,
    subjectId: res.subjectId!,
    message: res.message!,
    actionPhrase: res.actionPhrase,
  });
}

interface Props {
  onOpenGoals: () => void;
}

// Proactive counterpart to ReminderHost: instead of firing at a scheduled
// time, this checks in whenever the app is opened/foregrounded or the
// underlying data changes, and surfaces at most one AI-noticed nudge a day.
export default function NudgeHost({ onOpenGoals }: Props) {
  const current = useNudgeStore((s) => s.current);
  const dismissTimer = useRef<number>(undefined);

  useEffect(() => {
    initCoachNotifications();

    let cancelled = false;
    let debounceTimer: number | undefined;
    const debounced = () => {
      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        if (!cancelled) {
          void runCheck();
          scheduleCoachPlan();
        }
      }, CHECK_DEBOUNCE_MS);
    };

    debounced();
    const unsubTasks = useTaskStore.subscribe((state, prev) => {
      if (state.tasks !== prev.tasks) debounced();
    });
    const unsubHabits = useHabitStore.subscribe((state, prev) => {
      if (state.habits !== prev.habits) debounced();
    });
    const unsubGoals = useGoalStore.subscribe((state, prev) => {
      if (state.goals !== prev.goals) debounced();
    });
    const onVisible = () => {
      if (document.visibilityState === "visible") debounced();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.clearTimeout(debounceTimer);
      unsubTasks();
      unsubHabits();
      unsubGoals();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(() => {
    window.clearTimeout(dismissTimer.current);
    if (!current) return;
    dismissTimer.current = window.setTimeout(() => dismissAndCooldown(), AUTO_DISMISS_MS);
    return () => window.clearTimeout(dismissTimer.current);
  }, [current]);

  function dismissAndCooldown() {
    const alert = useNudgeStore.getState().current;
    if (!alert) return;
    const key = `${alert.type}:${alert.subjectId}`;
    useNudgeStore.getState().dismiss(key, addDaysISO(todayISODate(), DISMISS_COOLDOWN_DAYS));
    useNudgeStore.getState().setCurrent(null);
  }

  return (
    <div
      className="fixed inset-x-3 z-[70] flex flex-col pointer-events-none"
      style={{ bottom: "calc(88px + var(--nav-bottom))" }}
    >
      <AnimatePresence>
        {current && (
          <motion.div
            key={`${current.type}:${current.subjectId}`}
            initial={{ y: 72, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 72, opacity: 0 }}
            transition={spring.snappy}
            className="pointer-events-auto"
          >
            <div className="flex items-start gap-3 bg-surface rounded-2xl shadow-xl border border-border-strong px-3.5 py-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-fg text-fg-inverse">
                <Sparkles size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-fg-muted">{current.message}</p>
                <div className="flex gap-2 mt-2">
                  <motion.button
                    onClick={() => {
                      const alert = current;
                      useNudgeStore.getState().setCurrent(null);
                      if (alert.actionPhrase) {
                        useChatStore.getState().openChat();
                        void useChatStore
                          .getState()
                          .send(alert.actionPhrase)
                          .catch(() => {});
                      } else {
                        onOpenGoals();
                      }
                    }}
                    whileTap={tap}
                    className="h-8 px-4 rounded-full bg-fg text-fg-inverse text-[13px] font-semibold"
                  >
                    {current.actionPhrase ? "Yes" : "View"}
                  </motion.button>
                  <motion.button
                    onClick={dismissAndCooldown}
                    whileTap={tap}
                    className="h-8 px-4 rounded-full bg-surface-raised text-fg text-[13px] font-medium"
                  >
                    Not now
                  </motion.button>
                </div>
              </div>
              <motion.button
                onClick={dismissAndCooldown}
                whileTap={tap}
                aria-label="Dismiss"
                className="p-2 -m-1 text-fg-faint shrink-0"
              >
                <X size={18} />
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
