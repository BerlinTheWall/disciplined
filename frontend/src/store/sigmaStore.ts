import { create } from "zustand";
import { persist } from "zustand/middleware";

// Sigma Mode: a personal, unpublished hype gimmick — flips the whole app to a
// harsh black-and-red theme (see index.css [data-sigma="on"]) and barks
// motivation at you. Never surfaced to other users; toggled from Settings.

function applySigma(on: boolean) {
  if (on) document.documentElement.setAttribute("data-sigma", "on");
  else document.documentElement.removeAttribute("data-sigma");
}

interface SigmaState {
  on: boolean;
  toggle: () => void;
}

export const useSigmaStore = create<SigmaState>()(
  persist(
    (set, get) => ({
      on: false,
      toggle: () => {
        const next = !get().on;
        applySigma(next);
        set({ on: next });
      },
    }),
    {
      name: "disciplined-sigma",
      onRehydrateStorage: () => (state) => {
        if (state) applySigma(state.on);
      },
    }
  )
);
