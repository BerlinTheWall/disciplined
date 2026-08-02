import { registerPlugin } from "@capacitor/core";

interface ScheduleSpeechItem {
  id: number;
  text: string;
  at: number; // epoch ms
  // The exact natural-voice (Amy/Frank) audio file already synthesized for
  // iOS's notification sound (see reminderAudio.ts) — played directly when
  // present, matching the selected voice exactly. Falls back to the
  // on-device TTS engine reading `text` when omitted (synthesis not ready).
  soundUri?: string;
}

interface ReminderTtsPlugin {
  scheduleBatch(options: { items: ScheduleSpeechItem[] }): Promise<void>;
  // A plain AlarmManager alarm doesn't by itself let the receiver it fires
  // start a foreground service in the background — Android throws
  // ForegroundServiceStartNotAllowedException without this exemption. Opens
  // the system's direct grant dialog if not already exempt.
  requestBatteryExemption(): Promise<{ granted: boolean }>;
  isBatteryExempt(): Promise<{ granted: boolean }>;
  // Without this, reminders still speak, but Android is free to batch/delay
  // delivery by several seconds — granting it lets the OS fire the alarm
  // right on time instead.
  requestExactAlarmPermission(): Promise<{ granted: boolean }>;
  isExactAlarmAllowed(): Promise<{ granted: boolean }>;
}

// Android-only native plugin (see android/app/src/main/java/.../ReminderTts*)
// that speaks a reminder aloud via the on-device TTS engine when it fires.
// iOS instead pre-synthesizes audio and plays it as the notification's sound
// (see reminderAudio.ts) — Android's LocalNotification `sound` can only
// reference a bundled res/raw resource, so a runtime-generated file can't
// work there. Only ever called when Capacitor.getPlatform() === "android",
// so it's never invoked on iOS/web despite being registered everywhere.
export const ReminderTts = registerPlugin<ReminderTtsPlugin>("ReminderTts");
