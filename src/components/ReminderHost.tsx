import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BellRing, X } from "lucide-react";

import { speak } from "@/hooks/useSpeech";
import { todayISODate } from "@/lib/date";
import { ICONS, type IconKey } from "@/lib/icons";
import { spring, tap } from "@/lib/motion";
import { REMINDER_GRACE_MS, showSystemNotification } from "@/lib/reminders";
import { formatTimeLabel } from "@/lib/time";
import { useHabitStore } from "@/store/habitStore";
import { useReminderStore, type ReminderAlert } from "@/store/reminderStore";
import { useSettingsStore } from "@/store/settingsStore";
import { useTaskStore } from "@/store/taskStore";
import type { Habit } from "@/types/habits";

// Safety heartbeat between precisely-aimed wakeups (see scheduleNext): the
// scheduler sets an exact timer for the next fire time, and this caps how far
// apart wakeups can drift (clock changes, throttled timers, missed events).
const HEARTBEAT_MS = 30_000;
// Aim slightly past the fire time so the wakeup lands just inside the window,
// never a hair before it.
const FIRE_SLACK_MS = 200;
// Foreground banners dismiss themselves after a while.
const AUTO_DISMISS_MS = 12_000;

// Habits that can still fire a reminder today.
function activeHabitsToday(today: string, weekday: number) {
  return useHabitStore
    .getState()
    .habits.filter(
      (h): h is Habit & { reminderMinutesBefore: number } =>
        h.reminderMinutesBefore != null &&
        h.daysOfWeek.includes(weekday) &&
        !h.completedDates.includes(today) &&
        !h.skippedDates?.includes(today)
    );
}

// Earliest upcoming fire time (start - lead) strictly after `now`, or null.
// Only looks ahead — items already inside their window are collectDue's job.
function nextFireAt(now: number): number | null {
  let next: number | null = null;
  const consider = (date: string, startMinutes: number, minutesBefore: number) => {
    const fireAt = new Date(date + "T00:00:00").getTime() + (startMinutes - minutesBefore) * 60_000;
    if (fireAt > now && (next === null || fireAt < next)) next = fireAt;
  };

  for (const t of useTaskStore.getState().tasks) {
    if (t.reminderMinutesBefore == null || t.completed) continue;
    consider(t.date, t.startMinutes, t.reminderMinutesBefore);
  }
  const today = todayISODate();
  const weekday = new Date().getDay();
  for (const h of activeHabitsToday(today, weekday)) {
    consider(today, h.startMinutes, h.reminderMinutesBefore);
  }
  return next;
}

// All reminders currently inside their delivery window:
// [start - reminderMinutesBefore, start + grace].
function collectDue(now: number): ReminderAlert[] {
  const due: ReminderAlert[] = [];

  function pushIfDue(
    kind: "task" | "habit",
    id: string,
    title: string,
    date: string,
    startMinutes: number,
    minutesBefore: number,
    color: string,
    icon: IconKey
  ) {
    const startAt = new Date(date + "T00:00:00").getTime() + startMinutes * 60_000;
    const fireAt = startAt - minutesBefore * 60_000;
    if (now < fireAt || now > startAt + REMINDER_GRACE_MS) return;
    due.push({
      // startMinutes + lead time are part of the key so rescheduling an item
      // re-arms its reminder.
      key: `${kind}:${id}:${date}:${startMinutes}:${minutesBefore}`,
      title,
      body:
        now >= startAt
          ? `Starting now (${formatTimeLabel(startMinutes)})`
          : `Starts at ${formatTimeLabel(startMinutes)}`,
      color,
      icon,
      date,
    });
  }

  for (const t of useTaskStore.getState().tasks) {
    if (t.reminderMinutesBefore == null || t.completed) continue;
    pushIfDue(
      "task",
      t.id,
      t.title,
      t.date,
      t.startMinutes,
      t.reminderMinutesBefore,
      t.color,
      t.icon
    );
  }

  const today = todayISODate();
  const weekday = new Date().getDay();
  for (const h of activeHabitsToday(today, weekday)) {
    pushIfDue(
      "habit",
      h.id,
      h.title,
      today,
      h.startMinutes,
      h.reminderMinutesBefore,
      h.color,
      h.icon
    );
  }

  return due;
}

// Keys already read aloud this session. Speech is its own delivery channel —
// it happens even when the system notification couldn't be shown — so a
// reminder that later re-surfaces as a banner must not be spoken twice.
const spokenKeys = new Set<string>();

