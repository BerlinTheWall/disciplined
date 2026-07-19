import { create } from "zustand";
import { persist } from "zustand/middleware";

// First-launch guided tour state. `step` survives restarts so a half-finished
// tour resumes where it left off; `done` ends it forever. `baselineTasks`
// snapshots how many tasks existed when the tour started, so the "create a
// task" step can tell a genuinely new task from pre-existing ones.
interface TutorialState {
  done: boolean;
  step: number;
  baselineTasks: number;
  start: (baselineTasks: number) => void;
  setStep: (step: number) => void;
  finish: () => void;
  // Replay from Settings: back to the welcome card as if it never ran.
  restart: () => void;
}

export const useTutorialStore = create<TutorialState>()(
  persist(
    (set) => ({
      done: false,
      step: 0,
      baselineTasks: 0,
      start: (baselineTasks) => set({ step: 1, baselineTasks }),
      setStep: (step) => set({ step }),
      finish: () => set({ done: true }),
      restart: () => set({ done: false, step: 0 }),
    }),
    { name: "disciplined-tutorial" }
  )
);
