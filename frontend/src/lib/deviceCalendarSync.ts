import { App as CapacitorApp } from "@capacitor/app";

import { api } from "./api";
import {
  createDeviceEvent,
  deleteDeviceEvent,
  deviceCalendarSupported,
  listDeviceCalendars,
  listEventsInRange,
  sourceLabelFor,
  updateDeviceEvent,
} from "./deviceCalendar";
import { useAuthStore } from "@/store/authStore";
import { useCalendarStore } from "@/store/calendarStore";
import { useTaskStore } from "@/store/taskStore";
import type { Task } from "@/types/task";

// Two independent, one-way jobs — deliberately not a single bidirectional
// sync engine, so each has one simple failure mode:
//
//  - pull: device calendars the user picked as "read" -> the backend's
//    read-only mirror (see api.calendarSync), so the AI weekly planner and
//    timeline are aware of them. Never touches the device.
//  - push: disciplined's own Tasks -> the one device calendar the user
//    picked as "write". Never touches a device-native event disciplined
//    didn't create itself.
//
// Both are best-effort: a failure here never blocks the app or its own
// (backend) sync in lib/sync.ts.

// ---- Pull: device calendars -> backend ----

const PULL_WINDOW_PAST_DAYS = 7;
const PULL_WINDOW_FUTURE_DAYS = 60;

let pulling = false;
let pullQueued = false;

export async function pullDeviceCalendars(): Promise<void> {
  if (!deviceCalendarSupported) return;
  const { readCalendarIds } = useCalendarStore.getState();
  if (readCalendarIds.length === 0) return;
  if (pulling) {
    pullQueued = true;
    return;
  }
  pulling = true;
  try {
    const calendars = await listDeviceCalendars();
    const now = Date.now();
    const from = now - PULL_WINDOW_PAST_DAYS * 86_400_000;
    const to = now + PULL_WINDOW_FUTURE_DAYS * 86_400_000;
    const events = await listEventsInRange(from, to);
    const byCalendar = new Map<string, typeof events>();
    for (const e of events) {
      if (!e.calendarId) continue;
      byCalendar.set(e.calendarId, [...(byCalendar.get(e.calendarId) ?? []), e]);
    }

    for (const calendarId of readCalendarIds) {
      const cal = calendars.find((c) => c.id === calendarId);
      if (!cal) continue; // removed/renamed on-device since it was selected
      try {
        await api.calendarSync({
          calendarId,
          calendarName: cal.title,
          sourceLabel: sourceLabelFor(cal),
          rangeStart: new Date(from).toISOString(),
          rangeEnd: new Date(to).toISOString(),
          events: (byCalendar.get(calendarId) ?? []).map((e) => ({
            externalEventId: e.id,
            title: e.title,
            location: e.location ?? undefined,
            startAt: e.startAt,
            endAt: e.endAt,
            allDay: e.allDay,
          })),
        });
      } catch (e) {
        console.warn("[calendar] sync failed for", calendarId, e);
      }
    }
  } finally {
    pulling = false;
    if (pullQueued) {
      pullQueued = false;
      void pullDeviceCalendars();
    }
  }
}

// ---- Push: disciplined Tasks -> the chosen write-calendar ----
// The mapping from task id to native event id (and a signature so an
// unrelated store change doesn't re-push every task) lives in localStorage
// only, the same tradeoff lib/sync.ts's own snapshot makes — a reinstall or
// second device can re-create rather than dedupe. Acceptable for v1.

interface PushEntry {
  nativeId: string;
  signature: string;
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

function taskSignature(t: Task): string {
  return `${t.title}|${t.date}|${t.startMinutes}|${t.durationMinutes}`;
}

function taskStart(t: Task): Date {
  const d = new Date(`${t.date}T00:00:00`);
  d.setMinutes(d.getMinutes() + t.startMinutes);
  return d;
}

let pushing = false;
let pushQueued = false;

async function pushTasksToDevice(): Promise<void> {
  if (!deviceCalendarSupported) return;
  const { writeCalendarId } = useCalendarStore.getState();
  if (pushing) {
    pushQueued = true;
    return;
  }
  pushing = true;
  try {
    const tasks = useTaskStore.getState().tasks;
    const taskIds = new Set(tasks.map((t) => t.id));

    // Deleted locally since the last push, or no write-calendar configured
    // anymore -> remove the mirrored event from the device.
    for (const [taskId, entry] of [...pushMap.entries()]) {
      if (!writeCalendarId || !taskIds.has(taskId)) {
        await deleteDeviceEvent(entry.nativeId);
        pushMap.delete(taskId);
      }
    }

    if (writeCalendarId) {
      for (const task of tasks) {
        const signature = taskSignature(task);
        const existing = pushMap.get(task.id);
        if (existing?.signature === signature) continue; // unchanged since last push
        const start = taskStart(task);
        const end = new Date(start.getTime() + task.durationMinutes * 60_000);
        if (existing) {
          const ok = await updateDeviceEvent(existing.nativeId, task.title, start, end);
          if (ok) pushMap.set(task.id, { nativeId: existing.nativeId, signature });
        } else {
          const nativeId = await createDeviceEvent(writeCalendarId, task.title, start, end);
          if (nativeId) pushMap.set(task.id, { nativeId, signature });
        }
      }
    }
    savePushMap(pushMap);
  } finally {
    pushing = false;
    if (pushQueued) {
      pushQueued = false;
      void pushTasksToDevice();
    }
  }
}

let pushTimer: ReturnType<typeof setTimeout> | undefined;
function schedulePush() {
  window.clearTimeout(pushTimer);
  pushTimer = window.setTimeout(() => void pushTasksToDevice(), 600);
}

// ---- Wiring ----

let initialized = false;

export function initDeviceCalendarSync(): void {
  if (initialized || !deviceCalendarSupported) return;
  initialized = true;

  // Re-read the push map now that a user id is known (it's namespaced per
  // account, same reasoning as lib/sync.ts's snapshot).
  pushMap = loadPushMap();

  void pullDeviceCalendars();
  void pushTasksToDevice();

  useTaskStore.subscribe((state, prev) => {
    if (state.tasks !== prev.tasks) schedulePush();
  });
  useCalendarStore.subscribe((state, prev) => {
    if (state.readCalendarIds !== prev.readCalendarIds) void pullDeviceCalendars();
    if (state.writeCalendarId !== prev.writeCalendarId) {
      // Switching write-calendars: don't try to move already-mirrored events
      // to the new one, just start fresh there (see module doc above).
      pushMap = new Map();
      savePushMap(pushMap);
      schedulePush();
    }
  });

  void CapacitorApp.addListener("resume", () => {
    void pullDeviceCalendars();
    schedulePush();
  });
}
