import type { Priority } from "./task";

export type GoalPeriod = "week" | "month" | "year";

// A handful of built-in suggestions (see GoalsPage's CATEGORIES), but not a
// closed set — the add-goal sheet lets the user type their own tag too, so
// this stays a plain string rather than a literal union.
export type GoalCategory = string;

export interface GoalMilestone {
  id: string;
  label: string;
  done: boolean;
  // Percent of the goal this milestone is worth. Optional — a milestone
  // without one splits whatever's left of 100 evenly with the other
  // unweighted milestones, same rule linked tasks/goals already use.
  weight?: number;
  // Tasks scheduled to actually do this milestone (see goal_schedule.py) —
  // when present, the milestone's own completion is derived from these
  // (all done = milestone done) instead of the plain `done` flag above.
  linkedTaskIds?: string[];
}

// A goal/plan for a specific week, month or year. Not a task: no time of day.
// Progress comes from exactly one source, chosen implicitly by what's set —
// linked tasks/goals (weighted) > milestones (plain count) > a manual
// numeric target > a bare check-off. The links live here (device-local, like
// the goal itself) rather than on the linked item, so they survive the other
// stores' backend round-trips.
export interface Goal {
  id: string;
  period: GoalPeriod;
  // Which period instance: week → the Monday's ISO date, month → "2026-07",
  // year → "2026".
  periodKey: string;
  title: string;
  // Private "why" — collapsed by default, surfaced by the app instead of a
  // generic reminder when the goal's pace reads behind/at-risk.
  note?: string;
  done: boolean;
  // Manual progress goal: target > 0 with a running progress count.
  target: number | null;
  progress: number;
  priority: Priority | null;
  category: GoalCategory | null;
  // The date this goal actually starts, and how many `period` units it
  // spans from there (e.g. period="month" + durationCount=3 = a 3-month
  // goal). Independent of periodKey, which still files the goal under the
  // period it starts in for tab/browsing purposes.
  startDate: string | null;
  durationCount: number | null;
  // Manual sort position within its period (lower = higher in the list).
  order: number;
  // Ids of tasks whose completion drives this goal's progress.
  linkedTaskIds: string[];
  // Ids of other goals whose completion drives this goal's progress — may
  // only reference goals in a strictly more granular period than this one
  // (year → month/week, month → week, week → none), which makes a link
  // cycle structurally impossible without needing cycle-detection code.
  linkedGoalIds: string[];
  // One weight map for both of the above (percent of this goal) — a task id
  // and a goal id never collide, so they safely share one map. Ids omitted
  // here split the remaining percentage evenly, so linking without
  // weighting still works.
  weights: Record<string, number>;
  // Lightweight, embedded sub-steps for goals too lumpy for task-linking —
  // not separate Goal rows, since a checklist inside one goal doesn't
  // deserve its own period slot the way a real linked goal does.
  milestones: GoalMilestone[];
  createdAt: number;
}
