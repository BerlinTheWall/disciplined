import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

// Transient (non-persisted) cross-page intent: "go to the schedule and reveal
// this timeline item". Set from the Home page's focus card; consumed by
// DaySchedule when it mounts, which scrolls the item into view, then cleared.
// The id may be a task or a habit — both render as rows with a data-item-id.

interface State {
  pendingItemId: string | null;
}

const initialState: State = {
  pendingItemId: null,
};

interface Actions {
  focusItem: (id: string) => void;
  clear: () => void;
}

export const useScheduleFocusStore = create<State & Actions>()(
  immer((set) => ({
    ...initialState,

    focusItem: (id) =>
      set((state) => {
        state.pendingItemId = id;
      }),

    clear: () =>
      set((state) => {
        state.pendingItemId = null;
      }),
  }))
);
