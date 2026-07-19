import { create } from "zustand";

// One-shot signal: "open the add-task sheet and link the new task to this
// goal." The Goals page sets it (from a goal's + Add task), App opens the
// sheet, and AddItemSheet consumes it on open so the created task links back.
interface GoalFocusState {
  pendingLinkGoalId: string | null;
  requestAddTask: (goalId: string) => void;
  consume: () => string | null;
}

export const useGoalFocusStore = create<GoalFocusState>((set, get) => ({
  pendingLinkGoalId: null,
  requestAddTask: (goalId) => set({ pendingLinkGoalId: goalId }),
  consume: () => {
    const id = get().pendingLinkGoalId;
    if (id !== null) set({ pendingLinkGoalId: null });
    return id;
  },
}));
