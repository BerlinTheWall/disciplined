import { api, type PendingAction } from "./api";
import { formatFullDate, parseISODate, relativeDayLabel } from "./date";
import { formatTimeLabel, formatTimeRange } from "./time";
import { refreshForActions } from "@/store/chatStore";
import { useScheduleFocusStore } from "@/store/scheduleFocusStore";
import { useTaskStore } from "@/store/taskStore";
import { useToastStore } from "@/store/toastStore";
import type { Goal } from "@/types/goals";
import type { Habit } from "@/types/habits";
import type { Task } from "@/types/task";

// Turns a pending tool call's *actual args* into a plain-language summary —
// deliberately independent of whatever the model said in its chat bubble.
// The model's prose can drift from what it will really execute (wrong
// carried-over field, a silently auto-picked time, or worse, prose claiming
// something happened before confirmation); this reads only the args that
// /api/chat/confirm will actually send, so what's shown here is guaranteed to
// match what runs.

interface Lookups {
  tasks: Task[];
  habits: Habit[];
  goals: Goal[];
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function num(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}

function bool(v: unknown): boolean | undefined {
  return typeof v === "boolean" ? v : undefined;
}

function taskTitle(id: string | undefined, tasks: Task[]) {
  return tasks.find((t) => t.id === id)?.title ?? "(unknown event)";
}

function habitTitle(id: string | undefined, habits: Habit[]) {
  return habits.find((h) => h.id === id)?.title ?? "(unknown habit)";
}

function goalTitle(id: string | undefined, goals: Goal[]) {
  return goals.find((g) => g.id === id)?.title ?? "(unknown goal)";
}

function dateAndMaybeTime(date: string | undefined, startMinutes: number | undefined) {
  if (!date) return startMinutes != null ? formatTimeLabel(startMinutes) : "";
  const day = relativeDayLabel(date);
  return startMinutes != null ? `${day} at ${formatTimeLabel(startMinutes)}` : day;
}

export function describePendingAction(
  action: PendingAction,
  { tasks, habits, goals }: Lookups
): string {
  const a = action.args;

  switch (action.tool) {
    case "create_event": {
      const title = str(a.title) ?? "(untitled)";
      const date = str(a.date);
      const start = num(a.start_minutes);
      const when = date
        ? start != null
          ? `${relativeDayLabel(date)}, ${formatTimeRange(start, num(a.duration_minutes) ?? 60)}`
          : `${relativeDayLabel(date)}, auto-picked free time`
        : "date not set";
      return `Create event "${title}" — ${when}`;
    }
    case "move_event": {
      const title = taskTitle(str(a.event_id), tasks);
      const when = dateAndMaybeTime(str(a.new_date), num(a.new_start_minutes));
      return `Move "${title}"${when ? ` — to ${when}` : ""}`;
    }
    case "delete_event": {
      const title = taskTitle(str(a.event_id), tasks);
      return `Delete "${title}"`;
    }
    case "swap_events": {
      const titleA = taskTitle(str(a.event_id_a), tasks);
      const titleB = taskTitle(str(a.event_id_b), tasks);
      return `Swap times of "${titleA}" and "${titleB}"`;
    }
    case "set_event_completion": {
      const title = taskTitle(str(a.event_id), tasks);
      return `Mark "${title}" as ${bool(a.done) ? "done" : "not done"}`;
    }
    case "create_habit": {
      const title = str(a.title) ?? "(untitled)";
      const start = num(a.start_minutes);
      const when = start != null ? formatTimeLabel(start) : "9:00 AM (default)";
      return `Create habit "${title}" — ${when}`;
    }
    case "update_habit": {
      const title = habitTitle(str(a.habit_id), habits);
      const changes: string[] = [];
      if (a.title != null) changes.push(`title → "${str(a.title)}"`);
      if (a.start_minutes != null) changes.push(`time → ${formatTimeLabel(num(a.start_minutes)!)}`);
      if (a.duration_minutes != null) changes.push(`duration → ${num(a.duration_minutes)} min`);
      if (a.freq != null || a.interval != null) changes.push("repeat frequency");
      if (a.days_of_week != null) changes.push("days");
      if (a.icon != null) changes.push("icon");
      return `Update "${title}"${changes.length ? ` — ${changes.join(", ")}` : ""}`;
    }
    case "delete_habit": {
      const title = habitTitle(str(a.habit_id), habits);
      return `Delete habit "${title}" (and its completion history)`;
    }
    case "set_habit_completion": {
      const title = habitTitle(str(a.habit_id), habits);
      const date = str(a.date);
      return `Mark "${title}" as ${bool(a.done) ? "done" : "not done"}${date ? ` on ${formatFullDate(date)}` : ""}`;
    }
    case "add_goal_progress": {
      const title = goalTitle(str(a.goal_id), goals);
      const delta = num(a.delta) ?? 0;
      return delta >= 0
        ? `Add ${delta} to "${title}"`
        : `Subtract ${Math.abs(delta)} from "${title}"`;
    }
    case "set_goal_done": {
      const title = goalTitle(str(a.goal_id), goals);
      return `Mark goal "${title}" as ${bool(a.done) ? "done" : "not done"}`;
    }
    default:
      return `${action.tool}(${JSON.stringify(action.args)})`;
  }
}

// The concrete date/time a create_event pendingAction proposes, or null for
// any other tool (or a malformed one) — used to tell whether a nudge's
// offered slot has already passed.
export function pendingActionDateTime(action: PendingAction | null | undefined): Date | null {
  if (!action || action.tool !== "create_event") return null;
  const { date, start_minutes: startMinutes } = action.args as {
    date?: unknown;
    start_minutes?: unknown;
  };
  if (typeof date !== "string" || typeof startMinutes !== "number") return null;
  const d = parseISODate(date);
  d.setMinutes(d.getMinutes() + startMinutes);
  return d;
}

// True once the proposed slot is in the past — a nudge offering it can no
// longer honestly book it there, so it's no longer actionable.
export function isPendingActionStale(action: PendingAction | null | undefined): boolean {
  const dt = pendingActionDateTime(action);
  return dt != null && dt.getTime() < Date.now();
}

interface CreatedEvent {
  id: number | string;
  title: string;
  date: string;
  start_minutes: number;
}

// Executes a nudge's one-tap create_event action (bypassing chat/Gemini
// entirely — confirmChatActions runs the tool directly server-side), then
// makes the result obvious instead of the previous silent success/failure:
// a toast naming what got added and when, and — only on a genuine success —
// jumps straight to that day with the new task highlighted (scheduleFocusStore,
// the same mechanism GoalsPage's own "open this task" already uses). Resolves
// true only on success, so callers know whether it's safe to record the nudge
// as "agreed" — never on a failed/rejected attempt, so the user can retry.
export async function runPendingAction(
  action: PendingAction,
  navigate: (date: string) => void
): Promise<boolean> {
  const res = await api.confirmChatActions([action]).catch(() => null);
  const first = res?.results?.[0] as
    { created?: CreatedEvent; error?: string; message?: string } | undefined;
  if (!res?.ok || !first?.created) {
    useToastStore.getState().show(first?.message ?? "Couldn't add that — try again", "error");
    return false;
  }
  // Awaited (not fire-and-forget) so the task actually exists in the store
  // by the time we navigate + focus it below.
  await refreshForActions([action]);
  const { created } = first;
  useToastStore
    .getState()
    .show(
      `Added "${created.title}" — ${relativeDayLabel(created.date)} at ${formatTimeLabel(created.start_minutes)}`
    );
  useTaskStore.getState().setSelectedDate(created.date);
  useScheduleFocusStore.getState().focusItem(String(created.id));
  navigate(created.date);
  return true;
}
