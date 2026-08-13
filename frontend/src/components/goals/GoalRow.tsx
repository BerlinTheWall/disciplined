import { motion } from "framer-motion";
import { Check } from "lucide-react";

import { goalColor } from "@/lib/goalPriority";
import { goalProgress } from "@/lib/goalProgress";
import { tap } from "@/lib/motion";
import type { Goal } from "@/types/goals";
import type { Task } from "@/types/task";

// One row of the vertical overview list: a colored accent bar, a ring
// instead of a thin bar, title + subtitle. Compact sibling of the old
// carousel GoalCard — same progress/priority logic, laid out as a row next
// to the period path instead of a big swipeable card.
export default function GoalRow({
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
  // See GoalCard's own doc — a coarser/spanning goal surfaced into a period
  // it isn't natively filed under, styled a touch quieter.
  cascaded?: boolean;
}) {
  const p = goalProgress(goal, tasks, goals);
  const accent = goalColor(goal.priority);
  const circumference = 2 * Math.PI * 18;

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
      className={`w-full flex items-stretch gap-3 bg-surface rounded-2xl shadow-card p-3 text-left ${
        p.done ? "opacity-60" : ""
      }`}
    >
      <span
        className="w-0.75 rounded-full shrink-0"
        style={{
          backgroundColor: p.done ? "var(--surface-subtle)" : accent,
          opacity: cascaded ? 0.5 : 1,
        }}
      />
      <div className="relative w-11.5 h-11.5 shrink-0 self-center">
        <svg width="46" height="46" className="-rotate-90">
          <circle
            cx="23"
            cy="23"
            r="18"
            fill="none"
            stroke="var(--surface-subtle)"
            strokeWidth="5"
          />
          <circle
            cx="23"
            cy="23"
            r="18"
            fill="none"
            stroke={accent}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={p.done ? 0 : circumference * (1 - p.fraction)}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-[11px] font-extrabold tabular-nums">
          {p.done ? <Check size={15} style={{ color: accent }} strokeWidth={3} /> : `${p.percent}%`}
        </div>
      </div>
      <div className="min-w-0 flex-1 flex flex-col justify-center">
        <h3
          className={`text-[15px] font-extrabold truncate tracking-tight ${
            p.done ? "text-fg-faint line-through" : "text-fg"
          }`}
        >
          {goal.title}
        </h3>
        <p className="text-[12.5px] text-fg-faint truncate">
          {subtitle}
          {cascaded && ` · ${goal.period} goal`}
        </p>
      </div>
    </motion.button>
  );
}
