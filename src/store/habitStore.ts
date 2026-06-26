import { create } from "zustand";
import type { Habit } from "../types/habits";
import { persist } from "zustand/middleware";

interface HabitStore {
  habits: Habit[];
  addHabit: (habit: Omit<Habit, "id" | "completedDates">) => void;
  toggleHabitCompleted: (id: string, date: string) => void;
  updateHabitTime: (id: string, startMinutes: number) => void;
  updateHabitDuration: (id: string, durationMinutes: number) => void;
  deleteHabit: (id: string) => void;
  skipHabitOccurrence: (id: string, date: string) => void;
  updateHabit: (id: string, changes: Partial<Omit<Habit, "id">>) => void;
}

const initialHabits: Habit[] = [
  {
    id: "h1",
    title: "Drink water",
    startMinutes: 8 * 60,
    durationMinutes: 15,
    color: "#38bdf8",
    icon: "health",
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    completedDates: [],
  },
];

export const useHabitStore = create<HabitStore>()(
  persist(
    (set) => ({
      habits: initialHabits,

      addHabit: (habit) =>
        set((state) => ({
          habits: [
            ...state.habits,
            { ...habit, id: crypto.randomUUID(), completedDates: [] },
          ],
        })),

      toggleHabitCompleted: (id, date) =>
        set((state) => ({
          habits: state.habits.map((h) =>
            h.id === id
              ? {
                  ...h,
                  completedDates: h.completedDates.includes(date)
                    ? h.completedDates.filter((d: string) => d !== date)
                    : [...h.completedDates, date],
                }
              : h,
          ),
        })),

      updateHabitTime: (id, startMinutes) =>
        set((state) => ({
          habits: state.habits.map((h) =>
            h.id === id ? { ...h, startMinutes: Math.max(0, startMinutes) } : h,
          ),
        })),

      updateHabitDuration: (id, durationMinutes) =>
        set((state) => ({
          habits: state.habits.map((h) =>
            h.id === id
              ? { ...h, durationMinutes: Math.max(15, durationMinutes) }
              : h,
          ),
        })),

      deleteHabit: (id) =>
        set((state) => ({ habits: state.habits.filter((h) => h.id !== id) })),

      // Remove a single day's occurrence of a recurring habit without deleting
      // the habit itself (the day is hidden via isHabitActiveOnDate).
      skipHabitOccurrence: (id, date) =>
        set((state) => ({
          habits: state.habits.map((h) =>
            h.id === id && !(h.skippedDates ?? []).includes(date)
              ? { ...h, skippedDates: [...(h.skippedDates ?? []), date] }
              : h,
          ),
        })),

      updateHabit: (id, changes) =>
        set((state) => ({
          habits: state.habits.map((h) =>
            h.id === id ? { ...h, ...changes } : h,
          ),
        })),
    }),
    {
      name: "disciplined-habits",
    },
  ),
);
