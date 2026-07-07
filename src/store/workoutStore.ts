import { create } from "zustand";
import { persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

import type { WorkoutExercise, WorkoutSession } from "@/types/workout";

export function blankExercise(name = ""): WorkoutExercise {
  return { id: crypto.randomUUID(), name };
}

interface State {
  sessions: WorkoutSession[];
}

// No sample data: sessions sync to the signed-in account, so seeding demo
// items here would fill every new account with them.
const initialState: State = {
  sessions: [],
};

interface Actions {
  addSession: (
    session: Omit<WorkoutSession, "id" | "exercises"> & { exercises?: WorkoutExercise[] }
  ) => string;
  updateSession: (id: string, changes: Partial<Omit<WorkoutSession, "id">>) => void;
  deleteSession: (id: string) => void;
}

export const useWorkoutStore = create<State & Actions>()(
  persist(
    immer((set) => ({
      ...initialState,

      addSession: (session) => {
        const id = crypto.randomUUID();
        set((state) => {
          state.sessions.push({
            ...session,
            id,
            exercises: session.exercises ?? [blankExercise()],
          });
        });
        return id;
      },

      updateSession: (id, changes) =>
        set((state) => {
          const session = state.sessions.find((s) => s.id === id);
          if (session) Object.assign(session, changes);
        }),

      deleteSession: (id) =>
        set((state) => {
          const index = state.sessions.findIndex((s) => s.id === id);
          if (index !== -1) state.sessions.splice(index, 1);
        }),
    })),
    {
      name: "disciplined-workouts",
    }
  )
);
