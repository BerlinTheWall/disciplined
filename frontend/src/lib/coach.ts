import { LocalNotifications } from "@capacitor/local-notifications";

import { api, type CoachWindow } from "./api";
import { todayISODate } from "./date";
import { isNativeReminderPlatform, notifId } from "./nativeReminders";
import { useChatStore } from "@/store/chatStore";
import { useNotificationHistoryStore } from "@/store/notificationHistoryStore";

// Proactive coach check-ins: LLM-composed messages (see
// backend/app/services/coach.py) scheduled ahead of time as local
// notifications, so they reach the user even with the app fully closed —
// the same delivery mechanism nativeReminders.ts already uses for task/habit
// reminders. Structurally parallel to that module (declarative full-replace
// resync), but on its own id namespace (negative ids, vs. reminders'
// positive ones — see notifId) so neither module's resync ever cancels the
// other's pending notifications.

// The client always proposes this same fixed set of windows regardless of
// the user's coach_tier — the server decides how many actually get filled
// (see backend/app/services/coach.py's TIER_BUDGET) so the client never
// needs to know about tiering at all.
export const COACH_WINDOWS: CoachWindow[] = [
  { label: "Midday", startMinutes: 11 * 60, endMinutes: 14 * 60 },
  { label: "Evening", startMinutes: 17 * 60, endMinutes: 20 * 60 },
  { label: "Late check", startMinutes: 20 * 60 + 30, endMinutes: 22 * 60 + 30 },
];

interface CoachNotificationData {
  kind: "coach";
  subjectKey: string;
  actionPhrase: string | null;
}

let initialized = false;

// Tapping a coach notification opens the chat sheet and, if the checkpoint
// carried a concrete action, sends it as if the user asked for it — same
// pattern as NotificationBell's nudge-tap handler. A separate listener (vs.
// extending nativeReminders.ts's) because coach payloads deliberately don't
// carry a `key` field, so that module's own listener already ignores them.
export function initCoachNotifications() {
  if (initialized || !isNativeReminderPlatform) return;
  initialized = true;
  void LocalNotifications.addListener("localNotificationActionPerformed", (event) => {
    const data = event.notification.extra as CoachNotificationData | undefined;
    if (data?.kind !== "coach") return;
    useChatStore.getState().openChat();
    if (data.actionPhrase) {
      void useChatStore
        .getState()
        .send(data.actionPhrase)
        .catch(() => {});
    }
  });
}

interface ScheduledCheckpoint {
  id: number;
  title: string;
  body: string;
  fireAt: number; // epoch ms
  data: CoachNotificationData;
}

async function scheduleCoachBatch(batch: ScheduledCheckpoint[]) {
  const pending = await LocalNotifications.getPending();
  // Only ever touch coach-owned (negative-id) notifications — reminders
  // (positive ids) are a separate resync cycle, see notifId in nativeReminders.ts.
  const ours = pending.notifications.filter((n) => n.id < 0);
  if (ours.length > 0) {
    await LocalNotifications.cancel({ notifications: ours.map((n) => ({ id: n.id })) });
  }
  if (batch.length === 0) return;
  await LocalNotifications.schedule({
    notifications: batch.map((c) => ({
      id: c.id,
      title: c.title,
      body: c.body,
      schedule: { at: new Date(c.fireAt) },
      extra: c.data,
    })),
  });
}

// Debounced + serialized exactly like nativeReminders.ts's doSync: store
// subscriptions fire in bursts, and a plan already in flight shouldn't be
// overlapped by another — queue one more pass instead.
let planTimer: ReturnType<typeof setTimeout> | undefined;
let planning = false;
let planQueued = false;

export function scheduleCoachPlan() {
  if (!isNativeReminderPlatform) return;
  clearTimeout(planTimer);
  planTimer = setTimeout(() => void planAndScheduleCoachCheckins(), 1500);
}

async function planAndScheduleCoachCheckins() {
  if (planning) {
    planQueued = true;
    return;
  }
  planning = true;
  try {
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const windows = COACH_WINDOWS.filter((w) => w.endMinutes > nowMinutes);
    if (windows.length === 0) {
      await scheduleCoachBatch([]);
      return;
    }

    const res = await api.coach.plan(nowMinutes, windows);
    const clientDate = todayISODate();
    const batch: ScheduledCheckpoint[] = res.checkpoints.map((c) => {
      const fireAt = new Date(now);
      fireAt.setHours(0, c.fireAtMinutes, 0, 0);
      return {
        id: -notifId(c.subjectKey),
        title: c.title,
        body: c.body,
        fireAt: fireAt.getTime(),
        data: { kind: "coach", subjectKey: c.subjectKey, actionPhrase: c.actionPhrase },
      };
    });
    await scheduleCoachBatch(batch);

    for (const c of res.checkpoints) {
      useNotificationHistoryStore.getState().addEntry({
        id: `coach:${c.subjectKey}:${clientDate}`,
        kind: "coach",
        title: c.title,
        body: c.body,
        firedAt: Date.now(),
        actionPhrase: c.actionPhrase,
      });
    }
  } catch (e) {
    console.warn("[coach] plan failed", e);
  } finally {
    planning = false;
    if (planQueued) {
      planQueued = false;
      void planAndScheduleCoachCheckins();
    }
  }
}
