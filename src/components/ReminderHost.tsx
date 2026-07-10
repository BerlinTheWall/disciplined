import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BellRing, X } from "lucide-react";

import { todayISODate } from "@/lib/date";
import { ICONS, type IconKey } from "@/lib/icons";
import { spring, tap } from "@/lib/motion";
import { REMINDER_GRACE_MS, showSystemNotification } from "@/lib/reminders";
import { formatTimeLabel } from "@/lib/time";
import { useHabitStore } from "@/store/habitStore";
import { useReminderStore, type ReminderAlert } from "@/store/reminderStore";
import { useSettingsStore } from "@/store/settingsStore";
import { useTaskStore } from "@/store/taskStore";

// How often the scheduler looks for due reminders. Reminder precision is
// "within half a minute", which is plenty for a day planner.
const CHECK_INTERVAL_MS = 30_000;
// Foreground banners dismiss themselves after a while.
const AUTO_DISMISS_MS = 12_000;

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
  for (const h of useHabitStore.getState().habits) {
    if (h.reminderMinutesBefore == null) continue;
    if (!h.daysOfWeek.includes(weekday)) continue;
    if (h.completedDates.includes(today) || h.skippedDates?.includes(today)) continue;
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

function tick() {
  if (!useSettingsStore.getState().remindersEnabled) return;
  const { fired, markFired, pushAlert } = useReminderStore.getState();
  const now = Date.now();
  for (const reminder of collectDue(now)) {
    if (fired[reminder.key]) continue;
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

  useEffect(() => {
    tick();
    const id = window.setInterval(tick, CHECK_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
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
