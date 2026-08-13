import { addDaysISO, parseISODate } from "./date";
import { currentPeriodKey, goalEndDate, periodStartDate } from "./goalPeriods";
import type { Goal, GoalMilestone, GoalPeriod } from "@/types/goals";
import type { Task } from "@/types/task";

// A goal's progress, derived from exactly one source, chosen implicitly by
// what's actually set on it: linked tasks/goals (weighted) > milestones
// (weighted) > a manual numeric target > a bare check-off.
export interface GoalProgress {
  mode: "linked" | "milestones" | "manual" | "check";
  done: boolean;
  fraction: number; // 0..1, for the bar
  percent: number; // round(fraction * 100)
  current: number; // completed count / manual progress
  total: number; // linked item count / milestone count / manual target
  linkedTasks: Task[]; // in schedule order, only tasks that still exist
  linkedGoals: Goal[]; // only goals that still exist
  // Effective weight (percent of the goal) per linked task/goal id —
  // explicit ones as set, the rest sharing the remainder evenly.
  shares: Record<string, number>;
  // Same idea, one level down: effective weight per milestone id, only
  // populated in "milestones" mode.
  milestoneShares: Record<string, number>;
}

// Resolves a set of optional weights (percent of 100, in list order) into
// concrete shares: explicit ones as given, the rest splitting whatever's
// left of 100 evenly. The one rule "some items can be weighted, the rest
// just share what's left" needs wherever partial weighting is allowed —
// goal-level linked items, and milestones.
export function autoSplitWeights(weights: (number | undefined)[]): number[] {
  let pinnedSum = 0;
  let autoCount = 0;
  for (const w of weights) {
    if (typeof w === "number") pinnedSum += w;
    else autoCount++;
  }
  const remaining = Math.max(0, 100 - Math.min(100, pinnedSum));
  const autoWeight = autoCount ? remaining / autoCount : 0;
  return weights.map((w) => (typeof w === "number" ? w : autoWeight));
}

export interface MilestoneWindow {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
}

// A calendar slice per not-yet-scheduled milestone — sized by weight (same
// autoSplitWeights the progress ring uses) and laid out in milestone order
// across the goal's own date range, so milestone one's slice starts on day
// one and later milestones fall later, whether or not earlier ones are
// actually done yet (a milestone's position in the timeline shouldn't jump
// around just because something ahead of it got finished early or late).
// Milestones that are done, or already have their own scheduled tasks, are
// left out — there's nothing left to schedule for them.
export function milestoneSchedulingWindows(goal: Goal): MilestoneWindow[] {
  const ms = goal.milestones;
  if (ms.length === 0) return [];

  const shares = autoSplitWeights(ms.map((m) => m.weight));
  const startIso = goal.startDate ?? periodStartDate(goal.period, goal.periodKey);
  const endIso = goalEndDate(goal.period, goal.periodKey, goal.startDate, goal.durationCount);
  const totalDays = Math.max(
    1,
    Math.round((parseISODate(endIso).getTime() - parseISODate(startIso).getTime()) / 86400000) + 1
  );

  const windows: MilestoneWindow[] = [];
  let cursor = 0;
  ms.forEach((m, i) => {
    const days = Math.max(1, Math.round((shares[i] / 100) * totalDays));
    const winStart = addDaysISO(startIso, cursor);
    const winEnd = addDaysISO(startIso, Math.min(totalDays - 1, cursor + days - 1));
    cursor += days;
    const scheduled = (m.linkedTaskIds?.length ?? 0) > 0;
    if (!m.done && !scheduled) {
      windows.push({ id: m.id, label: m.label, startDate: winStart, endDate: winEnd });
    }
  });
  return windows;
}

