import { App as CapacitorApp } from "@capacitor/app";

import { api } from "./api";
import {
  appleCalendarSupported,
  createDeviceEvent,
  deleteDeviceEvent,
  deviceCalendarSupported,
  listDeviceCalendars,
  listEventsInRange,
  updateDeviceEvent,
  type DeviceCalendarEvent,
} from "./deviceCalendar";
import { useAuthStore } from "@/store/authStore";
import { useCalendarStore } from "@/store/calendarStore";
import { useGoogleCalendarStore } from "@/store/googleCalendarStore";
import { useOutlookStore } from "@/store/outlookStore";
import { useTaskStore } from "@/store/taskStore";
import type { Task } from "@/types/task";

// Two-way sync, per connected provider, reconciled at the same trigger
// points as before (app open, resume, after a local task change) — no
// webhooks/background polling. Apple runs entirely client-side (see
// reconcileAppleCalendar below): only the device has EventKit access, and
// there's no server-side Apple connection at all. Outlook/Google run
// entirely server-side (see api.outlook.reconcile/api.googleCalendar.reconcile
// -> backend/app/services/outlook_graph.py/google_calendar.py) — this module
// just triggers them and doesn't see their internals.
//
// Whichever side changed more recently wins a genuine conflict — see
// mostRecentWins below, mirroring the backend's calendar_time.most_recent_wins.

const SYNC_WINDOW_PAST_DAYS = 7;
const SYNC_WINDOW_FUTURE_DAYS = 60;

function mostRecentWins(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a) return false;
  if (!b) return true;
  return a > b;
}

// ---- Apple: local <-> device calendar, entirely client-side ----
// The mapping from task id to native event id (plus enough state to detect
// which side changed) lives in localStorage only, the same tradeoff
// lib/sync.ts's own snapshot makes — a reinstall or second device can
// re-create rather than dedupe. Acceptable for v1.

interface PushEntry {
  nativeId: string;
  signature: string;
  // The native event's own lastModifiedDate as of the last successful sync
  // of this entry — compared against its *current* value to detect a
  // device-side edit, and against the Task's updatedAt to resolve a
  // genuine conflict (both sides changed since last sync).
  lastKnownNativeModified: string | null;
}

function pushMapKey(): string {
  return `disciplined-calendar-push-map:${useAuthStore.getState().user?.id ?? "anon"}`;
}

function loadPushMap(): Map<string, PushEntry> {
  try {
    const raw = localStorage.getItem(pushMapKey());
    return raw ? new Map(Object.entries(JSON.parse(raw) as Record<string, PushEntry>)) : new Map();
  } catch {
    return new Map();
  }
}

function savePushMap(map: Map<string, PushEntry>) {
  localStorage.setItem(pushMapKey(), JSON.stringify(Object.fromEntries(map)));
}

let pushMap = loadPushMap();

function appleLastSyncedKey(): string {
  return `disciplined-calendar-apple-last-synced:${useAuthStore.getState().user?.id ?? "anon"}`;
}

function loadAppleLastSynced(): string | null {
  return localStorage.getItem(appleLastSyncedKey());
}

function saveAppleLastSynced(iso: string) {
  localStorage.setItem(appleLastSyncedKey(), iso);
}

function taskSignature(
  t: Pick<Task, "title" | "date" | "startMinutes" | "durationMinutes">
): string {
  return `${t.title}|${t.date}|${t.startMinutes}|${t.durationMinutes}`;
}

function taskStart(t: Pick<Task, "date" | "startMinutes">): Date {
  const d = new Date(`${t.date}T00:00:00`);
  d.setMinutes(d.getMinutes() + t.startMinutes);
  return d;
}

// A device event's UTC start/end -> the (date, startMinutes, durationMinutes)
// shape Task stores, in the device's own local timezone (plain Date methods
// already reflect it — no tz library needed client-side, unlike the backend
// which has to convert for a stored user preference instead). Mirrors the
// backend's calendar_time.utc_to_local_fields, including the same
// past-midnight clamp for a genuinely multi-day event.
function localFieldsFromDeviceEvent(
  e: DeviceCalendarEvent
): Pick<Task, "date" | "startMinutes" | "durationMinutes"> {
  if (e.allDay) {
    return { date: e.startAt.slice(0, 10), startMinutes: 0, durationMinutes: 24 * 60 };
  }
  const start = new Date(e.startAt);
  const end = new Date(e.endAt);
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
  const startMinutes = start.getHours() * 60 + start.getMinutes();
  const durationMinutes = Math.min(
    Math.max(1, Math.round((end.getTime() - start.getTime()) / 60_000)),
    24 * 60 - startMinutes
  );
  return { date, startMinutes, durationMinutes };
}

function deviceEventSignature(e: DeviceCalendarEvent): string {
  return taskSignature({ title: e.title, ...localFieldsFromDeviceEvent(e) });
}

