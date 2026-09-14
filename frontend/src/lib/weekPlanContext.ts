import { addDaysISO, DAY_NAMES, parseISODate, todayISODate } from "@/lib/date";
import { goalEndDate } from "@/lib/goalPeriods";
import { goalProgress } from "@/lib/goalProgress";
import { formatTimeLabel } from "@/lib/time";
import type { Goal } from "@/types/goals";
import type { Task } from "@/types/task";

// What the week planner needs to know about a goal, assembled client-side.
// Goals are device-local, so the backend cannot look any of this up — before
// this, a goal reached the model as nothing but a title, and the best it
// could do was a week of blocks all named after the goal.

export const WEEK_PLAN_WINDOW_DAYS = 7;
// Mirrors the caps on WeekPlanPreference (backend/app/schemas.py) so an
// unusually large goal is trimmed here rather than rejected as a 422.
const MAX_OPEN_MILESTONES = 20;
const MAX_SCHEDULED_LINES = 40;

export interface GoalPlanMilestone {
  id: string;
  label: string;
}

export interface GoalPlanContext {
  deadline: string | null;
  progressLabel: string | null;
  openMilestones: GoalPlanMilestone[];
  scheduledThisWeek: string[];
}

// Where a session created for this goal may safely be attached. A goal's
// progress mode is implicit in what's set on it (linked tasks > milestones >
// manual target > check-off, see goalProgress), so attaching a task at goal
// level to a goal tracked some other way would silently switch how it is
// tracked and discard the progress it already shows — a 4/6-milestone goal
// would become a 0/1-linked-task goal. Only two cases are safe: a milestone
// link (a milestone-tracked goal stays milestone-tracked) and a goal that is
// already task-linked or has nothing else tracking it at all.
export type GoalLinkTarget = "milestone" | "goal" | "none";

export function goalLinkTarget(goal: Goal): GoalLinkTarget {
  if (goal.milestones.length > 0) return "milestone";
  if (goal.linkedTaskIds.length > 0) return "goal";
  // Tracked by a manual count, or by sub-goals — linking would take over.
  if (goal.target != null && goal.target > 0) return "none";
  if (goal.linkedGoalIds.length > 0) return "none";
  return "goal"; // bare check-off: nothing to disturb
}

function progressLabel(goal: Goal, tasks: Task[], goals: Goal[]): string | null {
  const { mode, current, total } = goalProgress(goal, tasks, goals);
  switch (mode) {
    case "linked":
      return `${current} of ${total} linked tasks done`;
    case "milestones":
      return `${current} of ${total} milestones done`;
    case "manual":
      return `${current} of ${total}`;
    case "check":
      // A plain check-off has no partial state worth reporting.
      return null;
  }
}

// The milestones still worth scheduling: not ticked off, and nothing booked
// for them yet. The second half is the deference rule — a milestone the goal
// scheduler already laid out sessions for is left alone rather than piled on.
// Same filter milestoneSchedulingWindows applies for the same reason.
export function openMilestones(goal: Goal): GoalPlanMilestone[] {
  return goal.milestones
    .filter((m) => !m.done && !(m.linkedTaskIds?.length ?? 0))
    .slice(0, MAX_OPEN_MILESTONES)
    .map((m) => ({ id: m.id, label: m.label }));
}

// Sessions already on the calendar for this goal inside the planning window —
// its own linked tasks plus every milestone's — as lines the model can read.
// These count toward the requested times-per-week, so a goal that is already
// half-booked gets topped up instead of double-booked.
export function scheduledThisWeek(goal: Goal, tasks: Task[], today = todayISODate()): string[] {
  const ids = new Set([
    ...goal.linkedTaskIds,
    ...goal.milestones.flatMap((m) => m.linkedTaskIds ?? []),
  ]);
  if (ids.size === 0) return [];
  const lastDay = addDaysISO(today, WEEK_PLAN_WINDOW_DAYS - 1);
  return tasks
    .filter((t) => ids.has(t.id) && t.date >= today && t.date <= lastDay)
    .sort((a, b) => a.date.localeCompare(b.date) || a.startMinutes - b.startMinutes)
    .slice(0, MAX_SCHEDULED_LINES)
    .map(
      (t) =>
        `${DAY_NAMES[parseISODate(t.date).getDay()]} ${t.date} ${formatTimeLabel(t.startMinutes)} — ${t.title}`
    );
}

export function goalPlanContext(
  goal: Goal,
  tasks: Task[],
  goals: Goal[],
  today = todayISODate()
): GoalPlanContext {
  return {
    deadline: goalEndDate(goal.period, goal.periodKey, goal.startDate, goal.durationCount),
    progressLabel: progressLabel(goal, tasks, goals),
    openMilestones: openMilestones(goal),
    scheduledThisWeek: scheduledThisWeek(goal, tasks, today),
  };
}
