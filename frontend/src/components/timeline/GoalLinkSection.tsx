import { motion } from "framer-motion";
import { Target } from "lucide-react";

import { chipCls } from "./addItemOptions";
import { periodLabel, relativePeriodName } from "@/lib/goalPeriods";
import { goalColor } from "@/lib/goalPriority";
import { tap } from "@/lib/motion";
import { useGoalStore } from "@/store/goalStore";

// "Link to a goal" picker in the add/edit task sheet. Completing a linked task
// advances its goal's progress. Only unfinished goals are offered; each chip
// shows the goal title with its priority dot and period.
export function GoalLinkSection({
  goalId,
  onLink,
  weight,
  onWeight,
}: {
  goalId: string | null;
  onLink: (id: string | null) => void;
  // Percent of the goal this task is worth; null = auto even-split.
  weight: number | null;
  onWeight: (weight: number | null) => void;
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
              style={{ backgroundColor: goalColor(g.priority) }}
            />
            <span className="truncate max-w-40">{g.title}</span>
            <span className="text-[10px] text-fg-faint">
              {relativePeriodName(g.period, g.periodKey) ?? periodLabel(g.period, g.periodKey)}
            </span>
          </motion.button>
        ))}
      </div>

      {goalId && (
        <div className="mt-2.5 flex items-center gap-2">
          <span className="text-xs text-fg-muted">Worth</span>
          <div className="flex items-center rounded-lg bg-surface-raised px-2 py-1.5">
            <input
              value={weight == null ? "" : String(weight)}
              onChange={(e) => {
                const raw = e.target.value.replace(/\D/g, "");
                onWeight(raw === "" ? null : Math.min(100, parseInt(raw, 10)));
              }}
              placeholder="auto"
              inputMode="numeric"
              aria-label="Percent of the goal"
              className="w-10 bg-transparent text-right text-sm font-medium tabular-nums text-fg placeholder-fg-faint focus:outline-none"
            />
            <span className="text-sm text-fg-muted">%</span>
          </div>
          <span className="text-xs text-fg-faint">of the goal (blank = even split)</span>
        </div>
      )}
    </div>
  );
}

function rank(p: string | null) {
  return p === "high" ? 3 : p === "medium" ? 2 : p === "low" ? 1 : 0;
}
