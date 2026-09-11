import { create } from "zustand";
import { persist } from "zustand/middleware";

import { MAX_PRESETS, PRESETS_MIN_TIER, type TaskPreset } from "@/lib/presets";
import { hasTier } from "@/lib/tiers";
import { useAuthStore } from "@/store/authStore";

interface State {
  presets: TaskPreset[];
}

interface Actions {
  // Skips silently if a preset with the same title (case-insensitive) already
  // exists, so re-saving the same task twice doesn't clutter the row, if
  // the user is already at MAX_PRESETS, or if their plan is below
  // PRESETS_MIN_TIER (the UI stops them before either of those).
  addPreset: (preset: Omit<TaskPreset, "id">) => void;
  removePreset: (id: string) => void;
}

export const usePresetStore = create<State & Actions>()(
  persist(
    (set, get) => ({
      presets: [],

      addPreset: (preset) => {
        const title = preset.title.trim();
        if (!title || get().presets.length >= MAX_PRESETS) return;
        if (!hasTier(useAuthStore.getState().user, PRESETS_MIN_TIER)) return;
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
