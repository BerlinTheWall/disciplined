import { motion } from "framer-motion";
import { Check, Flame } from "lucide-react";

import { goalColor } from "@/lib/goalPriority";
import { GOAL_PACE_COLOR, GOAL_PACE_LABEL, goalPace, goalProgress } from "@/lib/goalProgress";
import { goalStreak } from "@/lib/goalStreak";
import { tap } from "@/lib/motion";
import type { Goal } from "@/types/goals";
import type { Task } from "@/types/task";

// One carousel card: a big ring instead of a thin bar, tap anywhere to open
// the full-screen detail. Deliberately not an accordion — depth lives on
// its own screen (GoalDetailScreen), so this stays scannable at a glance.
export default function GoalCard({
  goal,
  goals,
  tasks,
  onOpen,
  cascaded = false,
}: {
  goal: Goal;
  goals: Goal[];
  tasks: Task[];
  onOpen: () => void;
  // True when this card is a coarser goal (month/year) surfaced into a
  // finer view it isn't natively filed under (e.g. a month goal shown while
  // browsing one of its weeks) — see lib/goalPeriods.ts's goalCascadesInto.
  // Styled a touch quieter so it doesn't read as identical to a goal that
  // actually belongs to this period.
  cascaded?: boolean;
}) {
  const p = goalProgress(goal, tasks, goals);
  const pace = goalPace(goal, tasks, goals);
  const streak = goalStreak(goal, goals, tasks);
  const accent = goalColor(goal.priority);
  const circumference = 2 * Math.PI * 24;

  const subtitle =
    p.mode === "linked"
      ? `${p.current} of ${p.total} linked`
      : p.mode === "milestones"
        ? `${p.current} of ${p.total} milestones`
        : p.mode === "manual"
          ? `${p.current} of ${p.total}`
          : p.done
            ? "Done"
            : "Not done yet";

  return (
    <motion.button
      onClick={onOpen}
      whileTap={tap}
      className={`shrink-0 snap-center w-[78%] bg-surface rounded-[22px] p-[18px] flex flex-col gap-3 text-left ${
        cascaded
          ? "shadow-soft border border-dashed border-border-strong"
          : "shadow-card border border-border"
      }`}
    >
      <div className="flex items-center gap-3.5">
        <div className="relative w-[58px] h-[58px] shrink-0">
          <svg width="58" height="58" className="-rotate-90">
            <circle
              cx="29"
              cy="29"
              r="24"
              fill="none"
              stroke="var(--surface-subtle)"
              strokeWidth="7"
            />
            <circle
              cx="29"
              cy="29"
              r="24"
              fill="none"
              stroke={accent}
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={p.done ? 0 : circumference * (1 - p.fraction)}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center text-[13px] font-extrabold tabular-nums">
            {p.done ? (
              <Check size={18} style={{ color: accent }} strokeWidth={3} />
            ) : (
              `${p.percent}%`
            )}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-[16.5px] font-extrabold truncate tracking-tight text-fg">
            {goal.title}
          </h3>
          <div className="flex items-center gap-1.5 mt-1">
            {streak >= 2 && (
              <span className="flex items-center gap-0.5 text-[11px] font-bold text-orange-500 shrink-0">
                <Flame size={12} fill="currentColor" strokeWidth={0} />
                {streak}
              </span>
            )}
            {pace && (
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                style={{
                  color: GOAL_PACE_COLOR[pace],
                  backgroundColor: `${GOAL_PACE_COLOR[pace]}26`,
                }}
              >
                {GOAL_PACE_LABEL[pace]}
              </span>
            )}
          </div>
        </div>
      </div>

      <p className="text-[12.5px] text-fg-faint">{subtitle}</p>

      <div className="flex items-center justify-between pt-2 mt-auto border-t border-dashed border-border text-[11.5px] font-semibold text-fg-faint">
        <span className="capitalize">
          {cascaded ? `${goal.period} goal` : `${goal.priority ?? "No"} priority`}
        </span>
        <span>Tap for details →</span>
      </div>
    </motion.button>
  );
}
