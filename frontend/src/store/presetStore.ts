import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { TaskPreset } from "@/lib/presets";

interface State {
  presets: TaskPreset[];
}

interface Actions {
  // Skips silently if a preset with the same title (case-insensitive) already
  // exists, so re-saving the same task twice doesn't clutter the row.
  addPreset: (preset: Omit<TaskPreset, "id">) => void;
  removePreset: (id: string) => void;
}

export const usePresetStore = create<State & Actions>()(
  persist(
    (set, get) => ({
      presets: [],

      addPreset: (preset) => {
        const title = preset.title.trim();
        if (!title) return;
        const exists = get().presets.some(
          (p) => p.title.trim().toLowerCase() === title.toLowerCase()
        );
        if (exists) return;
        set((state) => ({
          presets: [...state.presets, { ...preset, title, id: crypto.randomUUID() }],
        }));
      },

      removePreset: (id) => set((state) => ({ presets: state.presets.filter((p) => p.id !== id) })),
    }),
    {
      name: "disciplined-presets",
    }
  )
);
