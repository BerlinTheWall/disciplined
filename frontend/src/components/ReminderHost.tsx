import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BellRing, X } from "lucide-react";

import { speakAssistant } from "@/hooks/useSpeech";
import { assistantReminderLine } from "@/lib/assistantSpeech";
import { parseISODate, todayISODate, toISODate } from "@/lib/date";
import { ICONS, type IconKey } from "@/lib/icons";
import { spring, tap } from "@/lib/motion";
import {
  initNativeReminders,
  isNativeReminderPlatform,
  syncNativeReminders,
  type NativeReminder,
} from "@/lib/nativeReminders";
import {
  notifyPermission,
  REMINDER_GRACE_MS,
  showSystemNotification,
  SNOOZE_MS,
  type ReminderNotificationData,
} from "@/lib/reminders";
import { formatTimeLabel } from "@/lib/time";
import { setWorkerTimeout } from "@/lib/workerTimer";
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
  const push = (fireAt: number) => {
    if (fireAt > now && (next === null || fireAt < next)) next = fireAt;
  };
  const consider = (date: string, startMinutes: number, minutesBefore: number) => {
    push(new Date(date + "T00:00:00").getTime() + (startMinutes - minutesBefore) * 60_000);
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
  // Snoozed reminders re-fire at their snooze time.
  for (const until of Object.values(useReminderStore.getState().snoozes)) {
    push(until);
  }
  return next;
}