let appleReconciling = false;
let appleReconcileQueued = false;

export async function reconcileAppleCalendar(): Promise<void> {
  if (!deviceCalendarSupported || !appleCalendarSupported) return;
  const { appleCalendarId, writeTarget } = useCalendarStore.getState();
  if (!appleCalendarId) return;
  if (appleReconciling) {
    appleReconcileQueued = true;
    return;
  }
  appleReconciling = true;
  try {
    const calendars = await listDeviceCalendars();
    const cal = calendars.find((c) => c.id === appleCalendarId);
    if (!cal) return; // removed/renamed on-device since it was connected

    const now = Date.now();
    const from = now - SYNC_WINDOW_PAST_DAYS * 86_400_000;
    const to = now + SYNC_WINDOW_FUTURE_DAYS * 86_400_000;
    const windowStartDate = new Date(from).toISOString().slice(0, 10);
    const windowEndDate = new Date(to).toISOString().slice(0, 10);
    const events = await listEventsInRange(from, to);
    const calendarEvents = events.filter((e) => e.calendarId === appleCalendarId);
    const eventsById = new Map(calendarEvents.map((e) => [e.id, e]));
    const lastSyncedAt = loadAppleLastSynced();

    // 1. Walk existing links: detect device-side deletes/edits, push local
    //    edits, resolve genuine conflicts by whichever side changed more
    //    recently.
    for (const [taskId, entry] of [...pushMap.entries()]) {
      const task = useTaskStore.getState().tasks.find((t) => t.id === taskId);
      const nativeEvent = eventsById.get(entry.nativeId);

      if (!task) {
        // Deleted locally since the last pass -> remove the mirrored device event.
        if (nativeEvent) await deleteDeviceEvent(entry.nativeId);
        pushMap.delete(taskId);
        continue;
      }

      if (!nativeEvent) {
        // Missing on-device — only within this pass's window is that
        // evidence of a real deletion, not just outside this pass's reach.
        if (task.date < windowStartDate || task.date > windowEndDate) continue;
        if (mostRecentWins(task.updatedAt, lastSyncedAt)) {
          // Edited locally since we last looked — recreate rather than
          // silently discard the user's edit.
          const start = taskStart(task);
          const end = new Date(start.getTime() + task.durationMinutes * 60_000);
          const nativeId = await createDeviceEvent(appleCalendarId, task.title, start, end);
          if (nativeId) {
            pushMap.set(taskId, {
              nativeId,
              signature: taskSignature(task),
              lastKnownNativeModified: new Date().toISOString(),
            });
          } else {
            pushMap.delete(taskId);
          }
        } else {
          useTaskStore.getState().deleteTask(taskId);
          pushMap.delete(taskId);
        }
        continue;
      }

      const localSig = taskSignature(task);
      const remoteSig = deviceEventSignature(nativeEvent);
      const localChanged = localSig !== entry.signature;
      const remoteChanged = remoteSig !== entry.signature;
      if (!localChanged && !remoteChanged) continue;

      const pushWins =
        (localChanged && !remoteChanged) ||
        (localChanged &&
          remoteChanged &&
          mostRecentWins(task.updatedAt, nativeEvent.lastModifiedDate));

      if (pushWins) {
        const start = taskStart(task);
        const end = new Date(start.getTime() + task.durationMinutes * 60_000);
        const ok = await updateDeviceEvent(entry.nativeId, task.title, start, end);
        if (ok) {
          pushMap.set(taskId, {
            nativeId: entry.nativeId,
            signature: localSig,
            lastKnownNativeModified: nativeEvent.lastModifiedDate,
          });
        }
      } else {
        useTaskStore.getState().updateTask(taskId, {
          title: nativeEvent.title,
          ...localFieldsFromDeviceEvent(nativeEvent),
          updatedAt: nativeEvent.lastModifiedDate ?? new Date().toISOString(),
        });
        pushMap.set(taskId, {
          nativeId: entry.nativeId,
          signature: remoteSig,
          lastKnownNativeModified: nativeEvent.lastModifiedDate,
        });
      }
    }

    // 2. Device events with no existing link -> new local Tasks.
    const linkedNativeIds = new Set([...pushMap.values()].map((e) => e.nativeId));
    for (const nativeEvent of calendarEvents) {
      if (linkedNativeIds.has(nativeEvent.id)) continue;
      const newId = useTaskStore.getState().addTask({
        title: nativeEvent.title,
        color: "#6366f1",
        icon: "default",
        ...localFieldsFromDeviceEvent(nativeEvent),
        appleLinked: true,
        updatedAt: nativeEvent.lastModifiedDate ?? new Date().toISOString(),
      });
      pushMap.set(newId, {
        nativeId: nativeEvent.id,
        signature: deviceEventSignature(nativeEvent),
        lastKnownNativeModified: nativeEvent.lastModifiedDate,
      });
    }
    savePushMap(pushMap);

    // 3. Write-target only: push brand-new, fully-unlinked local Tasks —
    //    excluding anything already linked to Outlook/Google, so a task
    //    never ends up mirrored to more than one provider.
    if (writeTarget?.kind === "apple") {
      const linkedTaskIds = new Set(pushMap.keys());
      const unlinked = useTaskStore
        .getState()
        .tasks.filter(
          (t) => !linkedTaskIds.has(t.id) && !t.outlookEventId && !t.googleEventId && !t.appleLinked
        );
      for (const task of unlinked) {
        const start = taskStart(task);
        const end = new Date(start.getTime() + task.durationMinutes * 60_000);
        const nativeId = await createDeviceEvent(appleCalendarId, task.title, start, end);
        if (nativeId) {
          pushMap.set(task.id, {
            nativeId,
            signature: taskSignature(task),
            lastKnownNativeModified: new Date().toISOString(),
          });
          useTaskStore.getState().updateTask(task.id, { appleLinked: true });
        }
      }
      savePushMap(pushMap);
    }

    saveAppleLastSynced(new Date().toISOString());
  } finally {
    appleReconciling = false;
    if (appleReconcileQueued) {
      appleReconcileQueued = false;
      void reconcileAppleCalendar();
    }
  }
}

