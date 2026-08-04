import { motion } from "framer-motion";

import { chipCls } from "@/components/timeline/addItemOptions";
import { canLinkGoalPeriod, periodLabel, relativePeriodName } from "@/lib/goalPeriods";
import { goalColor } from "@/lib/goalPriority";
import { tap } from "@/lib/motion";
import { useGoalStore } from "@/store/goalStore";
import type { Goal } from "@/types/goals";

// Chip picker for linking another goal as a weighted contributor — the same
// "at most one parent" pattern as GoalLinkSection.tsx (which links a task to
// a goal), just goal-to-goal. Only offers goals in a strictly more granular
// period than `goal`'s own (year -> month/week, month -> week, week ->
// none), which is what makes a link cycle structurally impossible.
export default function LinkedGoalPicker({ goal, allGoals }: { goal: Goal; allGoals: Goal[] }) {
  const options = allGoals.filter(
    (g) =>
      g.id !== goal.id &&
      canLinkGoalPeriod(goal.period, g.period) &&
      (!g.done || goal.linkedGoalIds.includes(g.id))
  );

  if (options.length === 0) {
    return <p className="text-xs text-fg-faint">No eligible goals to link yet.</p>;
  }

  return (
    <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
      {options.map((g) => {
        const linked = goal.linkedGoalIds.includes(g.id);
        return (
          <motion.button
            key={g.id}
            onClick={() => useGoalStore.getState().linkGoal(linked ? null : goal.id, g.id)}
            whileTap={tap}
            className={`flex items-center gap-1.5 ${chipCls(linked)}`}
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: goalColor(g.priority) }}
            />
            <span className="truncate max-w-32">{g.title}</span>
            <span className="text-[10px] text-fg-faint">
              {relativePeriodName(g.period, g.periodKey) ?? periodLabel(g.period, g.periodKey)}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}
