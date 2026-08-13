import { create } from "zustand";

import { api, type ScheduledTaskProposal } from "@/lib/api";
import { milestoneSchedulingWindows } from "@/lib/goalProgress";
import { refreshForActions } from "@/store/chatStore";
import { useGoalStore } from "@/store/goalStore";
import type { Goal } from "@/types/goals";

// State for the goal-scheduling wizard — deliberately its own store, same
// isolation weekPlanStore already established, so a bug here can't affect
// the chat assistant. The only thing borrowed from chatStore is
// refreshForActions, exported there specifically for this kind of reuse.
// `start` is called both from GoalPlanWizard (chained after milestones are
// committed, or immediately for an already-milestoned goal) and, indirectly,
// nowhere else — GoalScheduleSheet itself is the sole reader of this store.

interface State {
  isOpen: boolean;
  goalId: string | null;
  goalTitle: string;
  busy: boolean;
  message: string | null;
  proposals: ScheduledTaskProposal[];
  resolved: boolean;
  error: string | null;
}

interface Actions {
  start: (goal: Goal) => Promise<void>;
  close: () => void;
  removeProposal: (index: number) => void;
  confirm: () => Promise<void>;
}

const initialState: State = {
  isOpen: false,
  goalId: null,
  goalTitle: "",
  busy: false,
  message: null,
  proposals: [],
  resolved: false,
  error: null,
};

export const useGoalScheduleStore = create<State & Actions>()((set, get) => ({
  ...initialState,

  start: async (goal) => {
    const windows = milestoneSchedulingWindows(goal);
    set({
      ...initialState,
      isOpen: true,
      goalId: goal.id,
      goalTitle: goal.title,
    });
    if (windows.length === 0) {
      set({
        message: "Every milestone here is either done or already has sessions scheduled.",
      });
      return;
    }
    set({ busy: true });
    try {
      const res = await api.goalSchedule.generate({ goalTitle: goal.title, milestones: windows });
      set({ busy: false, message: res.message, proposals: res.proposals });
    } catch (e) {
      set({
        busy: false,
        error: e instanceof Error ? e.message : "Couldn't schedule that goal — please try again.",
      });
    }
  },

  close: () => set({ isOpen: false }),

  removeProposal: (index) => {
    set((state) => ({ proposals: state.proposals.filter((_, i) => i !== index) }));
  },

  confirm: async () => {
    const { goalId, proposals } = get();
    if (!goalId || !proposals.length || get().resolved) return;
    set({ busy: true });
    try {
      const actions = proposals.map((p) => ({ tool: p.tool, args: p.args }));
      const { results } = await api.confirmChatActions(actions);
      await refreshForActions(actions);

      // Pair each successfully-created task's real id with the milestone
      // it was proposed for (results are in the same order as `actions`).
      const links = proposals
        .map((p, i) => {
          const result = results[i];
          const created =
            typeof result === "object" && result !== null && "created" in result
              ? (result as { created?: { id?: string } }).created
              : undefined;
          return created?.id ? { milestoneId: p.milestoneId, taskId: created.id } : null;
        })
        .filter((l): l is { milestoneId: string; taskId: string } => l !== null);
      if (links.length > 0) useGoalStore.getState().linkTasksToMilestones(goalId, links);

      set({ busy: false, resolved: true });
    } catch (e) {
      set({
        busy: false,
        error: e instanceof Error ? e.message : "Something went wrong confirming that.",
      });
    }
  },
}));
