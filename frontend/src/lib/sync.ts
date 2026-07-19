import { api, type ApiResource } from "@/lib/api";
import { useGoalStore } from "@/store/goalStore";
import { useHabitStore } from "@/store/habitStore";
import { useMealStore } from "@/store/mealStore";
import { useTaskStore } from "@/store/taskStore";
import { useWorkoutStore } from "@/store/workoutStore";
import type { Goal } from "@/types/goals";
import type { Habit } from "@/types/habits";
import type { Meal } from "@/types/meal";
import type { Task } from "@/types/task";
import type { WorkoutSession } from "@/types/workout";

// Write-through sync between the zustand stores and the backend.
//
// The stores stay the synchronous source of truth for the UI (optimistic,
// offline-capable). This module:
//   1. hydrates each store from the backend on startup (server wins; an empty
//      server is seeded from localStorage on first run),
//   2. subscribes to store changes and diff-pushes creates/updates/deletes.
// If the backend is unreachable at startup, the app runs local-only.

const DEBOUNCE_MS = 600;

interface Syncable<T extends { id: string }> {
  label: string;
  api: ApiResource<T>;
  getItems: () => T[];
  setItems: (items: T[]) => void;
  subscribe: (onChange: () => void) => void;
}

function createSyncer<T extends { id: string }>(cfg: Syncable<T>) {
  // id -> serialized item as last successfully synced to the server
  let snapshot = new Map<string, string>();
  let timer: number | undefined;
  let pushing = false;
  let rerun = false;

  const toEntries = (items: T[]) =>
    new Map(items.map((item) => [item.id, JSON.stringify(item)] as const));

  async function push() {
    if (pushing) {
      rerun = true;
      return;
    }
    pushing = true;
    try {
      const current = toEntries(cfg.getItems());
      for (const [id, json] of current) {
        const prev = snapshot.get(id);
        if (prev === json) continue;
        try {
          const item = JSON.parse(json) as T;
          if (prev === undefined) await cfg.api.create(item);
          else await cfg.api.update(item);
          snapshot.set(id, json);
        } catch (e) {
          console.warn(`[sync] ${cfg.label}: failed to save ${id}`, e);
        }
      }
      for (const id of [...snapshot.keys()]) {
        if (current.has(id)) continue;
        try {
          await cfg.api.remove(id);
          snapshot.delete(id);
        } catch (e) {
          console.warn(`[sync] ${cfg.label}: failed to delete ${id}`, e);
        }
      }
    } finally {
      pushing = false;
      if (rerun) {
        rerun = false;
        schedule();
      }
    }
  }

  function schedule() {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void push(), DEBOUNCE_MS);
  }

  // Pull the server state into the store (e.g. after the chat assistant
  // changed things server-side). Sets the snapshot first so the store update
  // doesn't echo back as a push.
  async function refresh() {
    const server = await cfg.api.list();
    snapshot = toEntries(server);
    cfg.setItems(server);
  }

  async function hydrate() {
    const server = await cfg.api.list();
    const local = cfg.getItems();
    if (server.length > 0) {
      snapshot = toEntries(server);
      cfg.setItems(server);
    } else if (local.length > 0) {
      for (const item of local) {
        try {
          await cfg.api.create(item);
          snapshot.set(item.id, JSON.stringify(item));
        } catch (e) {
          console.warn(`[sync] ${cfg.label}: failed to seed ${item.id}`, e);
        }
      }
    }
    cfg.subscribe(schedule);
  }

  return { hydrate, refresh };
}

const syncers = {
  events: createSyncer<Task>({
    label: "events",
    api: api.events,
    getItems: () => useTaskStore.getState().tasks,
    setItems: (tasks) => useTaskStore.setState({ tasks }),
    subscribe: (onChange) =>
      useTaskStore.subscribe((state, prev) => {
        if (state.tasks !== prev.tasks) onChange();
      }),
  }),
  habits: createSyncer<Habit>({
    label: "habits",
    api: api.habits,
    getItems: () => useHabitStore.getState().habits,
    setItems: (habits) => useHabitStore.setState({ habits }),
    subscribe: (onChange) =>
      useHabitStore.subscribe((state, prev) => {
        if (state.habits !== prev.habits) onChange();
      }),
  }),
  workouts: createSyncer<WorkoutSession>({
    label: "workouts",
    api: api.workouts,
    getItems: () => useWorkoutStore.getState().sessions,
    setItems: (sessions) => useWorkoutStore.setState({ sessions }),
    subscribe: (onChange) =>
      useWorkoutStore.subscribe((state, prev) => {
        if (state.sessions !== prev.sessions) onChange();
      }),
  }),
  meals: createSyncer<Meal>({
    label: "meals",
    api: api.meals,
    getItems: () => useMealStore.getState().meals,
    setItems: (meals) => useMealStore.setState({ meals }),
    subscribe: (onChange) =>
      useMealStore.subscribe((state, prev) => {
        if (state.meals !== prev.meals) onChange();
      }),
  }),
  goals: createSyncer<Goal>({
    label: "goals",
    api: api.goals,
    getItems: () => useGoalStore.getState().goals,
    setItems: (goals) => useGoalStore.setState({ goals }),
    subscribe: (onChange) =>
      useGoalStore.subscribe((state, prev) => {
        if (state.goals !== prev.goals) onChange();
      }),
  }),
};

export async function startSync(): Promise<void> {
  try {
    await api.health();
  } catch {
    console.warn("[sync] backend unreachable — running local-only");
    return;
  }
  await Promise.all(
    Object.values(syncers).map((s) =>
      s.hydrate().catch((e) => console.warn("[sync] hydrate failed", e))
    )
  );
}

// For the chat assistant: after a chat turn whose actions mutated the
// schedule, pull the server's version of events into the store.
export async function refreshEvents(): Promise<void> {
  await syncers.events.refresh();
}
