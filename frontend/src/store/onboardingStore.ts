import { create } from "zustand";
import { persist } from "zustand/middleware";

// First-launch setup wizard (Structured-style): shown once, before anything
// else. Completing or skipping it also marks the spotlight tutorial as done —
// a fresh user gets exactly one guided experience (the tour stays available
// from Settings → Replay the tutorial).
interface OnboardingState {
  done: boolean;
  // ISO datetime onboarding finished (skip counts too) — null until then.
  // Drives the progressive Habits/Goals unlock (see lib/pages.ts).
  completedAt: string | null;
  finish: () => void;
  restart: () => void;
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      done: false,
      completedAt: null,
      finish: () => set({ done: true, completedAt: new Date().toISOString() }),
      restart: () => set({ done: false, completedAt: null }),
    }),
    {
      name: "disciplined-onboarding",
      version: 1,
      // Backfill completedAt for accounts that finished onboarding before
      // this field existed — a far-past sentinel so the progressive unlock
      // treats them as already earned, never re-locking someone who's had
      // Habits/Goals open for months.
      migrate: (persisted) => {
        const state = persisted as { done?: boolean; completedAt?: string | null };
        if (state.done && !state.completedAt) {
          state.completedAt = new Date(0).toISOString();
        }
        return state as OnboardingState;
      },
    }
  )
);
