import { App as CapacitorApp } from "@capacitor/app";

import { api, type ApiResource } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { useGoalStore } from "@/store/goalStore";
import { useHabitStore } from "@/store/habitStore";
import { useSyncStatusStore } from "@/store/syncStatusStore";
import { useTaskStore } from "@/store/taskStore";
import type { Goal } from "@/types/goals";
import type { Habit } from "@/types/habits";
import type { Task } from "@/types/task";

// Write-through sync between the zustand stores and the backend.
//
// The stores stay the synchronous source of truth for the UI (optimistic,
// offline-capable). This module:
//   1. hydrates each store from the backend on startup, reconciling against
//      whatever was last confirmed synced so a pending offline edit is
//      pushed rather than clobbered by stale server state (see hydrate()),
//   2. subscribes to store changes and diff-pushes creates/updates/deletes,
//   3. retries automatically — the moment connectivity returns, on a regular
//      timer while the app is open, and whenever it's resumed from the
//      background — rather than only reacting to the next unrelated edit,
//   4. publishes what it's doing (useSyncStatusStore) so the UI can show it.
// If the backend is unreachable at startup, the app runs local-only.

const DEBOUNCE_MS = 600;
const RETRY_INTERVAL_MS = 45_000;

interface Syncable<T extends { id: string }> {
  label: string;
  api: ApiResource<T>;
  getItems: () => T[];
  setItems: (items: T[]) => void;
  subscribe: (onChange: () => void) => void;
}

// The "last confirmed synced with the server" snapshot, keyed by whichever
// account is currently signed in — namespaced the same way as
// lib/userScopedStorage.ts, for the same reason: switching accounts on one
// device must never let one account's sync bookkeeping bleed into another's.
function snapshotStorageKey(label: string): string {
  return `disciplined-sync-snapshot:${label}:${useAuthStore.getState().user?.id ?? "anon"}`;
}

function loadSnapshot(label: string): Map<string, string> {
  try {
    const raw = localStorage.getItem(snapshotStorageKey(label));
    return raw ? new Map(Object.entries(JSON.parse(raw) as Record<string, string>)) : new Map();
  } catch {
    return new Map();
  }
}

function saveSnapshot(label: string, snapshot: Map<string, string>): void {
  localStorage.setItem(snapshotStorageKey(label), JSON.stringify(Object.fromEntries(snapshot)));
}

// How many sync operations (push or hydrate, across every domain) are
// currently in flight — the single source of truth for the "syncing" flag,
// since several syncers can legitimately be busy at once.
let activeOps = 0;
function beginOp() {
  activeOps += 1;
  useSyncStatusStore.setState({ syncing: true });
}
function endOp() {
  activeOps = Math.max(0, activeOps - 1);
  if (activeOps === 0) useSyncStatusStore.setState({ syncing: false });
}

