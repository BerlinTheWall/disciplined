import { create } from "zustand";
import { persist } from "zustand/middleware";

import { canLinkGoalPeriod } from "@/lib/goalPeriods";
import { priorityRank } from "@/lib/goalPriority";
import type { Goal, GoalCategory, GoalPeriod } from "@/types/goals";
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
    category?: GoalCategory | null;
    description?: string | null;
    startDate?: string | null;
    durationCount?: number | null;
  }) => string;
  toggleDone: (id: string) => void;
  addProgress: (id: string, delta: number) => void;
  setPriority: (id: string, priority: Priority | null) => void;
  setNote: (id: string, note: string) => void;
  // Title/description/dates edited together from the detail sheet's Edit
  // screen. Priority is deliberately not here — it goes through setPriority
  // so an edit that changes it still re-slots the goal by rank.
  updateGoal: (
    id: string,
    updates: {
      title: string;
      description: string | null;
      startDate: string | null;
      durationCount: number | null;
      periodKey: string;
    }
  ) => void;
  // Weight a linked task or goal as a percent of the parent; null reverts it
  // to the even auto-split of the remaining percentage.
  setWeight: (goalId: string, itemId: string, weight: number | null) => void;
  deleteGoal: (id: string) => void;
  // Persist a manual drag order for one period's goals.
  reorder: (period: GoalPeriod, periodKey: string, orderedIds: string[]) => void;
  // Link a task to at most one goal: remove it from every other goal, add it
  // to `goalId` (or nowhere when null).
  linkTask: (goalId: string | null, taskId: string) => void;
  // Same "at most one parent" rule as linkTask, plus: a goal may only be
  // linked under a parent in a strictly coarser period (canLinkGoalPeriod) —
  // silently no-ops otherwise, since the UI never offers an ineligible goal
  // in the first place.
  linkGoal: (goalId: string | null, childGoalId: string) => void;
  addMilestone: (goalId: string, label: string) => void;
  setMilestoneLabel: (goalId: string, milestoneId: string, label: string) => void;
  // Appends a whole batch in one update (e.g. accepted AI suggestions) —
  // same shape addMilestone would produce one at a time, just atomic so
  // there's no need to read the state back to find the new ids.
  addMilestones: (goalId: string, items: { label: string; weight?: number }[]) => void;
  toggleMilestone: (goalId: string, milestoneId: string) => void;
  deleteMilestone: (goalId: string, milestoneId: string) => void;
  // Weight a milestone as a percent of its goal; null reverts it to the even
  // auto-split of the remaining percentage — same rule as setWeight above,
  // one level down.
  setMilestoneWeight: (goalId: string, milestoneId: string, weight: number | null) => void;
  // Attaches freshly-scheduled tasks to their milestones in one update (see
  // GoalScheduleSheet) — a task ends up owned by exactly one milestone, so
  // it's dropped from any other milestone in this goal that already had it.
  linkTasksToMilestones: (goalId: string, links: { milestoneId: string; taskId: string }[]) => void;
}

