import { create } from "zustand";

export interface PendingMilestoneLink {
  goalId: string;
  milestoneId: string;
}

// Three one-shot cross-page signals live here:
// - pendingLinkGoalId: "open the add-task sheet and link the new task to this
//   goal." The Goals page sets it (from a goal's + Add task), App opens the
//   sheet, and AddItemSheet consumes it on open so the created task links back.
// - pendingLinkMilestone: same idea, one level down — "link the new task to
//   this specific milestone" (MilestoneDetailSheet's own + Add task). Kept
//   separate from pendingLinkGoalId (rather than reusing it) since the two
//   route to different places on the goal: a plain goal-level link vs.
//   linkTasksToMilestones, which a milestoned goal's progress actually reads.
// - pendingViewGoalId: "jump to the Goals page and open this goal's detail
//   screen" — set from a linked task (mirrors workoutFocusStore/recipeFocusStore).
//   App.tsx navigates on it; GoalsPage consumes it and clears it.
interface GoalFocusState {
  pendingLinkGoalId: string | null;
  pendingLinkMilestone: PendingMilestoneLink | null;
  pendingViewGoalId: string | null;
  requestAddTask: (goalId: string) => void;
  requestAddTaskForMilestone: (goalId: string, milestoneId: string) => void;
  consume: () => string | null;
  consumeMilestone: () => PendingMilestoneLink | null;
  openGoal: (goalId: string) => void;
  clearViewGoal: () => void;
}

export const useGoalFocusStore = create<GoalFocusState>((set, get) => ({
  pendingLinkGoalId: null,
  pendingLinkMilestone: null,
  pendingViewGoalId: null,
  requestAddTask: (goalId) => set({ pendingLinkGoalId: goalId }),
  requestAddTaskForMilestone: (goalId, milestoneId) =>
    set({ pendingLinkMilestone: { goalId, milestoneId } }),
  consume: () => {
    const id = get().pendingLinkGoalId;
    if (id !== null) set({ pendingLinkGoalId: null });
    return id;
  },
  consumeMilestone: () => {
    const link = get().pendingLinkMilestone;
    if (link !== null) set({ pendingLinkMilestone: null });
    return link;
  },
  openGoal: (goalId) => set({ pendingViewGoalId: goalId }),
  clearViewGoal: () => set({ pendingViewGoalId: null }),
}));
