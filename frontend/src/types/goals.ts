import type { Priority } from "./task";

export type GoalPeriod = "week" | "month" | "year";

// A goal/plan for a specific week, month or year. Not a task: no time of day.
// Progress comes from one of three sources — a plain check-off, a manual
// numeric target, or the completion of linked tasks (taskIds). The links live
// here (device-local) rather than on the task, so they survive the task
// store's backend round-trips.
export interface Goal {
  id: string;
  period: GoalPeriod;
  // Which period instance: week → the Monday's ISO date, month → "2026-07",
  // year → "2026".
  periodKey: string;
  title: string;
  done: boolean;
  // Manual progress goal: target > 0 with a running progress count.
  target: number | null;
  progress: number;
  priority: Priority | null;
  // Manual sort position within its period (lower = higher in the list).
  order: number;
  // Ids of tasks whose completion drives this goal's progress.
  taskIds: string[];
  // Optional per-task weight (percent of the goal). Tasks omitted here split
  // the remaining percentage evenly, so linking without weighting still works.
  taskWeights?: Record<string, number>;
  createdAt: number;
}
