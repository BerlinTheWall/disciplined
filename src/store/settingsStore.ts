import { create } from "zustand";
import { persist } from "zustand/middleware";

import { DEFAULT_BACKGROUND, type BackgroundKey } from "@/lib/backgrounds";

// App-wide preferences that should survive reloads: schedule view style,
// visual options, and the reminder behavior toggles.
export type ScheduleView = "daily" | "weekly";

interface SettingsState {
  scheduleView: ScheduleView;
  setScheduleView: (view: ScheduleView) => void;
  // Alternate visual style for the calendar + tasks. Persisted now; not yet
  // wired to any rendering — reserved for a future restyle.
  altStyle: boolean;
  setAltStyle: (on: boolean) => void;
  // Ambient background preset (see @/lib/backgrounds).
  background: BackgroundKey;
  setBackground: (bg: BackgroundKey) => void;
  // Master switch for task/habit reminders (system notifications + in-app
  // banners). Individual items opt in via their reminderMinutesBefore.
  remindersEnabled: boolean;
  setRemindersEnabled: (on: boolean) => void;
  // Reminder lead time pre-selected for newly created items; null = none.
  defaultReminderMinutes: number | null;
  setDefaultReminderMinutes: (minutes: number | null) => void;
  // Read reminders aloud (text-to-speech) when they fire, in addition to the
  // banner/notification. Opt-in — unexpected audio is worse than none.
  speakReminders: boolean;
  setSpeakReminders: (on: boolean) => void;
  // voiceURI of the chosen speech voice; null = the system default. Applies to
  // everything the app speaks (reminders and chat replies).
  voiceURI: string | null;
  setVoiceURI: (uri: string | null) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      scheduleView: "daily",
      setScheduleView: (view) => set({ scheduleView: view }),
      altStyle: false,
      setAltStyle: (on) => set({ altStyle: on }),
      background: DEFAULT_BACKGROUND,
      setBackground: (bg) => set({ background: bg }),
      remindersEnabled: true,
      setRemindersEnabled: (on) => set({ remindersEnabled: on }),
      defaultReminderMinutes: null,
      setDefaultReminderMinutes: (minutes) => set({ defaultReminderMinutes: minutes }),
      speakReminders: false,
      setSpeakReminders: (on) => set({ speakReminders: on }),
      voiceURI: null,
      setVoiceURI: (uri) => set({ voiceURI: uri }),
    }),
    { name: "disciplined-settings" }
  )
);
