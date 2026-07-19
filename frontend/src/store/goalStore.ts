import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { Goal, GoalPeriod } from "@/types/goals";
import type { Priority } from "@/types/task";

// Weekly/monthly/yearly goals & plans. Device-local (like the profile) — a
// simple write-through to localStorage, no backend sync yet.

interface GoalState {
  goals: Goal[];
  addGoal: (input: {
    period: GoalPeriod;
    periodKey: string;
    title: string;
    target: number | null;
    priority?: Priority | null;
  }) => string;
  toggleDone: (id: string) => void;
  addProgress: (id: string, delta: number) => void;
  setPriority: (id: string, priority: Priority | null) => void;
  deleteGoal: (id: string) => void;
  // Persist a manual drag order for one period's goals.
  reorder: (period: GoalPeriod, periodKey: string, orderedIds: string[]) => void;
  // Link a task to at most one goal: remove it from every other goal, add it
  // to `goalId` (or nowhere when null).
  linkTask: (goalId: string | null, taskId: string) => void;
  rollover: (period: GoalPeriod, fromKey: string, toKey: string) => void;
}

export const useGoalStore = create<GoalState>()(
  persist(
    (set, get) => ({
      goals: [],

      addGoal: ({ period, periodKey, title, target, priority = null }) => {
        const id = crypto.randomUUID();
        const maxOrder = get()
          .goals.filter((g) => g.period === period && g.periodKey === periodKey)
          .reduce((m, g) => Math.max(m, g.order), -1);
        set((state) => ({
          goals: [
            ...state.goals,
            {
              id,
              period,
              periodKey,
              title,
              done: false,
              target: target && target > 0 ? target : null,
              progress: 0,
              priority,
              order: maxOrder + 1,
              taskIds: [],
              createdAt: Date.now(),
            },
          ],
        }));
        return id;
      },

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

      setPriority: (id, priority) =>
        set((state) => ({
          goals: state.goals.map((g) => (g.id === id ? { ...g, priority } : g)),
        })),

      deleteGoal: (id) => set((state) => ({ goals: state.goals.filter((g) => g.id !== id) })),

      reorder: (period, periodKey, orderedIds) =>
        set((state) => ({
          goals: state.goals.map((g) => {
            if (g.period !== period || g.periodKey !== periodKey) return g;
            const idx = orderedIds.indexOf(g.id);
            return idx === -1 ? g : { ...g, order: idx };
          }),
        })),

      linkTask: (goalId, taskId) =>
        set((state) => ({
          goals: state.goals.map((g) => {
            const has = g.taskIds.includes(taskId);
            if (g.id === goalId) return has ? g : { ...g, taskIds: [...g.taskIds, taskId] };
            return has ? { ...g, taskIds: g.taskIds.filter((t) => t !== taskId) } : g;
          }),
        })),

      rollover: (period, fromKey, toKey) =>
        set((state) => {
          const existingTitles = new Set(
            state.goals
              .filter((g) => g.period === period && g.periodKey === toKey)
              .map((g) => g.title)
          );
          const maxOrder = state.goals
            .filter((g) => g.period === period && g.periodKey === toKey)
            .reduce((m, g) => Math.max(m, g.order), -1);
          let next = maxOrder;
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
              taskIds: [],
              order: ++next,
              createdAt: Date.now(),
            }));
          return { goals: [...state.goals, ...carried] };
        }),
    }),
    {
      name: "disciplined-goals",
      version: 1,
      // v0 goals lacked priority/order/taskIds — backfill them.
      migrate: (persisted, version) => {
        const state = persisted as { goals?: Goal[] };
        if (version < 1 && state.goals) {
          state.goals = state.goals.map((g, i) => ({
            ...g,
            priority: g.priority ?? null,
            order: g.order ?? i,
            taskIds: g.taskIds ?? [],
          }));
        }
        return state as GoalState;
      },
    }
  )
);