// Called when Apple Calendar is disconnected (CalendarSheet.tsx) — unlike a
// write-target switch (which keeps every link alive, see the module-level
// subscribe below), disconnecting genuinely ends the relationship: forget
// every native id, and clear appleLinked on the now-unlinked Tasks so a
// later Outlook/Google write-target push doesn't skip them by mistake.
export async function clearAppleLinks(): Promise<void> {
  for (const taskId of pushMap.keys()) {
    useTaskStore.getState().updateTask(taskId, { appleLinked: false });
  }
  pushMap = new Map();
  savePushMap(pushMap);
  localStorage.removeItem(appleLastSyncedKey());
}

// ---- Orchestration: reconcile every connected provider ----

let reconcilingAll = false;
let reconcileAllQueued = false;

async function reconcileConnectedCalendars(): Promise<void> {
  // No top-level native gate: Outlook/Google reconcile entirely server-side
  // and work fine from a plain web tab — only the Apple branch below needs
  // native EventKit access.
  if (reconcilingAll) {
    reconcileAllQueued = true;
    return;
  }
  reconcilingAll = true;
  try {
    if (appleCalendarSupported && useCalendarStore.getState().appleCalendarId) {
      await reconcileAppleCalendar();
    }
    const { writeTarget } = useCalendarStore.getState();
    if (useOutlookStore.getState().connected) {
      try {
        await api.outlook.reconcile(writeTarget?.kind === "outlook");
      } catch (e) {
        console.warn("[calendar] outlook reconcile failed", e);
      }
    }
    if (useGoogleCalendarStore.getState().connected) {
      try {
        await api.googleCalendar.reconcile(writeTarget?.kind === "google");
      } catch (e) {
        console.warn("[calendar] google calendar reconcile failed", e);
      }
    }
  } finally {
    reconcilingAll = false;
    if (reconcileAllQueued) {
      reconcileAllQueued = false;
      void reconcileConnectedCalendars();
    }
  }
}

let reconcileTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleReconcile() {
  window.clearTimeout(reconcileTimer);
  reconcileTimer = window.setTimeout(() => void reconcileConnectedCalendars(), 600);
}

// ---- Wiring ----

let initialized = false;

// Despite the name, this wires up every connected provider, not just
// Apple — Outlook/Google reconcile entirely server-side and work fine from
// a plain web tab too, so this no longer gates on native. Only the Apple
// branch inside reconcileConnectedCalendars/reconcileAppleCalendar itself
// requires deviceCalendarSupported.
export function initDeviceCalendarSync(): void {
  if (initialized) return;
  initialized = true;

  // Re-read the push map now that a user id is known (it's namespaced per
  // account, same reasoning as lib/sync.ts's snapshot).
  pushMap = loadPushMap();

  void reconcileConnectedCalendars();

  useTaskStore.subscribe((state, prev) => {
    if (state.tasks !== prev.tasks) scheduleReconcile();
  });
  useCalendarStore.subscribe((state, prev) => {
    if (state.appleCalendarId !== prev.appleCalendarId) void reconcileAppleCalendar();
    // Switching the write target doesn't touch any already-linked task's
    // provider — only which provider brand-new, unlinked Tasks go to next.
    // Existing links (Apple's pushMap, Outlook/Google's Event columns) stay
    // exactly as they are; just trigger a pass so newly-unlinked Tasks get
    // pushed to whatever the write target now is.
    if (state.writeTarget !== prev.writeTarget) scheduleReconcile();
  });

  if (deviceCalendarSupported) {
    void CapacitorApp.addListener("resume", () => {
      void reconcileConnectedCalendars();
    });
  }
}
