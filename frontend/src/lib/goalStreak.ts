import { shiftPeriodKey } from "./goalPeriods";
import { goalProgress } from "./goalProgress";
import type { Goal } from "@/types/goals";
import type { Task } from "@/types/task";

// How many consecutive periods (immediately leading up to — and including,
// if it's already done — this goal's own period) share this goal's title
// and were completed. Purely derived from what's already in the store: no
// new field, and nothing is lost by breaking one — it's a number that only
// ever grows, never a streak that resets and punishes.
export function goalStreak(goal: Goal, allGoals: Goal[], tasks: Task[]): number {
  const title = goal.title.trim().toLowerCase();
  const find = (periodKey: string) =>
    allGoals.find(
      (g) =>
        g.period === goal.period &&
        g.periodKey === periodKey &&
        g.title.trim().toLowerCase() === title
    );

  // An unfinished current-period goal doesn't break the streak leading into
  // it — it just doesn't extend it yet. Start counting from the period
  // before it in that case.
  let key = goal.periodKey;
  const own = find(key);
  if (!own || !goalProgress(own, tasks, allGoals).done) {
    key = shiftPeriodKey(goal.period, key, -1);
  }

  let count = 0;
  while (true) {
    const match = find(key);
    if (!match || !goalProgress(match, tasks, allGoals).done) break;
    count++;
    key = shiftPeriodKey(goal.period, key, -1);
  }
  return count;
}
