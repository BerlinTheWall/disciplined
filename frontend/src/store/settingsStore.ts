import { create } from "zustand";
import { persist } from "zustand/middleware";

import { DEFAULT_BACKGROUND, type BackgroundKey } from "@/lib/backgrounds";
import type { Page } from "@/lib/pages";

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
  // Master switch for every spoken voice in the app — reminders firing,
  // assistant chat replies, and read-aloud summaries/briefings. Opt-in —
  // unexpected audio is worse than none. The only voice used is the natural
  // AI voice (see googleVoiceStore); there is no device-voice fallback.
  voiceEnabled: boolean;
  setVoiceEnabled: (on: boolean) => void;
  // Speak the day briefing on the first app open of each day (opt-in). When
  // the browser blocks unprompted audio, the Home page shows a tap-to-listen
  // prompt instead.
  morningBriefing: boolean;
  setMorningBriefing: (on: boolean) => void;
  // Earliest clock time (minutes from midnight) the morning briefing may
  // auto-play; opening the app before it leaves the briefing armed for later
  // that day. null = any time.
  morningBriefingFromMinutes: number | null;
  setMorningBriefingFromMinutes: (minutes: number | null) => void;
  // Date (ISO) the morning briefing last ran/prompted — prevents repeats.
  lastMorningBriefingDate: string | null;
  setLastMorningBriefingDate: (date: string) => void;
  // The tab the app was on when last closed/reloaded — reopening lands back
  // here instead of always resetting to Home.
  lastActivePage: Page;
  setLastActivePage: (page: Page) => void;
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
      voiceEnabled: false,
      setVoiceEnabled: (on) => set({ voiceEnabled: on }),
      morningBriefing: false,
      setMorningBriefing: (on) => set({ morningBriefing: on }),
      morningBriefingFromMinutes: null,
      setMorningBriefingFromMinutes: (minutes) => set({ morningBriefingFromMinutes: minutes }),
      lastMorningBriefingDate: null,
      setLastMorningBriefingDate: (date) => set({ lastMorningBriefingDate: date }),
      lastActivePage: "home",
      setLastActivePage: (page) => set({ lastActivePage: page }),
    }),
    { name: "disciplined-settings" }
  )
);
