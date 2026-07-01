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
    }),
    { name: "disciplined-settings" }
  )
);
