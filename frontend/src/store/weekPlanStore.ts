import { create } from "zustand";

import { type TimeOfDay } from "@/components/weekplan/timeOfDay";
import { api, type WeekPlanPreference, type WeekPlanProposal } from "@/lib/api";
import { goalLinkTarget, goalPlanContext } from "@/lib/weekPlanContext";
import { refreshForActions } from "@/store/chatStore";
import { useGoalStore } from "@/store/goalStore";
import { useInterestStore } from "@/store/interestStore";
import { useTaskStore } from "@/store/taskStore";

// State for the week auto-plan wizard — deliberately its own store, separate
// from chatStore, so a bug here can't affect the chat assistant. The only
// thing it borrows from chatStore is refreshForActions, already exported
// there specifically so other features can reuse the post-confirm refresh
// logic without duplicating it.
//
// Frequency/time-of-day picks are wizard-session-only: they live here, get
// sent to the backend as part of one request, and are never persisted onto
// Interest/Goal (neither has those fields — see the plan's Phase 2 context).

export type WeekPlanKind = "interest" | "goal";
export type WeekPlanStep = "intro" | "selectInterests" | "selectGoals" | "review";

interface PrefEntry {
  included: boolean;
  timesPerWeek: number;
  timeOfDay: TimeOfDay;
}

interface State {
  isOpen: boolean;
  step: WeekPlanStep;
  busy: boolean;
  message: string | null;
  pendingActions: WeekPlanProposal[];
  resolved: boolean;
  error: string | null;
  interestPrefs: Record<string, PrefEntry>;
  goalPrefs: Record<string, PrefEntry>;
}

interface Actions {
  start: () => void;
  close: () => void;
  goToStep: (step: WeekPlanStep) => void;
  togglePref: (kind: WeekPlanKind, id: string) => void;
  setTimesPerWeek: (kind: WeekPlanKind, id: string, timesPerWeek: number) => void;
  setTimeOfDay: (kind: WeekPlanKind, id: string, timeOfDay: TimeOfDay) => void;
  generate: () => Promise<void>;
  removeProposal: (index: number) => void;
  confirm: () => Promise<void>;
  discard: () => void;
}

const initialState: State = {
  isOpen: false,
  step: "intro",
  busy: false,
  message: null,
  pendingActions: [],
  resolved: false,
  error: null,
  interestPrefs: {},
  goalPrefs: {},
};

function prefsKey(kind: WeekPlanKind): "interestPrefs" | "goalPrefs" {
  return kind === "interest" ? "interestPrefs" : "goalPrefs";
}

function createdId(result: unknown): string | undefined {
  if (typeof result !== "object" || result === null || !("created" in result)) return undefined;
  return (result as { created?: { id?: string } }).created?.id;
}

// Attaches each confirmed session to the goal it was proposed for, so doing
// the work actually moves that goal — without this the week planner left
// goal sessions as orphans that no progress bar ever noticed. Results come
// back in the same order as the actions that produced them (see
// goalScheduleStore.confirm, which pairs them the same way).
//
// Where it attaches is decided by goalLinkTarget, not by preference: linking
// at goal level to a goal tracked by milestones or a manual count would
// switch how that goal is tracked and throw away the progress it shows, so
// those either link to the milestone the session was proposed for or not at
// all. A session that can't be linked is still created — it just doesn't
// count toward progress, exactly as a hand-made task wouldn't.
function linkCreatedToGoals(proposals: WeekPlanProposal[], results: unknown[]): void {
  const goals = useGoalStore.getState().goals;
  const { linkTask, linkTasksToMilestones } = useGoalStore.getState();
  const milestoneLinks = new Map<string, { milestoneId: string; taskId: string }[]>();

  proposals.forEach((p, i) => {
    if (p.sourceKind !== "goal" || !p.sourceId) return;
    const taskId = createdId(results[i]);
    if (!taskId) return;
    const goal = goals.find((g) => g.id === p.sourceId);
    if (!goal) return;

    const target = goalLinkTarget(goal);
    if (target === "milestone") {
      // No milestone attribution means there's nowhere safe to put it —
      // falling back to the goal would break its milestone tracking.
      if (!p.sourceMilestoneId) return;
      const links = milestoneLinks.get(goal.id) ?? [];
      links.push({ milestoneId: p.sourceMilestoneId, taskId });
      milestoneLinks.set(goal.id, links);
    } else if (target === "goal") {
      linkTask(goal.id, taskId);
    }
  });

  for (const [goalId, links] of milestoneLinks) linkTasksToMilestones(goalId, links);
}

