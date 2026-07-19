import type { Goal } from "@/types/goals";
import type { Task } from "@/types/task";

// A goal's progress, derived from whichever source applies. Task-linked goals
// take precedence, then a manual numeric target, else a plain check-off.
export interface GoalProgress {
  mode: "tasks" | "manual" | "check";
  done: boolean;
  fraction: number; // 0..1, for the bar
  percent: number; // round(fraction * 100)
  current: number; // manual: progress; tasks: completed count
  total: number; // manual: target; tasks: linked count
  linkedTasks: Task[]; // in schedule order, only tasks that still exist
  // Effective weight (percent of the goal) per linked task id — explicit ones
  // as set, the rest sharing the remainder evenly.
  shares: Record<string, number>;
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
    const pinned = goal.taskWeights ?? {};
    // Sum the explicit weights; the rest split what's left of 100 evenly.
    let pinnedSum = 0;
    const autoIds: string[] = [];
    for (const t of linkedTasks) {
      const w = pinned[t.id];
      if (typeof w === "number") pinnedSum += w;
      else autoIds.push(t.id);
    }
    const remaining = Math.max(0, 100 - Math.min(100, pinnedSum));
    const autoWeight = autoIds.length ? remaining / autoIds.length : 0;

    const shares: Record<string, number> = {};
    for (const t of linkedTasks) {
      const w = pinned[t.id];
      shares[t.id] = typeof w === "number" ? w : autoWeight;
    }

    const completed = linkedTasks.filter((t) => t.completed);
    const completedPct = completed.reduce((s, t) => s + shares[t.id], 0);
    // Finishing every linked task always counts as done, even if the assigned
    // weights sum to less than 100.
    const allDone = completed.length === linkedTasks.length;
    const fraction = allDone ? 1 : Math.min(1, completedPct / 100);
    return {
      mode: "tasks",
      done: goal.done || allDone,
      fraction,
      percent: Math.round(fraction * 100),
      current: completed.length,
      total: linkedTasks.length,
      linkedTasks,
      shares,
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
      shares: {},
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
    shares: {},
  };
}
