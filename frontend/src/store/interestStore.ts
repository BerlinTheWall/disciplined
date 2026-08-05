import { create } from "zustand";

import { api } from "@/lib/api";
import { guessIcon } from "@/lib/icons";
import type { Interest } from "@/types/interest";

interface State {
  interests: Interest[];
  loaded: boolean;
}

interface Actions {
  fetchInterests: () => Promise<void>;
  // Skips silently if a matching title (case-insensitive) already exists.
  addInterest: (title: string) => Promise<void>;
  removeInterest: (id: string) => Promise<void>;
}

// Deliberately not wired into lib/sync.ts's write-through offline engine —
// that exists for high-frequency scheduling edits (tasks/habits/goals);
// adding/removing an activity is a rare, foreground-only action, so a plain
// optimistic-with-rollback call to the API is enough.
export const useInterestStore = create<State & Actions>()((set, get) => ({
  interests: [],
  loaded: false,

  fetchInterests: async () => {
    const interests = await api.interests.list();
    set({ interests, loaded: true });
  },

  addInterest: async (title) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const exists = get().interests.some(
      (i) => i.title.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (exists) return;
    const interest: Interest = {
      id: crypto.randomUUID(),
      title: trimmed,
      icon: guessIcon(trimmed) ?? "default",
      createdAt: Date.now(),
    };
    set((state) => ({ interests: [...state.interests, interest] }));
    try {
      await api.interests.create(interest);
    } catch (e) {
      set((state) => ({ interests: state.interests.filter((i) => i.id !== interest.id) }));
      throw e;
    }
  },

  removeInterest: async (id) => {
    const prev = get().interests;
    set((state) => ({ interests: state.interests.filter((i) => i.id !== id) }));
    try {
      await api.interests.remove(id);
    } catch (e) {
      set({ interests: prev });
      throw e;
    }
  },
}));
