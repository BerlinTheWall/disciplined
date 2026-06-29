import { create } from "zustand";

// Transient (non-persisted) cross-page intent: "jump to the Workout section and
// open this session's detail". Set from a linked schedule task; consumed by the
// Workout page once it mounts, then cleared.
interface WorkoutFocusStore {
  pendingSessionId: string | null;
  openSession: (id: string) => void;
  clear: () => void;
}

export const useWorkoutFocusStore = create<WorkoutFocusStore>((set) => ({
  pendingSessionId: null,
  openSession: (id) => set({ pendingSessionId: id }),
  clear: () => set({ pendingSessionId: null }),
}));
