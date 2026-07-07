import { create } from "zustand";
import { persist } from "zustand/middleware";

import { DEFAULT_BACKGROUND, type BackgroundKey } from "@/lib/backgrounds";

// App-wide preferences that should survive reloads. Right now just the schedule
// view style (the daily timeline vs the weekly grid), toggled from Settings and
// the schedule header.
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
    }),
    { name: "disciplined-settings" }
  )
);
