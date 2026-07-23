import { create } from "zustand";
import { persist } from "zustand/middleware";

import { priorityRank } from "@/lib/goalPriority";
import type { Goal, GoalPeriod } from "@/types/goals";
import type { Priority } from "@/types/task";

// Re-slot one goal within its period by priority (high first), preserving the
// relative order of its siblings, then renumber every order in that period.
// Used when a goal is added or re-prioritized so the list stays priority-sorted
// until the user drags something.
function reslotByPriority(goals: Goal[], goalId: string): Goal[] {
  const g = goals.find((x) => x.id === goalId);
  if (!g) return goals;
  const siblings = goals
    .filter((x) => x.period === g.period && x.periodKey === g.periodKey && x.id !== goalId)
    .sort((a, b) => a.order - b.order);
  const rank = priorityRank(g.priority);
  let idx = siblings.findIndex((o) => priorityRank(o.priority) > rank);
  if (idx === -1) idx = siblings.length;
  const ordered = [...siblings.slice(0, idx), g, ...siblings.slice(idx)];
  const orderById = new Map(ordered.map((x, i) => [x.id, i]));
  return goals.map((x) => (orderById.has(x.id) ? { ...x, order: orderById.get(x.id)! } : x));
}

// Weekly/monthly/yearly goals & plans. Write-through to localStorage, synced
// to the backend via lib/sync.ts (also lets the chat assistant read/update it).

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
  // Weight a linked task as a percent of the goal; null reverts it to the
  // even auto-split of the remaining percentage.
  setTaskWeight: (goalId: string, taskId: string, weight: number | null) => void;
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
    (set) => ({
      goals: [],

      addGoal: ({ period, periodKey, title, target, priority = null }) => {
        const id = crypto.randomUUID();
        set((state) => ({
          // Append, then slot into place by priority.
          goals: reslotByPriority(
            [
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
                order: Number.MAX_SAFE_INTEGER,
                taskIds: [],
                taskWeights: {},
                createdAt: Date.now(),
              },
            ],
            id
          ),
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
          // Re-slot by the new priority (manual drags aside).
          goals: reslotByPriority(
            state.goals.map((g) => (g.id === id ? { ...g, priority } : g)),
            id
          ),
        })),

      setTaskWeight: (goalId, taskId, weight) =>
        set((state) => ({
          goals: state.goals.map((g) => {
            if (g.id !== goalId) return g;
            const weights = { ...(g.taskWeights ?? {}) };
            if (weight === null) delete weights[taskId];
            else weights[taskId] = Math.max(0, Math.min(100, Math.round(weight)));
            return { ...g, taskWeights: weights };
          }),
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
            if (!has) return g;
            // Unlinking: drop the task and any weight it carried.
            const weights = { ...(g.taskWeights ?? {}) };
            delete weights[taskId];
            return { ...g, taskIds: g.taskIds.filter((t) => t !== taskId), taskWeights: weights };
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
              taskWeights: {},
              order: ++next,
              createdAt: Date.now(),
            }));
          return { goals: [...state.goals, ...carried] };
        }),
    }),
    {
      name: "disciplined-goals",
      version: 2,
      // Backfill fields added over time: priority/order/taskIds (v1) and
      // taskWeights (v2).
      migrate: (persisted) => {
        const state = persisted as { goals?: Goal[] };
        if (state.goals) {
          state.goals = state.goals.map((g, i) => ({
            ...g,
            priority: g.priority ?? null,
            order: g.order ?? i,
            taskIds: g.taskIds ?? [],
            taskWeights: g.taskWeights ?? {},
          }));
        }
        return state as GoalState;
      },
    }
  )
);