export const useWeekPlanStore = create<State & Actions>()((set, get) => ({
  ...initialState,

  start: () => set({ ...initialState, isOpen: true }),

  close: () => set({ isOpen: false }),

  goToStep: (step) => set({ step }),

  togglePref: (kind, id) => {
    const key = prefsKey(kind);
    set((state) => {
      const existing = state[key][id];
      const next: PrefEntry = existing
        ? { ...existing, included: !existing.included }
        : { included: true, timesPerWeek: 2, timeOfDay: "any" };
      return { [key]: { ...state[key], [id]: next } } as Pick<State, typeof key>;
    });
  },

  setTimesPerWeek: (kind, id, timesPerWeek) => {
    const key = prefsKey(kind);
    set((state) => {
      const existing = state[key][id];
      if (!existing) return state;
      return { [key]: { ...state[key], [id]: { ...existing, timesPerWeek } } } as Pick<
        State,
        typeof key
      >;
    });
  },

  setTimeOfDay: (kind, id, timeOfDay) => {
    const key = prefsKey(kind);
    set((state) => {
      const existing = state[key][id];
      if (!existing) return state;
      return { [key]: { ...state[key], [id]: { ...existing, timeOfDay } } } as Pick<
        State,
        typeof key
      >;
    });
  },

  generate: async () => {
    const { interestPrefs, goalPrefs } = get();
    const interests = useInterestStore.getState().interests;
    const goals = useGoalStore.getState().goals;
    const tasks = useTaskStore.getState().tasks;

    const preferences: WeekPlanPreference[] = [
      ...interests
        .filter((i) => interestPrefs[i.id]?.included)
        .map((i) => ({
          kind: "interest" as const,
          id: i.id,
          title: i.title,
          timesPerWeek: interestPrefs[i.id].timesPerWeek,
          timeOfDay: interestPrefs[i.id].timeOfDay,
        })),
      ...goals
        .filter((g) => goalPrefs[g.id]?.included)
        .map((g) => ({
          kind: "goal" as const,
          id: g.id,
          title: g.title,
          timesPerWeek: goalPrefs[g.id].timesPerWeek,
          timeOfDay: goalPrefs[g.id].timeOfDay,
          // The goal's next steps, runway and existing sessions — the server
          // can't read any of it (goals are device-local), and without it the
          // planner only ever sees a title. See lib/weekPlanContext.ts.
          ...goalPlanContext(g, tasks, goals),
        })),
    ];

    set({
      step: "review",
      busy: true,
      message: null,
      pendingActions: [],
      resolved: false,
      error: null,
    });
    try {
      const res = await api.weekPlan.generate(preferences);
      set({ busy: false, message: res.message, pendingActions: res.pendingActions });
    } catch (e) {
      set({
        busy: false,
        error: e instanceof Error ? e.message : "Couldn't plan your week — please try again.",
      });
    }
  },

  removeProposal: (index) => {
    set((state) => ({
      pendingActions: state.pendingActions.filter((_, i) => i !== index),
    }));
  },

  confirm: async () => {
    const { pendingActions } = get();
    if (!pendingActions.length || get().resolved) return;
    set({ busy: true });
    try {
      // Stripped back to {tool, args}: sourceKind/sourceId are this feature's
      // own bookkeeping and mean nothing to the generic confirm endpoint.
      const actions = pendingActions.map((p) => ({ tool: p.tool, args: p.args }));
      const { results } = await api.confirmChatActions(actions);
      await refreshForActions(actions);
      linkCreatedToGoals(pendingActions, results);
      set({ busy: false, resolved: true });
    } catch (e) {
      set({
        busy: false,
        error: e instanceof Error ? e.message : "Something went wrong confirming that.",
      });
    }
  },

  discard: () => set({ isOpen: false }),
}));