// Read a due reminder aloud (when the setting is on), once per occurrence.
// Queued rather than interrupting, so several reminders due at the same time
// are spoken back to back.
function speakReminder(reminder: ReminderAlert) {
  if (!useSettingsStore.getState().speakReminders) return;
  if (spokenKeys.has(reminder.key)) return;
  spokenKeys.add(reminder.key);
  speak(`${reminder.title}. ${reminder.body}.`, { interrupt: false });
}

function tick() {
  if (!useSettingsStore.getState().remindersEnabled) return;
  const { fired, markFired, pushAlert } = useReminderStore.getState();
  const now = Date.now();
  for (const reminder of collectDue(now)) {
    if (fired[reminder.key]) continue;
    speakReminder(reminder);
    if (document.visibilityState === "visible") {
      markFired(reminder.key);
      pushAlert(reminder);
    } else {
      void showSystemNotification(reminder.title, reminder.body, reminder.key).then((shown) => {
        // Only mark delivered notifications: without permission the reminder
        // stays armed and shows as a banner when the user returns (while
        // still inside the grace window).
        if (shown) useReminderStore.getState().markFired(reminder.key);
      });
    }
  }
}

interface ReminderHostProps {
  // Jump to the item's day on the schedule page.
  onOpen: (date: string) => void;
}

// Runs the reminder scheduler and renders foreground reminder banners.
// Mounted once at the app root.
export default function ReminderHost({ onOpen }: ReminderHostProps) {
  const alerts = useReminderStore((s) => s.alerts);
  const dismissAlert = useReminderStore((s) => s.dismissAlert);

  // Precise scheduling: after each pass, aim a timer exactly at the next fire
  // time (capped by the heartbeat). Creating/editing an item re-aims right
  // away via the store subscriptions, so a reminder due in 10 seconds fires in
  // 10 seconds — not at the next poll. Background tabs still get throttled by
  // the browser (up to ~a minute); the heartbeat catches anything missed.
  useEffect(() => {
    let timer: number | undefined;

    function scheduleNext() {
      window.clearTimeout(timer);
      const now = Date.now();
      const next = nextFireAt(now);
      const delay =
        next === null ? HEARTBEAT_MS : Math.min(next - now + FIRE_SLACK_MS, HEARTBEAT_MS);
      timer = window.setTimeout(run, delay);
    }

    function run() {
      tick();
      scheduleNext();
    }

    run();
    const unsubTasks = useTaskStore.subscribe(run);
    const unsubHabits = useHabitStore.subscribe(run);
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(timer);
      unsubTasks();
      unsubHabits();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // Auto-dismiss each banner once, without restarting timers when the list
  // changes.
  const scheduled = useRef(new Set<string>());
  useEffect(() => {
    for (const alert of alerts) {
      if (scheduled.current.has(alert.key)) continue;
      scheduled.current.add(alert.key);
      window.setTimeout(() => {
        useReminderStore.getState().dismissAlert(alert.key);
        scheduled.current.delete(alert.key);
      }, AUTO_DISMISS_MS);
    }
  }, [alerts]);

  return (
    <div className="fixed top-3 inset-x-3 z-[70] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {alerts.map((alert) => {
          const Icon = ICONS[alert.icon] ?? ICONS.default;
          return (
            <motion.div
              key={alert.key}
              layout
              initial={{ y: -72, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -72, opacity: 0 }}
              transition={spring.snappy}
              className="pointer-events-auto"
            >
              <div
                role="button"
                tabIndex={0}
                onClick={() => {
                  dismissAlert(alert.key);
                  onOpen(alert.date);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    dismissAlert(alert.key);
                    onOpen(alert.date);
                  }
                }}
                className="flex items-center gap-3 bg-surface rounded-2xl shadow-xl border border-border-strong px-3.5 py-3 cursor-pointer"
              >
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                  style={{ backgroundColor: alert.color, color: "#fff" }}
                >
                  <Icon size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="flex items-center gap-1.5 text-xs text-fg-faint">
                    <BellRing size={12} />
                    Reminder
                  </p>
                  <p className="font-semibold text-fg truncate">{alert.title}</p>
                  <p className="text-sm text-fg-muted">{alert.body}</p>
                </div>
                <motion.button
                  onClick={(e) => {
                    e.stopPropagation();
                    dismissAlert(alert.key);
                  }}
                  whileTap={tap}
                  aria-label="Dismiss reminder"
                  className="p-2 -m-1 text-fg-faint shrink-0"
                >
                  <X size={18} />
                </motion.button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
