// Reminder options and browser-notification plumbing.
//
// Reminders are computed client-side: a scheduler (see ReminderHost) watches
// the task/habit stores and fires when `start - reminderMinutesBefore` passes.
// Delivery is a system notification when the app is backgrounded (and
// permission was granted) or an in-app banner when it's in the foreground.

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

export function notifyPermission(): NotifyPermission {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

export async function requestNotifyPermission(): Promise<NotifyPermission> {
  if (notifyPermission() === "unsupported") return "unsupported";
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

// Show a system notification. Prefers the service worker registration —
// required on Android, where `new Notification()` throws — and falls back to
// the constructor on browsers without a worker. Returns whether it was shown.
export async function showSystemNotification(title: string, body: string, tag: string) {
  if (notifyPermission() !== "granted") return false;
  const options: NotificationOptions = { body, tag, icon: "/favicon.svg" };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
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
