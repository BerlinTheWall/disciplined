import type { Goal } from "@/types/goals";
import type { Task } from "@/types/task";

// A goal's progress, derived from whichever source applies. Task-linked goals
// take precedence (their progress is the share of linked tasks completed),
// then a manual numeric target, else a plain check-off.
export interface GoalProgress {
  mode: "tasks" | "manual" | "check";
  current: number;
  total: number; // 0 for a check-off goal
  done: boolean;
  fraction: number; // 0..1
  linkedTasks: Task[]; // in schedule order, only tasks that still exist
}

export function goalProgress(goal: Goal, tasks: Task[]): GoalProgress {
  const ids = goal.taskIds ?? [];
  const linkedTasks =
    ids.length > 0
      ? tasks
          .filter((t) => ids.includes(t.id))
          .sort((a, b) => a.date.localeCompare(b.date) || a.startMinutes - b.startMinutes)
      : [];

  if (linkedTasks.length > 0) {
    const current = linkedTasks.filter((t) => t.completed).length;
    const total = linkedTasks.length;
    return {
      mode: "tasks",
      current,
      total,
      done: goal.done || current >= total,
      fraction: total ? current / total : 0,
      linkedTasks,
    };
  }

  if (goal.target != null && goal.target > 0) {
    const current = goal.progress;
    return {
      mode: "manual",
      current,
      total: goal.target,
      done: goal.done || current >= goal.target,
      fraction: Math.min(1, current / goal.target),
      linkedTasks,
    };
  }

  return {
    mode: "check",
    current: 0,
    total: 0,
    done: goal.done,
    fraction: goal.done ? 1 : 0,
    linkedTasks,
  };
}
