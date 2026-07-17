// Reminder options and browser-notification plumbing.
//
// Reminders are computed client-side: a scheduler (see ReminderHost) watches
// the task/habit stores and fires when `start - reminderMinutesBefore` passes.
// Delivery is a system notification when the app is backgrounded (and
// permission was granted) or an in-app banner when it's in the foreground.
// On the packaged iOS app, delivery is instead pre-scheduled with the OS —
// see lib/nativeReminders.ts.

import {
  isNativeReminderPlatform,
  nativeNotifyPermission,
  requestNativeNotifyPermission,
} from "./nativeReminders";

export const REMINDER_OPTIONS: Array<{ value: number | null; label: string }> = [
  { value: null, label: "None" },
  { value: 0, label: "At start" },
  { value: 5, label: "5m before" },
  { value: 10, label: "10m before" },
  { value: 15, label: "15m before" },
  { value: 30, label: "30m before" },
  { value: 60, label: "1h before" },
];

export function reminderLabel(minutes: number | null | undefined) {
  if (minutes == null) return "None";
  const opt = REMINDER_OPTIONS.find((o) => o.value === minutes);
  if (opt) return opt.label;
  return minutes < 60 ? `${minutes}m before` : `${Math.round(minutes / 60)}h before`;
}

// How long past the item's start time a missed reminder is still worth
// surfacing (e.g. the tab was closed at fire time and reopened shortly after).
export const REMINDER_GRACE_MS = 5 * 60 * 1000;

export type NotifyPermission = NotificationPermission | "unsupported";

// In the packaged iOS app, permissions go through the LocalNotifications
// plugin — WKWebView has no Notification API at all (it would report
// "unsupported" and no prompt could ever be shown).
export function notifyPermission(): NotifyPermission {
  if (isNativeReminderPlatform) return nativeNotifyPermission();
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

export async function requestNotifyPermission(): Promise<NotifyPermission> {
  if (isNativeReminderPlatform) return requestNativeNotifyPermission();
  if (notifyPermission() === "unsupported") return "unsupported";
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

// How long a snoozed reminder waits before firing again.
export const SNOOZE_MS = 10 * 60 * 1000;

// Structured payload attached to a notification so the service worker can
// route button clicks (Done / Snooze) back to the app.
export interface ReminderNotificationData {
  key: string;
  kind: "task" | "habit";
  id: string;
  date: string;
}

// Action buttons are a service-worker-notification feature; the plain
// constructor ignores them. TS's page-side NotificationOptions lacks `actions`.
interface ActionNotificationOptions extends NotificationOptions {
  actions?: { action: string; title: string }[];
  data?: ReminderNotificationData;
}

// Show a system notification. Prefers the service worker registration —
// required on Android (where `new Notification()` throws) and for action
// buttons — and falls back to the constructor on browsers without a worker.
// Returns whether it was shown.
export async function showSystemNotification(
  title: string,
  body: string,
  tag: string,
  data?: ReminderNotificationData
) {
  if (notifyPermission() !== "granted") return false;
  const options: ActionNotificationOptions = { body, tag, icon: "/favicon.svg" };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      if (data) {
        options.data = data;
        options.actions = [
          { action: "done", title: "Done" },
          { action: "snooze", title: "Snooze 10 min" },
        ];
      }
      await reg.showNotification(title, options);
      return true;
    }
  } catch {
    // fall through to the constructor
  }
  try {
    new Notification(title, options);
    return true;
  } catch {
    return false;
  }
}