// `_depth` guards against a malformed link cycle recursing unbounded — real
// cycles shouldn't exist (linking only ever offers a more-granular-period
// goal, see canLinkGoalPeriod in goalPeriods.ts), but this keeps a read path
// safe regardless.
export function goalProgress(goal: Goal, tasks: Task[], goals: Goal[], _depth = 0): GoalProgress {
  const taskIds = goal.linkedTaskIds ?? [];
  const linkedTasks =
    taskIds.length > 0
      ? tasks
          .filter((t) => taskIds.includes(t.id))
          .sort((a, b) => a.date.localeCompare(b.date) || a.startMinutes - b.startMinutes)
      : [];

  const goalIds = goal.linkedGoalIds ?? [];
  const linkedGoals =
    goalIds.length > 0 && _depth < 4 ? goals.filter((g) => goalIds.includes(g.id)) : [];

  if (linkedTasks.length > 0 || linkedGoals.length > 0) {
    const pinned = goal.weights ?? {};
    const items: { id: string; done: boolean }[] = [
      ...linkedTasks.map((t) => ({ id: t.id, done: t.completed })),
      ...linkedGoals.map((g) => ({
        id: g.id,
        done: goalProgress(g, tasks, goals, _depth + 1).done,
      })),
    ];

    const resolved = autoSplitWeights(items.map((it) => pinned[it.id]));
    const shares: Record<string, number> = {};
    items.forEach((it, i) => {
      shares[it.id] = resolved[i];
    });

    const completed = items.filter((it) => it.done);
    const completedPct = completed.reduce((s, it) => s + shares[it.id], 0);
    // Finishing every linked item always counts as done, even if the
    // assigned weights sum to less than 100.
    const allDone = completed.length === items.length;
    const fraction = allDone ? 1 : Math.min(1, completedPct / 100);
    return {
      mode: "linked",
      done: goal.done || allDone,
      fraction,
      percent: Math.round(fraction * 100),
      current: completed.length,
      total: items.length,
      linkedTasks,
      linkedGoals,
      shares,
      milestoneShares: {},
    };
  }

  if (goal.milestones && goal.milestones.length > 0) {
    const ms = goal.milestones;
    const resolved = autoSplitWeights(ms.map((m) => m.weight));
    const milestoneShares: Record<string, number> = {};
    ms.forEach((m, i) => {
      milestoneShares[m.id] = resolved[i];
    });

    // A milestone with its own scheduled tasks derives completion from
    // them (all done = milestone done); one without falls back to its own
    // plain `done` flag, same as before this existed.
    const milestoneDone = (m: GoalMilestone) =>
      m.linkedTaskIds && m.linkedTaskIds.length > 0
        ? m.linkedTaskIds.every((id) => tasks.find((t) => t.id === id)?.completed ?? false)
        : m.done;

    const done = ms.filter(milestoneDone);
    const completedPct = done.reduce((s, m) => s + milestoneShares[m.id], 0);
    // Finishing every milestone always counts as done, even if the assigned
    // weights sum to less than 100.
    const allDone = done.length === ms.length;
    const fraction = allDone ? 1 : Math.min(1, completedPct / 100);
    return {
      mode: "milestones",
      done: goal.done || allDone,
      fraction,
      percent: Math.round(fraction * 100),
      current: done.length,
      total: ms.length,
      linkedTasks,
      linkedGoals,
      shares: {},
      milestoneShares,
    };
  }

  if (goal.target != null && goal.target > 0) {
    const fraction = Math.min(1, goal.progress / goal.target);
    return {
      mode: "manual",
      done: goal.done || goal.progress >= goal.target,
      fraction,
      percent: Math.round(fraction * 100),
      current: goal.progress,
      total: goal.target,
      linkedTasks,
      linkedGoals,
      shares: {},
      milestoneShares: {},
    };
  }

  return {
    mode: "check",
    done: goal.done,
    fraction: goal.done ? 1 : 0,
    percent: goal.done ? 100 : 0,
    current: 0,
    total: 0,
    linkedTasks,
    linkedGoals,
    shares: {},
    milestoneShares: {},
  };
}

// ── Pace ──────────────────────────────────────────────────────────────────
// "On track" / "behind" / "at risk" — how a goal's progress compares to how
// much of its own period has already elapsed. Only meaningful for the
// period that's actually running right now (a past period is either done or
// isn't, and a future one hasn't started), and only for goals with a real
// fill to compare against a clock — a plain check-off has no partial state
// to be ahead of or behind.

export type GoalPace = "on-track" | "behind" | "at-risk";

export const GOAL_PACE_COLOR: Record<GoalPace, string> = {
  "on-track": "#4ade80",
  behind: "#fbbf24",
  "at-risk": "#f87171",
};

export const GOAL_PACE_LABEL: Record<GoalPace, string> = {
  "on-track": "On track",
  behind: "Behind",
  "at-risk": "At risk",
};

function elapsedFraction(period: GoalPeriod, periodKey: string): number {
  const now = new Date();
  if (period === "week") {
    const monday = parseISODate(periodKey);
    return Math.min(1, Math.max(0, (now.getTime() - monday.getTime()) / (7 * 86400000)));
  }
  if (period === "month") {
    const [y, m] = periodKey.split("-").map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const elapsedDays = now.getDate() - 1 + now.getHours() / 24;
    return Math.min(1, Math.max(0, elapsedDays / daysInMonth));
  }
  const y = Number(periodKey);
  const start = new Date(y, 0, 1).getTime();
  const end = new Date(y + 1, 0, 1).getTime();
  return Math.min(1, Math.max(0, (now.getTime() - start) / (end - start)));
}

export function goalPace(goal: Goal, tasks: Task[], goals: Goal[]): GoalPace | null {
  if (goal.periodKey !== currentPeriodKey(goal.period)) return null;

  const progress = goalProgress(goal, tasks, goals);
  if (progress.mode === "check" || progress.done || progress.fraction >= 1) return null;

  const elapsed = elapsedFraction(goal.period, goal.periodKey);
  if (elapsed <= 0) return null;

  const gap = elapsed - progress.fraction;
  if (gap <= 0.05) return "on-track";
  if (gap <= 0.35) return "behind";
  return "at-risk";
}
