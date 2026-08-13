import { create } from "zustand";

// One-shot signal: "run the AI planning wizard (why -> milestones ->
// schedule) for this goal." Set right after creating a goal, or from the
// detail screen's "Plan with AI" chip — GoalPlanWizard (mounted once in
// GoalsPage) consumes it. Same weight class as goalFocusStore.ts.
interface GoalPlanWizardState {
  goalId: string | null;
  start: (goalId: string) => void;
  finish: () => void;
}

export const useGoalPlanWizardStore = create<GoalPlanWizardState>((set, get) => ({
  goalId: null,
  // No-op if a wizard is already running for another goal — avoids two
  // wizards racing over the same shared MilestoneSuggestSheet/GoalScheduleSheet.
  start: (goalId) => {
    if (get().goalId) return;
    set({ goalId });
  },
  finish: () => set({ goalId: null }),
}));
