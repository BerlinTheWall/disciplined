import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

// Transient (non-persisted) cross-page intent: "jump to the Workout section and
// open this session's detail". Set from a linked schedule task; consumed by the
// Workout page once it mounts, then cleared.

interface State {
  pendingSessionId: string | null;
}

const initialState: State = {
  pendingSessionId: null,
};

interface Actions {
  openSession: (id: string) => void;
  clear: () => void;
}

export const useWorkoutFocusStore = create<State & Actions>()(
  immer((set) => ({
    ...initialState,

    openSession: (id) =>
      set((state) => {
        state.pendingSessionId = id;
      }),

    clear: () =>
      set((state) => {
        state.pendingSessionId = null;
      }),
  }))
);
