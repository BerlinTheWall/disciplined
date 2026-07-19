import { motion } from "framer-motion";
import { Target } from "lucide-react";

import { chipCls } from "./addItemOptions";
import { periodLabel, relativePeriodName } from "@/lib/goalPeriods";
import { tap } from "@/lib/motion";
import { PRIORITY_META } from "@/lib/priority";
import { useGoalStore } from "@/store/goalStore";

// "Link to a goal" picker in the add/edit task sheet. Completing a linked task
// advances its goal's progress. Only unfinished goals are offered; each chip
// shows the goal title with its priority dot and period.
export function GoalLinkSection({
  goalId,
  onLink,
}: {
  goalId: string | null;
  onLink: (id: string | null) => void;
}) {
  const goals = useGoalStore((s) => s.goals);
  const options = goals
    .filter((g) => !g.done || g.id === goalId)
    .sort((a, b) =>
      a.priority === b.priority ? a.createdAt - b.createdAt : rank(b.priority) - rank(a.priority)
    );

  if (options.length === 0) return null;

  return (
    <div>
      <label className="mb-2 flex items-center gap-1.5 text-xs font-medium text-fg-muted">
        <Target size={13} />
        Link to a goal (optional)
      </label>
      <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
        <motion.button onClick={() => onLink(null)} whileTap={tap} className={chipCls(!goalId)}>
          None
        </motion.button>
        {options.map((g) => (
          <motion.button
            key={g.id}
            onClick={() => onLink(g.id)}
            whileTap={tap}
            className={`flex items-center gap-1.5 ${chipCls(goalId === g.id)}`}
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: g.priority ? PRIORITY_META[g.priority].color : "#9ca3af" }}
            />
            <span className="truncate max-w-40">{g.title}</span>
            <span className="text-[10px] text-fg-faint">
              {relativePeriodName(g.period, g.periodKey) ?? periodLabel(g.period, g.periodKey)}
            </span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}

function rank(p: string | null) {
  return p === "high" ? 3 : p === "medium" ? 2 : p === "low" ? 1 : 0;
}
