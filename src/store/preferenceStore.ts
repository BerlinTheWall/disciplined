import { create } from "zustand";
import { persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

import type { Preferences } from "@/types/preferences";

// Eating preferences that personalise recipe suggestions. Local-first, persisted
// alongside the other stores.

type State = Preferences;

const initialState: State = {
  avoidTags: [],
  likedTags: [],
  maxCookMinutes: undefined,
};

interface Actions {
  toggleAvoidTag: (tag: string) => void;
  toggleLikedTag: (tag: string) => void;
  setMaxCookMinutes: (minutes: number | undefined) => void;
}

const toggle = (list: string[], tag: string) =>
  list.includes(tag) ? list.filter((t) => t !== tag) : [...list, tag];

export const usePreferenceStore = create<State & Actions>()(
  persist(
    immer((set) => ({
      ...initialState,

      toggleAvoidTag: (tag) =>
        set((state) => {
          state.avoidTags = toggle(state.avoidTags, tag);
        }),

      toggleLikedTag: (tag) =>
        set((state) => {
          state.likedTags = toggle(state.likedTags, tag);
        }),

      setMaxCookMinutes: (minutes) =>
        set((state) => {
          state.maxCookMinutes = minutes && minutes > 0 ? minutes : undefined;
        }),
    })),
    {
      name: "disciplined-preferences",
      version: 1,
    }
  )
);
