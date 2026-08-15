import { create } from "zustand";

// Which of Goals & Plans' two top-level views is showing — the period-browsing
// overview (Week/Month/Year rail) or a flat list of every goal. Lives in its
// own store (like goalFocusStore) rather than local state so the header
// toggle in App.tsx — rendered outside GoalsPage — can drive it. Not
// persisted: Overview is the page's primary daily-use view, so it always
// starts there; "All goals" is an occasional lookup, not a lasting preference.
interface GoalsViewState {
  view: "overview" | "all";
  setView: (view: "overview" | "all") => void;
}

export const useGoalsViewStore = create<GoalsViewState>((set) => ({
  view: "overview",
  setView: (view) => set({ view }),
}));
