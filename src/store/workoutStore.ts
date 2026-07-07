import { create } from "zustand";
import { persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

import { WORKOUT_TYPE_META } from "@/lib/workout";
import type { WorkoutExercise, WorkoutSession } from "@/types/workout";

export function blankExercise(name = ""): WorkoutExercise {
  return { id: crypto.randomUUID(), name };
}

interface State {
  sessions: WorkoutSession[];
}

// Sample ids are random, not fixed: these rows sync to the backend per
// account, and a fixed id would collide with the copy another account
// already owns (the server then rejects the create as someone else's row).
const initialState: State = {
  sessions: [
    {
      id: crypto.randomUUID(),
      name: "Push day",
      type: "gym",
      color: WORKOUT_TYPE_META.gym.color,
      exercises: [
        { id: "e1", name: "Bench press", sets: 3, reps: 8, weight: 60, restSec: 90 },
        { id: "e2", name: "Overhead press", sets: 3, reps: 10, weight: 35, restSec: 90 },
        { id: "e3", name: "Tricep pushdown", sets: 3, reps: 12, restSec: 60 },
      ],
    },
    {
      id: crypto.randomUUID(),
      name: "5k tempo run",
      type: "running",
      color: WORKOUT_TYPE_META.running.color,
      exercises: [
        { id: "e4", name: "Warm-up jog", distance: 1, durationMin: 7, pace: "6:30 /km" },
        {
          id: "e5",
          name: "Tempo block",
          distance: 3,
          durationMin: 15,
          pace: "5:00 /km",
          incline: 1,
        },
        { id: "e6", name: "Cool down", distance: 1, durationMin: 7 },
      ],
    },
  ],
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
