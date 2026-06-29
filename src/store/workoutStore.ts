import { create } from "zustand";
import { persist } from "zustand/middleware";

import { WORKOUT_TYPE_META } from "@/lib/workout";
import type { WorkoutExercise, WorkoutSession } from "@/types/workout";

// Workout sessions are reusable plans. Schedule tasks link to them by id.
interface WorkoutStore {
  sessions: WorkoutSession[];
  addSession: (
    session: Omit<WorkoutSession, "id" | "exercises"> & { exercises?: WorkoutExercise[] }
  ) => string;
  updateSession: (id: string, changes: Partial<Omit<WorkoutSession, "id">>) => void;
  deleteSession: (id: string) => void;
}

function blankExercise(name = ""): WorkoutExercise {
  return { id: crypto.randomUUID(), name };
}

const initialSessions: WorkoutSession[] = [
  {
    id: "w1",
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
    id: "w2",
    name: "5k tempo run",
    type: "running",
    color: WORKOUT_TYPE_META.running.color,
    exercises: [
      { id: "e4", name: "Warm-up jog", distance: 1, durationMin: 7, pace: "6:30 /km" },
      { id: "e5", name: "Tempo block", distance: 3, durationMin: 15, pace: "5:00 /km", incline: 1 },
      { id: "e6", name: "Cool down", distance: 1, durationMin: 7 },
    ],
  },
];

export const useWorkoutStore = create<WorkoutStore>()(
  persist(
    (set) => ({
      sessions: initialSessions,

      addSession: (session) => {
        const id = crypto.randomUUID();
        set((state) => ({
          sessions: [
            ...state.sessions,
            { ...session, id, exercises: session.exercises ?? [blankExercise()] },
          ],
        }));
        return id;
      },

      updateSession: (id, changes) =>
        set((state) => ({
          sessions: state.sessions.map((s) => (s.id === id ? { ...s, ...changes } : s)),
        })),

      deleteSession: (id) =>
        set((state) => ({ sessions: state.sessions.filter((s) => s.id !== id) })),
    }),
    {
      name: "disciplined-workouts", // localStorage key
    }
  )
);

export { blankExercise };