function createSyncer<T extends { id: string }>(cfg: Syncable<T>) {
  // id -> serialized item as last successfully synced to the server.
  // Persisted (not just in memory) so hydrate() can tell, across reloads,
  // which local items are genuinely pending edits vs. already-synced state
  // — without that, every reload had to guess, and guessing wrong meant a
  // pending offline edit could get silently overwritten by stale server data.
  let snapshot = loadSnapshot(cfg.label);
  let timer: number | undefined;
  let pushing = false;
  let rerun = false;

  const toEntries = (items: T[]) =>
    new Map(items.map((item) => [item.id, JSON.stringify(item)] as const));

  function persistSnapshot() {
    saveSnapshot(cfg.label, snapshot);
  }

  // How many local items don't (yet) match what's confirmed synced —
  // creates, edits, and deletes all count. Cheap enough to recompute on
  // every change; there's nothing bigger than a few dozen items per domain.
  function pendingCount(): number {
    const current = toEntries(cfg.getItems());
    let count = 0;
    for (const [id, json] of current) if (snapshot.get(id) !== json) count += 1;
    for (const id of snapshot.keys()) if (!current.has(id)) count += 1;
    return count;
  }

  async function push() {
    if (pushing) {
      rerun = true;
      return;
    }
    pushing = true;
    beginOp();
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
          persistSnapshot();
        } catch (e) {
          console.warn(`[sync] ${cfg.label}: failed to save ${id}`, e);
        }
      }
      for (const id of [...snapshot.keys()]) {
        if (current.has(id)) continue;
        try {
          await cfg.api.remove(id);
          snapshot.delete(id);
          persistSnapshot();
        } catch (e) {
          console.warn(`[sync] ${cfg.label}: failed to delete ${id}`, e);
        }
      }
    } finally {
      pushing = false;
      endOp();
      recomputePending();
      if (rerun) {
        rerun = false;
        schedule();
      }
    }
  }

  function schedule() {
    recomputePending(); // reflect the edit immediately, not just once pushed
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void push(), DEBOUNCE_MS);
  }

  // Bypasses the debounce and pushes immediately — a pending debounced edit
  // otherwise silently never reaches the server if the page is hidden,
  // backgrounded, or reloaded before the timer fires (a quick edit-then-
  // reload loses the change entirely, since JS timers don't survive that).
  function flush() {
    window.clearTimeout(timer);
    void push();
  }

  // Pull the server state into the store (e.g. after the chat assistant
  // changed things server-side). Sets the snapshot first so the store update
  // doesn't echo back as a push.
  async function refresh() {
    const server = await cfg.api.list();
    snapshot = toEntries(server);
    persistSnapshot();
    cfg.setItems(server);
    recomputePending();
  }

  // Three-way reconciliation between what's local, what's on the server, and
  // `snapshot` (what was last confirmed synced): anything that differs from
  // snapshot locally was changed since then — offline, most likely — and
  // wins, getting pushed to the server; anything that matches snapshot
  // hasn't been touched on this device, so it just takes whatever the server
  // has (which may itself have moved, e.g. via the chat assistant on another
  // session). This is what lets an edit made while offline survive a reload
  // instead of being silently overwritten by the server's older copy.
  async function hydrate() {
    beginOp();
    try {
      const server = await cfg.api.list();
      const local = cfg.getItems();
      const base = snapshot;
      const serverEntries = toEntries(server);
      const localEntries = toEntries(local);
      const allIds = new Set([...base.keys(), ...localEntries.keys(), ...serverEntries.keys()]);

      const finalItems: T[] = [];
      const nextSnapshot = new Map<string, string>();

      for (const id of allIds) {
        const baseJson = base.get(id);
        const localJson = localEntries.get(id);
        const serverJson = serverEntries.get(id);

        if (localJson === baseJson) {
          // Untouched locally since last sync — take the server's version,
          // or drop it if it's gone there too (deleted elsewhere).
          if (serverJson !== undefined) {
            finalItems.push(JSON.parse(serverJson) as T);
            nextSnapshot.set(id, serverJson);
          }
          continue;
        }

        if (localJson === undefined) {
          // Deleted locally since last sync.
          if (serverJson !== undefined) {
            try {
              await cfg.api.remove(id);
            } catch (e) {
              console.warn(`[sync] ${cfg.label}: failed to delete ${id}`, e);
              // Couldn't confirm the delete — keep the old snapshot entry so
              // the regular push-on-change path (and the next hydrate) still
              // know this id needs deleting, instead of forgetting and
              // resurrecting it from the server next load.
              if (baseJson !== undefined) nextSnapshot.set(id, baseJson);
            }
          }
          continue;
        }

        // Created or edited locally since last sync — local wins.
        const item = JSON.parse(localJson) as T;
        try {
          if (baseJson === undefined) await cfg.api.create(item);
          else await cfg.api.update(item);
          nextSnapshot.set(id, localJson);
        } catch (e) {
          console.warn(`[sync] ${cfg.label}: failed to save ${id}`, e);
          // Couldn't push it — keep the old snapshot entry (if any) so the
          // normal push-on-change path retries it once back online.
          if (baseJson !== undefined) nextSnapshot.set(id, baseJson);
        }
        finalItems.push(item);
      }

      snapshot = nextSnapshot;
      persistSnapshot();
      cfg.setItems(finalItems);
    } finally {
      endOp();
      recomputePending();
    }
  }

  // Starts tracking local edits so they get pushed once possible. Split out
  // from hydrate() (which used to call this at its very end) because it must
  // run even when hydrate() never gets to run at all — offline at launch,
  // say — otherwise an edit made in that session would never be noticed,
  // let alone pushed, even after the connection came back.
  function subscribe() {
    cfg.subscribe(schedule);
  }

  return { hydrate, refresh, flush, subscribe, pendingCount };
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

