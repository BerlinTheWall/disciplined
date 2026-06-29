import { create } from "zustand";
import { persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

import type { Habit } from "@/types/habits";

interface State {
  habits: Habit[];
}

const initialState: State = {
  habits: [
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
  ],
};

interface Actions {
  addHabit: (habit: Omit<Habit, "id" | "completedDates">) => string;
  toggleHabitCompleted: (id: string, date: string) => void;
  updateHabitTime: (id: string, startMinutes: number) => void;
  updateHabitDuration: (id: string, durationMinutes: number) => void;
  deleteHabit: (id: string) => void;
  skipHabitOccurrence: (id: string, date: string) => void;
  updateHabit: (id: string, changes: Partial<Omit<Habit, "id">>) => void;
}

export const useHabitStore = create<State & Actions>()(
  persist(
    immer((set) => ({
      ...initialState,

      addHabit: (habit) => {
        const id = crypto.randomUUID();
        set((state) => {
          state.habits.push({ ...habit, id, completedDates: [] });
        });
        return id;
      },

      toggleHabitCompleted: (id, date) =>
        set((state) => {
          const habit = state.habits.find((h) => h.id === id);
          if (!habit) return;
          const idx = habit.completedDates.indexOf(date);
          if (idx === -1) habit.completedDates.push(date);
          else habit.completedDates.splice(idx, 1);
        }),

      updateHabitTime: (id, startMinutes) =>
        set((state) => {
          const habit = state.habits.find((h) => h.id === id);
          if (habit) habit.startMinutes = Math.max(0, startMinutes);
        }),

      updateHabitDuration: (id, durationMinutes) =>
        set((state) => {
          const habit = state.habits.find((h) => h.id === id);
          if (habit) habit.durationMinutes = Math.max(15, durationMinutes);
        }),

      deleteHabit: (id) =>
        set((state) => {
          const index = state.habits.findIndex((h) => h.id === id);
          if (index !== -1) state.habits.splice(index, 1);
        }),

      skipHabitOccurrence: (id, date) =>
        set((state) => {
          const habit = state.habits.find((h) => h.id === id);
          if (!habit) return;
          habit.skippedDates ??= [];
          if (!habit.skippedDates.includes(date)) habit.skippedDates.push(date);
        }),

      updateHabit: (id, changes) =>
        set((state) => {
          const habit = state.habits.find((h) => h.id === id);
          if (habit) Object.assign(habit, changes);
        }),
    })),
    {
      name: "disciplined-habits",
    }
  )
);