// All reminders currently inside their delivery window:
// [start - reminderMinutesBefore, start + grace] — or, when snoozed, from the
// snooze expiry onward (a snoozed reminder outlives the grace window).
function collectDue(now: number): ReminderAlert[] {
  const due: ReminderAlert[] = [];
  const snoozes = useReminderStore.getState().snoozes;

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
    // startMinutes + lead time are part of the key so rescheduling an item
    // re-arms its reminder.
    const key = `${kind}:${id}:${date}:${startMinutes}:${minutesBefore}`;
    const snoozedUntil = snoozes[key];
    if (snoozedUntil !== undefined) {
      if (now < snoozedUntil) return;
    } else if (now < fireAt || now > startAt + REMINDER_GRACE_MS) {
      return;
    }
    due.push({
      key,
      kind,
      id,
      title,
      body:
        now >= startAt
          ? `Starting now (${formatTimeLabel(startMinutes)})`
          : `Starts at ${formatTimeLabel(startMinutes)}`,
      color,
      icon,
      date,
      startMinutes,
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

// Upcoming reminders to pre-schedule with iOS (see nativeReminders): all
// future task reminders plus the next week of habit occurrences, with snoozes
// re-aimed at their expiry. The OS delivers these even when the app is
// backgrounded or killed — which the web scheduler below cannot do there.
const NATIVE_HORIZON_DAYS = 7;
function collectUpcoming(now: number): NativeReminder[] {
  const upcoming: NativeReminder[] = [];
  const snoozes = useReminderStore.getState().snoozes;

  const consider = (
    kind: "task" | "habit",
    id: string,
    title: string,
    date: string,
    startMinutes: number,
    minutesBefore: number
  ) => {
    const key = `${kind}:${id}:${date}:${startMinutes}:${minutesBefore}`;
    const startAt = new Date(date + "T00:00:00").getTime() + startMinutes * 60_000;
    const fireAt = snoozes[key] ?? startAt - minutesBefore * 60_000;
    // Anything already due is the running scheduler's job, not a future schedule.
    if (fireAt <= now + 1_000) return;
    // Stable variant seed: the same reminder must always produce the same
    // sentence, or every sync would re-synthesize its notification audio.
    let seed = 0;
    for (let i = 0; i < key.length; i++) seed = (seed * 31 + key.charCodeAt(i)) | 0;
    upcoming.push({
      key,
      title,
      body: `Starts at ${formatTimeLabel(startMinutes)}`,
      speech: assistantReminderLine(
        title,
        startMinutes,
        Math.round((startAt - fireAt) / 60_000),
        seed
      ),
      fireAt,
      data: { key, kind, id, date },
    });
  };

  for (const t of useTaskStore.getState().tasks) {
    if (t.reminderMinutesBefore == null || t.completed) continue;
    consider("task", t.id, t.title, t.date, t.startMinutes, t.reminderMinutesBefore);
  }
  for (let d = 0; d < NATIVE_HORIZON_DAYS; d++) {
    const day = new Date();
    day.setDate(day.getDate() + d);
    const iso = toISODate(day);
    const weekday = day.getDay();
    for (const h of useHabitStore.getState().habits) {
      if (h.reminderMinutesBefore == null || !h.daysOfWeek.includes(weekday)) continue;
      if (h.completedDates.includes(iso) || h.skippedDates?.includes(iso)) continue;
      consider("habit", h.id, h.title, iso, h.startMinutes, h.reminderMinutesBefore);
    }
  }

  upcoming.sort((a, b) => a.fireAt - b.fireAt);
  return upcoming;
}

// Keys already read aloud this session. Speech is its own delivery channel —
// it happens even when the system notification couldn't be shown — so a
// reminder that later re-surfaces as a banner must not be spoken twice.
const spokenKeys = new Set<string>();

// Read a due reminder aloud (when the setting is on), once per occurrence,
// phrased like a personal assistant and spoken with the natural voice when
// the server can provide it.
function speakReminder(reminder: ReminderAlert) {
  if (!useSettingsStore.getState().speakReminders) return;
  if (spokenKeys.has(reminder.key)) return;
  spokenKeys.add(reminder.key);
  const startAt = parseISODate(reminder.date).getTime() + reminder.startMinutes * 60_000;
  const minutesUntil = Math.round((startAt - Date.now()) / 60_000);
  void speakAssistant(assistantReminderLine(reminder.title, reminder.startMinutes, minutesUntil));
}

function tick() {
  if (!useSettingsStore.getState().remindersEnabled) return;
  const { fired, markFired, clearSnooze, pushAlert } = useReminderStore.getState();
  const now = Date.now();

  // Packaged iOS app with permission granted: the OS presents the
  // pre-scheduled notification itself (foreground included), so the in-app
  // banner would be a duplicate. Speech stays a foreground channel. Without
  // permission, fall through — banners are all the user gets, same as web.
  if (isNativeReminderPlatform && notifyPermission() === "granted") {
    for (const reminder of collectDue(now)) speakReminder(reminder);
    return;
  }

  for (const reminder of collectDue(now)) {
    if (fired[reminder.key]) continue;
    speakReminder(reminder);
    const data: ReminderNotificationData = {
      key: reminder.key,
      kind: reminder.kind,
      id: reminder.id,
      date: reminder.date,
    };
    if (document.visibilityState === "visible") {
      markFired(reminder.key);
      clearSnooze(reminder.key);
      pushAlert(reminder);
    } else {
      void showSystemNotification(reminder.title, reminder.body, reminder.key, data).then(
        (shown) => {
          // Only mark delivered notifications: without permission the reminder
          // stays armed and shows as a banner when the user returns (while
          // still inside the grace window).
          if (shown) {
            useReminderStore.getState().markFired(reminder.key);
            useReminderStore.getState().clearSnooze(reminder.key);
          }
        }
      );
    }
  }
}

// Handles Done / Snooze taps on a notification, forwarded by the service
// worker. Done completes the underlying item; Snooze re-arms the reminder.
function handleReminderAction(action: string, data: ReminderNotificationData) {
  const { markFired, snooze, clearSnooze } = useReminderStore.getState();
  if (action === "done") {
    markFired(data.key);
    clearSnooze(data.key);
    if (data.kind === "task") {
      const task = useTaskStore.getState().tasks.find((t) => t.id === data.id);
      if (task && !task.completed) useTaskStore.getState().toggleTaskCompleted(data.id);
    } else {
      const habit = useHabitStore.getState().habits.find((h) => h.id === data.id);
      if (habit && !habit.completedDates.includes(data.date)) {
        useHabitStore.getState().toggleHabitCompleted(data.id, data.date);
      }
    }
    if (useSettingsStore.getState().speakReminders) {
      void speakAssistant("Nice — marked as done.");
    }
  } else if (action === "snooze") {
    snooze(data.key, Date.now() + SNOOZE_MS);
    // A snoozed reminder should speak again when it comes back.
    spokenKeys.delete(data.key);
    if (useSettingsStore.getState().speakReminders) {
      void speakAssistant("Okay — I'll remind you again in 10 minutes.");
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

  // Native side: permission cache, Done/Snooze action routing, tap-to-open.
  // Re-run when the onOpen prop changes so taps always use the live handler.
  useEffect(() => {
    void initNativeReminders({ onAction: handleReminderAction, onOpen });
  }, [onOpen]);

  // Precise scheduling: after each pass, aim a timer exactly at the next fire
  // time (capped by the heartbeat). Creating/editing an item re-aims right
  // away via the store subscriptions, so a reminder due in 10 seconds fires in
  // 10 seconds — not at the next poll. The timer waits inside a worker (see
  // workerTimer) because browsers throttle main-thread timers of hidden tabs.
  useEffect(() => {
    let cancelTimer: (() => void) | undefined;

    function scheduleNext() {
      cancelTimer?.();
      const now = Date.now();
      const next = nextFireAt(now);
      const delay =
        next === null ? HEARTBEAT_MS : Math.min(next - now + FIRE_SLACK_MS, HEARTBEAT_MS);
      cancelTimer = setWorkerTimeout(run, delay);
    }

    function run() {
      tick();
      scheduleNext();
      // Keep iOS's pre-scheduled notifications matching the current stores;
      // an empty sync clears them all when reminders are switched off.
      syncNativeReminders(
        useSettingsStore.getState().remindersEnabled ? collectUpcoming(Date.now()) : []
      );
    }

    run();
    const unsubTasks = useTaskStore.subscribe(run);
    const unsubHabits = useHabitStore.subscribe(run);
    // A new snooze means a new wakeup to aim for.
    const unsubSnoozes = useReminderStore.subscribe((state, prev) => {
      if (state.snoozes !== prev.snoozes) run();
    });
    // Flipping the master switch re-syncs (or clears) the native schedule;
    // toggling spoken reminders re-syncs to attach or drop the audio.
    const unsubSettings = useSettingsStore.subscribe((state, prev) => {
      if (
        state.remindersEnabled !== prev.remindersEnabled ||
        state.speakReminders !== prev.speakReminders
      )
        run();
    });
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVisible);
    // Done/Snooze buttons on system notifications arrive via the worker.
    const onSwMessage = (event: MessageEvent) => {
      const msg = event.data as
        { type?: string; action?: string; data?: ReminderNotificationData } | undefined;
      if (msg?.type === "reminder-action" && msg.action && msg.data) {
        handleReminderAction(msg.action, msg.data);
      }
    };
    navigator.serviceWorker?.addEventListener("message", onSwMessage);
    return () => {
      cancelTimer?.();
      unsubTasks();
      unsubHabits();
      unsubSnoozes();
      unsubSettings();
      document.removeEventListener("visibilitychange", onVisible);
      navigator.serviceWorker?.removeEventListener("message", onSwMessage);
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
    <div
      className="fixed inset-x-3 z-[70] flex flex-col gap-2 pointer-events-none"
      // Clear the iOS status bar / Dynamic Island (inset is 0 on devices
      // without a notch), same treatment as the app header.
      style={{ top: "calc(12px + env(safe-area-inset-top))" }}
    >
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
