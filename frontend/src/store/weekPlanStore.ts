import { create } from "zustand";

import { type TimeOfDay } from "@/components/weekplan/timeOfDay";
import { api, type PendingAction, type WeekPlanPreference } from "@/lib/api";
import { refreshForActions } from "@/store/chatStore";
import { useGoalStore } from "@/store/goalStore";
import { useInterestStore } from "@/store/interestStore";

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
  pendingActions: PendingAction[];
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
      await api.confirmChatActions(pendingActions);
      await refreshForActions(pendingActions);
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
