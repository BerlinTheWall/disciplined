import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { Goal, GoalPeriod } from "@/types/goals";

// Weekly/monthly/yearly goals. Device-local for now (like the profile) —
// simple write-through to localStorage, no backend sync yet.

interface GoalState {
  goals: Goal[];
  addGoal: (input: {
    period: GoalPeriod;
    periodKey: string;
    title: string;
    target: number | null;
  }) => void;
  toggleDone: (id: string) => void;
  // Nudges a progress goal; reaching the target checks it off, dropping back
  // below un-checks it.
  addProgress: (id: string, delta: number) => void;
  deleteGoal: (id: string) => void;
  // Copies a period's unfinished goals into another period (progress starts
  // fresh). Titles already present in the target period are skipped, so
  // tapping roll-over twice can't duplicate.
  rollover: (period: GoalPeriod, fromKey: string, toKey: string) => void;
}

export const useGoalStore = create<GoalState>()(
  persist(
    (set) => ({
      goals: [],

      addGoal: ({ period, periodKey, title, target }) =>
        set((state) => ({
          goals: [
            ...state.goals,
            {
              id: crypto.randomUUID(),
              period,
              periodKey,
              title,
              done: false,
              target: target && target > 0 ? target : null,
              progress: 0,
              createdAt: Date.now(),
            },
          ],
        })),

      toggleDone: (id) =>
        set((state) => ({
          goals: state.goals.map((g) => (g.id === id ? { ...g, done: !g.done } : g)),
        })),

      addProgress: (id, delta) =>
        set((state) => ({
          goals: state.goals.map((g) => {
            if (g.id !== id || g.target === null) return g;
            const progress = Math.max(0, Math.min(g.target, g.progress + delta));
            return { ...g, progress, done: progress >= g.target };
          }),
        })),

      deleteGoal: (id) => set((state) => ({ goals: state.goals.filter((g) => g.id !== id) })),

      rollover: (period, fromKey, toKey) =>
        set((state) => {
          const existingTitles = new Set(
            state.goals
              .filter((g) => g.period === period && g.periodKey === toKey)
              .map((g) => g.title)
          );
          const carried = state.goals
            .filter(
              (g) =>
                g.period === period &&
                g.periodKey === fromKey &&
                !g.done &&
                !existingTitles.has(g.title)
            )
            .map((g) => ({
              ...g,
              id: crypto.randomUUID(),
              periodKey: toKey,
              progress: 0,
              done: false,
              createdAt: Date.now(),
            }));
          return { goals: [...state.goals, ...carried] };
        }),
    }),
    { name: "disciplined-goals" }
  )
);
