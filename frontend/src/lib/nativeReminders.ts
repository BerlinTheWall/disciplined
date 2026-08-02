import { Capacitor, type PermissionState } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { LocalNotifications } from "@capacitor/local-notifications";

import { ReminderTts } from "./nativeTts";
import { lookupReminderSounds, prepareReminderSounds, SOUND_DIR } from "./reminderAudio";
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

// Stable notification id derived from a key, so a resync replaces an item's
// notification instead of stacking duplicates. Always positive — reminders
// own the positive id space, coach check-ins (lib/coach.ts) own the negative
// one, so each module's cancel-before-reschedule only ever touches its own
// pending notifications, never the other's.
export function notifId(key: string): number {
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
  // Plain tap on the notification body: gets the full reminder payload so the
  // app can jump to the day AND surface an in-app Done/Snooze prompt (iOS
  // won't put buttons on a collapsed banner, so this is the one-tap path).
  onOpen: (data: ReminderNotificationData) => void;
}

let handlers: NativeReminderHandlers | null = null;
let initialized = false;

export async function initNativeReminders(h: NativeReminderHandlers) {
  handlers = h; // refresh callbacks even if already initialized
  if (initialized || !isNativeReminderPlatform) return;
  initialized = true;

  const { display } = await LocalNotifications.checkPermissions();
  cachedPermission = toPermission(display);
  // Reminders default to enabled (see settingsStore), so the toggle-on
  // transition that normally asks for permission never fires for a fresh
  // install — nobody ever "turns it on". Ask once here instead, covering
  // that case without re-prompting once the user has answered.
  if (cachedPermission === "default" && useSettingsStore.getState().remindersEnabled) {
    void requestNativeNotifyPermission();
  }

  if (Capacitor.getPlatform() === "android") {
    // Without this, Android refuses to let the alarm-triggered
    // ReminderTtsReceiver start its speech service in the background at all
    // (ForegroundServiceStartNotAllowedException) — the standard exemption
    // alarm/reminder apps request for exactly this. Keeps asking on each
    // launch until granted; harmless no-op once it is (see
    // ReminderTtsPlugin.requestBatteryExemption).
    const { granted } = await ReminderTts.isBatteryExempt();
    if (!granted) void ReminderTts.requestBatteryExemption();

    // Same idea, separate permission: without it reminders still speak, just
    // with several seconds of OS-batching drift instead of firing on time.
    const { granted: exact } = await ReminderTts.isExactAlarmAllowed();
    if (!exact) void ReminderTts.requestExactAlarmPermission();
  }

  // Android only — createChannel is call.unimplemented() on iOS (channels
  // don't exist there), which rejects rather than no-oping. Left unguarded,
  // that throw would skip every await after it in this function, silently
  // breaking registerActionTypes and the action-performed listener below on
  // iOS. The plugin's auto-created "default" channel is importance 3, which
  // plays a sound but never heads-up pops — easy to miss entirely. Reminders
  // should interrupt, so give them their own high-importance channel.
  if (Capacitor.getPlatform() === "android") {
    await LocalNotifications.createChannel({
      id: "reminders",
      name: "Reminders",
      description: "Task and habit reminders",
      importance: 5,
      visibility: 1,
    });
  }

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
      handlers.onOpen(data);
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

// What's currently scheduled with the OS, so a resync only touches ids that
// actually changed instead of unconditionally cancelling and rescheduling
// everything every time — resyncs happen far more often than once a reminder
// nears its fire time (store updates, coach replanning, the heartbeat).
// Blanket cancel-then-reschedule caused two failures: cancelling everything
// raced with the OS delivering a reminder that was about to fire (its native
// alarm got cancelled a moment early and nothing replaced it, so it silently
// never fired), and separately, rescheduling everything unconditionally
// re-fired a reminder whose time had already passed again on every
// subsequent resync, for as long as it stayed in the batch. Diffing against
// what's already correctly scheduled avoids both: an unchanged, about-to-fire
// (or just-fired) reminder is never touched at all.
let scheduledSignatures = new Map<number, string>();

function signatureFor(r: NativeReminder, sound: string): string {
  return `${r.fireAt}|${r.title}|${r.body}|${sound}`;
}

async function scheduleBatch(batch: NativeReminder[], sounds: Map<string, string> | null) {
  const desired = new Map<number, { r: NativeReminder; sound: string; signature: string }>();
  for (const r of batch) {
    const sound = sounds?.get(r.speech) ?? "default";
    desired.set(notifId(r.key), { r, sound, signature: signatureFor(r, sound) });
  }

  // Only ever touch reminder-owned (positive-id) notifications here — coach
  // check-ins (negative ids) are a separate resync cycle, see notifId above.
  const toCancel = [...scheduledSignatures.keys()].filter((id) => !desired.has(id));
  if (toCancel.length > 0) {
    await LocalNotifications.cancel({ notifications: toCancel.map((id) => ({ id })) });
  }

  if (Capacitor.getPlatform() === "android") {
    // Android can't play a runtime-generated file as a notification sound
    // (see reminderAudio.ts), so reminders are spoken there via a second,
    // independent alarm instead of a synthesized sound file. It plays the
    // exact same natural-voice (Amy/Frank) WAV already synthesized for iOS's
    // notification sound when one's ready, so the selected voice is honored
    // there too — falling back to the on-device TTS engine reading the raw
    // text only if synthesis hasn't produced a file yet.
    // `sounds` is non-null exactly when the voice setting is on (see doSync).
    // ReminderTtsPlugin diffs internally against its own stored state, so
    // it's safe to always pass the full desired set — it only actually
    // touches AlarmManager for ids that changed.
    const items = sounds
      ? await Promise.all(
          [...desired.values()].map(async ({ r, sound }) => {
            let soundUri: string | undefined;
            if (sound !== "default") {
              try {
                const { uri } = await Filesystem.getUri({
                  path: `${SOUND_DIR}/${sound}`,
                  directory: Directory.Library,
                });
                soundUri = uri;
              } catch {
                // File isn't actually there yet — fall back to on-device TTS.
              }
            }
            return { id: notifId(r.key), text: r.speech, at: r.fireAt, soundUri };
          })
        )
      : [];
    await ReminderTts.scheduleBatch({ items });
  }

  const toSchedule = [...desired.entries()].filter(
    ([id, v]) => scheduledSignatures.get(id) !== v.signature
  );
  if (toSchedule.length > 0) {
    await LocalNotifications.schedule({
      notifications: toSchedule.map(([id, { r, sound }]) => ({
        id,
        title: r.title,
        body: r.body,
        schedule: { at: new Date(r.fireAt) },
        actionTypeId: "REMINDER",
        extra: r.data,
        channelId: "reminders",
        sound,
      })),
    });
  }

  scheduledSignatures = new Map([...desired.entries()].map(([id, { signature }]) => [id, signature]));
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
    const speak = useSettingsStore.getState().voiceEnabled;

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
