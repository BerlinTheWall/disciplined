import { create } from "zustand";
import { persist } from "zustand/middleware";

// First-launch setup wizard (Structured-style): shown once, before anything
// else. Completing or skipping it also marks the spotlight tutorial as done —
// a fresh user gets exactly one guided experience (the tour stays available
// from Settings → Replay the tutorial).
interface OnboardingState {
  done: boolean;
  finish: () => void;
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      done: false,
      finish: () => set({ done: true }),
    }),
    { name: "disciplined-onboarding" }
  )
);