export const useGoalStore = create<GoalState>()(
  persist(
    (set) => ({
      goals: [],

      addGoal: ({
        period,
        periodKey,
        title,
        target,
        priority = null,
        category = null,
        description = null,
        startDate = null,
        durationCount = null,
      }) => {
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
                category,
                description,
                startDate,
                durationCount: durationCount && durationCount > 0 ? durationCount : null,
                order: Number.MAX_SAFE_INTEGER,
                linkedTaskIds: [],
                linkedGoalIds: [],
                weights: {},
                milestones: [],
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

      setNote: (id, note) =>
        set((state) => ({
          goals: state.goals.map((g) => (g.id === id ? { ...g, note } : g)),
        })),

      updateGoal: (id, updates) =>
        set((state) => ({
          goals: state.goals.map((g) => (g.id === id ? { ...g, ...updates } : g)),
        })),

      setWeight: (goalId, itemId, weight) =>
        set((state) => ({
          goals: state.goals.map((g) => {
            if (g.id !== goalId) return g;
            const weights = { ...g.weights };
            if (weight === null) delete weights[itemId];
            else weights[itemId] = Math.max(0, Math.min(100, Math.round(weight)));
            return { ...g, weights };
          }),
        })),

      deleteGoal: (id) =>
        set((state) => ({
          goals: state.goals
            // Drop the goal itself, and drop it out of anyone who linked it.
            .filter((g) => g.id !== id)
            .map((g) => {
              if (!g.linkedGoalIds.includes(id)) return g;
              const weights = { ...g.weights };
              delete weights[id];
              return { ...g, linkedGoalIds: g.linkedGoalIds.filter((gid) => gid !== id), weights };
            }),
        })),

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
            const has = g.linkedTaskIds.includes(taskId);
            if (g.id === goalId)
              return has ? g : { ...g, linkedTaskIds: [...g.linkedTaskIds, taskId] };
            if (!has) return g;
            // Unlinking: drop the task and any weight it carried.
            const weights = { ...g.weights };
            delete weights[taskId];
            return { ...g, linkedTaskIds: g.linkedTaskIds.filter((t) => t !== taskId), weights };
          }),
        })),

      linkGoal: (goalId, childGoalId) =>
        set((state) => {
          const child = state.goals.find((g) => g.id === childGoalId);
          if (!child) return state;
          return {
            goals: state.goals.map((g) => {
              const has = g.linkedGoalIds.includes(childGoalId);
              if (g.id === goalId) {
                if (has || g.id === childGoalId || !canLinkGoalPeriod(g.period, child.period)) {
                  return g;
                }
                return { ...g, linkedGoalIds: [...g.linkedGoalIds, childGoalId] };
              }
              if (!has) return g;
              const weights = { ...g.weights };
              delete weights[childGoalId];
              return {
                ...g,
                linkedGoalIds: g.linkedGoalIds.filter((gid) => gid !== childGoalId),
                weights,
              };
            }),
          };
        }),

      addMilestone: (goalId, label) =>
        set((state) => ({
          goals: state.goals.map((g) =>
            g.id === goalId
              ? {
                  ...g,
                  milestones: [...g.milestones, { id: crypto.randomUUID(), label, done: false }],
                }
              : g
          ),
        })),

      addMilestones: (goalId, items) =>
        set((state) => ({
          goals: state.goals.map((g) =>
            g.id === goalId
              ? {
                  ...g,
                  milestones: [
                    ...g.milestones,
                    ...items.map((it) => ({
                      id: crypto.randomUUID(),
                      label: it.label,
                      done: false,
                      weight: it.weight,
                    })),
                  ],
                }
              : g
          ),
        })),

      setMilestoneLabel: (goalId, milestoneId, label) =>
        set((state) => ({
          goals: state.goals.map((g) =>
            g.id === goalId
              ? {
                  ...g,
                  milestones: g.milestones.map((m) => (m.id === milestoneId ? { ...m, label } : m)),
                }
              : g
          ),
        })),

      toggleMilestone: (goalId, milestoneId) =>
        set((state) => ({
          goals: state.goals.map((g) =>
            g.id === goalId
              ? {
                  ...g,
                  milestones: g.milestones.map((m) =>
                    m.id === milestoneId ? { ...m, done: !m.done } : m
                  ),
                }
              : g
          ),
        })),

      deleteMilestone: (goalId, milestoneId) =>
        set((state) => ({
          goals: state.goals.map((g) =>
            g.id === goalId
              ? { ...g, milestones: g.milestones.filter((m) => m.id !== milestoneId) }
              : g
          ),
        })),

      setMilestoneWeight: (goalId, milestoneId, weight) =>
        set((state) => ({
          goals: state.goals.map((g) =>
            g.id === goalId
              ? {
                  ...g,
                  milestones: g.milestones.map((m) =>
                    m.id === milestoneId
                      ? {
                          ...m,
                          weight:
                            weight === null
                              ? undefined
                              : Math.max(0, Math.min(100, Math.round(weight))),
                        }
                      : m
                  ),
                }
              : g
          ),
        })),

      linkTasksToMilestones: (goalId, links) =>
        set((state) => ({
          goals: state.goals.map((g) => {
            if (g.id !== goalId) return g;
            const byMilestone = new Map<string, string[]>();
            for (const { milestoneId, taskId } of links) {
              byMilestone.set(milestoneId, [...(byMilestone.get(milestoneId) ?? []), taskId]);
            }
            const movingTaskIds = new Set(links.map((l) => l.taskId));
            return {
              ...g,
              milestones: g.milestones.map((m) => {
                const incoming = byMilestone.get(m.id);
                const kept = (m.linkedTaskIds ?? []).filter((id) => !movingTaskIds.has(id));
                if (!incoming) {
                  return kept.length === (m.linkedTaskIds ?? []).length
                    ? m
                    : { ...m, linkedTaskIds: kept };
                }
                return { ...m, linkedTaskIds: [...kept, ...incoming] };
              }),
            };
          }),
        })),
    }),
    {
      name: "disciplined-goals",
      version: 5,
      // Backfill fields added over time: priority/order/taskIds (v1),
      // taskWeights (v2), the v3 rebuild — taskIds/taskWeights renamed to
      // linkedTaskIds/weights, plus new linkedGoalIds/milestones — v4's
      // category/startDate/durationCount, and v5's description. Reads
      // straight off whatever old field names are present regardless of the
      // stored version, so it's safe no matter which version a device is
      // migrating up from.
      migrate: (persisted) => {
        const state = persisted as {
          goals?: (Goal & { taskIds?: string[]; taskWeights?: Record<string, number> })[];
        };
        if (state.goals) {
          state.goals = state.goals.map((g, i) => ({
            ...g,
            priority: g.priority ?? null,
            order: g.order ?? i,
            linkedTaskIds: g.linkedTaskIds ?? g.taskIds ?? [],
            linkedGoalIds: g.linkedGoalIds ?? [],
            weights: g.weights ?? g.taskWeights ?? {},
            milestones: g.milestones ?? [],
            category: g.category ?? null,
            startDate: g.startDate ?? null,
            durationCount: g.durationCount ?? null,
            description: g.description ?? null,
          }));
        }
        return state as GoalState;
      },
    }
  )
);