function recomputePending() {
  let total = 0;
  for (const s of Object.values(syncers)) total += s.pendingCount();
  useSyncStatusStore.setState({ pendingCount: total });
}

function flushAll() {
  for (const s of Object.values(syncers)) s.flush();
}

// Health-checks the backend, then (re)hydrates every syncer if it answers.
// Safe to call more than once — hydrate() just reconciles against whatever
// state exists at the time, so calling it again after being offline is
// exactly what picks up both a cold-start-offline syncer that never got its
// first hydrate (see startSync's subscribe-first ordering) and one that
// hydrated fine but had a push fail partway through the session.
// Re-entrancy guard: startSync() can legitimately run more than once (React
// StrictMode double-invokes effects in dev, and a single 'online' event
// dispatches to every listener registered so far), which would otherwise let
// two hydrate() calls for the same domain race — both deciding, at once,
// that the same pending item needs creating, and both POSTing it.
let hydrating = false;

// Resolves true once the backend was actually reached and every domain
// hydrated, false if it's unreachable (or a hydration was already in
// flight) — reloadAll() uses this to decide whether the pull-to-refresh
// toast should claim things are up to date.
async function attemptHydration(): Promise<boolean> {
  if (hydrating) return false;
  hydrating = true;
  try {
    await api.health();
    await Promise.all(
      Object.values(syncers).map((s) =>
        s.hydrate().catch((e) => console.warn("[sync] hydrate failed", e))
      )
    );
    return true;
  } catch {
    console.warn("[sync] backend unreachable — still running local-only");
    return false;
  } finally {
    hydrating = false;
  }
}

export async function startSync(): Promise<void> {
  // Always start tracking local changes, regardless of whether the server is
  // reachable right now — otherwise launching offline would mean nothing the
  // user does during that session ever gets pushed, even after reconnecting
  // later, because the change-listener that queues pushes was never armed.
  for (const s of Object.values(syncers)) s.subscribe();
  recomputePending();

  // Flush any still-debounced edit the moment the app is backgrounded or
  // the page starts navigating away — visibilitychange fires reliably when
  // the app is put in the background (the common case: edit, then switch
  // apps or lock the phone) and pagehide on an actual reload/close. Neither
  // guarantees the request completes before the page fully terminates, but
  // "attempted immediately" beats "never even tried" for a debounced edit
  // that would otherwise silently vanish.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushAll();
  });
  window.addEventListener("pagehide", flushAll);

  // The moment connectivity actually returns, retry right away instead of
  // waiting for the next unrelated edit (or a full relaunch) to happen to
  // trigger one — this is what makes "kept until back online" actually mean
  // "pushed as soon as", not "pushed eventually, maybe, if you keep using it".
  window.addEventListener("online", () => void attemptHydration());

  // `online`/`offline` are known to be unreliable specifically in mobile
  // WebViews (exactly what this app runs in on both iOS and Android) — this
  // is the safety net under it: while the app is actually visible, keep
  // trying anyway on a plain timer, regardless of what the browser thinks
  // connectivity is doing.
  window.setInterval(() => {
    if (document.visibilityState === "visible") void attemptHydration();
  }, RETRY_INTERVAL_MS);

  // Retry the moment the app is reopened after being backgrounded — the
  // native-app counterpart to visibilitychange, and the more reliable signal
  // on a packaged app: someone closes the app while offline, does something
  // else, and reopens it later back on wifi. CapacitorApp's web
  // implementation falls back to the Page Visibility API, so this works
  // identically in the browser during development.
  void CapacitorApp.addListener("resume", () => void attemptHydration());

  await attemptHydration();
}

// For the chat assistant: after a chat turn whose actions mutated a domain,
// pull the server's version of that domain into its store.
export async function refreshEvents(): Promise<void> {
  await syncers.events.refresh();
}

export async function refreshHabits(): Promise<void> {
  await syncers.habits.refresh();
}

export async function refreshGoals(): Promise<void> {
  await syncers.goals.refresh();
}

// Pull-to-refresh entry point: re-syncs every backend-backed domain right
// now instead of waiting for the periodic retry timer. Same reconciliation
// as attemptHydration() at startup, so a pending offline edit is pushed
// rather than clobbered — never rejects, just resolves true/false for
// whether it actually reached the backend (e.g. false while offline).
export async function reloadAll(): Promise<boolean> {
  return attemptHydration();
}
