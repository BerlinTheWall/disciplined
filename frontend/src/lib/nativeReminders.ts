import { Capacitor, type PermissionState } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";

import { lookupReminderSounds, prepareReminderSounds } from "./reminderAudio";
import type { NotifyPermission, ReminderNotificationData } from "./reminders";
import { useSettingsStore } from "@/store/settingsStore";

// iOS delivery channel for reminders. The web scheduler (ReminderHost) can't
// deliver in the packaged app: WKWebView has no Notification API, and iOS
// suspends the WebView's JS in the background. So on the native platform,
// upcoming reminders are pre-scheduled with the OS (syncNativeReminders) and
// iOS presents them itself — app backgrounded, killed, whatever. The web path
// stays intact for the browser.

export const isNativeReminderPlatform = Capacitor.isNativePlatform();

export interface NativeReminder {
  key: string;
  title: string;
  body: string;
  // The assistant-phrased sentence to pre-synthesize as this notification's
  // sound, so the phone speaks the reminder when it fires (app closed or not).
  speech: string;
  fireAt: number; // epoch ms
  data: ReminderNotificationData;
}

// iOS caps pending local notifications at 64 per app; keep headroom.
const MAX_SCHEDULED = 60;

// Stable int32 notification id derived from the reminder key, so a resync
// replaces an item's notification instead of stacking duplicates.
function notifId(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return Math.abs(h) || 1;
}

const toPermission = (state: PermissionState): NotifyPermission =>
  state === "granted" ? "granted" : state === "denied" ? "denied" : "default";

// The plugin's permission check is async; a cached value keeps the app's
// existing synchronous notifyPermission() call sites working. Refreshed on
// init and after every request.
let cachedPermission: NotifyPermission = "default";

export function nativeNotifyPermission(): NotifyPermission {
  return cachedPermission;
}

export async function requestNativeNotifyPermission(): Promise<NotifyPermission> {
  const result = await LocalNotifications.requestPermissions();
  cachedPermission = toPermission(result.display);
  // Anything queued while permission was missing can be scheduled now.
  if (cachedPermission === "granted" && latest.length > 0) void doSync();
  return cachedPermission;
}

interface NativeReminderHandlers {
  // Done / Snooze notification buttons — same semantics as the web
  // service-worker actions.
  onAction: (action: string, data: ReminderNotificationData) => void;
  // Plain tap on the notification body: jump to the item's day.
  onOpen: (date: string) => void;
}

let handlers: NativeReminderHandlers | null = null;
let initialized = false;

export async function initNativeReminders(h: NativeReminderHandlers) {
  handlers = h; // refresh callbacks even if already initialized
  if (initialized || !isNativeReminderPlatform) return;
  initialized = true;

  const { display } = await LocalNotifications.checkPermissions();
  cachedPermission = toPermission(display);

  await LocalNotifications.registerActionTypes({
    types: [
      {
        id: "REMINDER",
        actions: [
          { id: "done", title: "Done" },
          { id: "snooze", title: "Snooze 10 min" },
        ],
      },
    ],
  });

  await LocalNotifications.addListener("localNotificationActionPerformed", (event) => {
    const data = event.notification.extra as ReminderNotificationData | undefined;
    if (!data?.key || !handlers) return;
    if (event.actionId === "done" || event.actionId === "snooze") {
      handlers.onAction(event.actionId, data);
    } else {
      handlers.onOpen(data.date);
    }
  });
}

// Declarative resync: cancel everything pending and schedule the current
// upcoming set. Debounced because store subscriptions fire in bursts.
let syncTimer: ReturnType<typeof setTimeout> | undefined;
let latest: NativeReminder[] = [];

export function syncNativeReminders(upcoming: NativeReminder[]) {
  if (!isNativeReminderPlatform) return;
  latest = upcoming;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => void doSync(), 400);
}

// Cancel everything pending and schedule the batch. `sounds` maps a
// reminder's spoken line to its synthesized WAV; reminders without one fall
// back to "default" — the name resolves to no file, which iOS answers with
// the standard notification sound. Omitting the field entirely would deliver
// SILENTLY (the plugin only sets a sound when one is passed).
async function scheduleBatch(batch: NativeReminder[], sounds: Map<string, string> | null) {
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length > 0) {
    await LocalNotifications.cancel({
      notifications: pending.notifications.map((n) => ({ id: n.id })),
    });
  }
  if (batch.length === 0) return;
  await LocalNotifications.schedule({
    notifications: batch.map((r) => ({
      id: notifId(r.key),
      title: r.title,
      body: r.body,
      schedule: { at: new Date(r.fireAt) },
      actionTypeId: "REMINDER",
      extra: r.data,
      sound: sounds?.get(r.speech) ?? "default",
    })),
  });
}

// Synthesizing sounds makes a sync take a while; if another sync is requested
// meanwhile, run one more pass at the end instead of overlapping.
let syncing = false;
let syncQueued = false;

async function doSync() {
  if (cachedPermission !== "granted") return;
  if (syncing) {
    syncQueued = true;
    return;
  }
  syncing = true;
  try {
    const batch = latest.slice(0, MAX_SCHEDULED);
    const speak = useSettingsStore.getState().speakReminders;

    // Pass 1 — immediate: schedule with whatever spoken audio is already
    // cached, so quitting the app mid-sync never leaves stale notifications.
    await scheduleBatch(batch, speak ? lookupReminderSounds(batch.map((r) => r.speech)) : null);

    // Pass 2 — synthesize the missing lines (network, can take a while) and
    // reschedule so those reminders speak instead of dinging. Failures just
    // mean a reminder keeps the default sound until the next sync.
    if (speak && batch.length > 0) {
      const sounds = await prepareReminderSounds(batch.map((r) => r.speech));
      await scheduleBatch(batch, sounds);
    }
  } catch (e) {
    console.warn("[reminders] native sync failed", e);
  } finally {
    syncing = false;
    if (syncQueued) {
      syncQueued = false;
      void doSync();
    }
  }
}
