import { motion } from "framer-motion";
import { Check } from "lucide-react";

import { periodLabel, relativePeriodName } from "@/lib/goalPeriods";
import { goalColor } from "@/lib/goalPriority";
import { goalProgress } from "@/lib/goalProgress";
import { tap } from "@/lib/motion";
import type { Goal, GoalPeriod } from "@/types/goals";
import type { Task } from "@/types/task";

const GROUPS: { key: GoalPeriod; label: string }[] = [
  { key: "week", label: "Week goals" },
  { key: "month", label: "Month goals" },
  { key: "year", label: "Year goals" },
];

// The flat counterpart to the Week/Month/Year rail — every goal at once,
// grouped by its own period rather than scoped to whichever instance is
// being browsed. Toggled from the header (see App.tsx's goals-controls),
// same relationship the schedule page's daily/weekly toggle has to Timeline.
export default function AllGoalsList({
  goals,
  tasks,
  onOpenGoal,
}: {
  goals: Goal[];
  tasks: Task[];
  onOpenGoal: (goalId: string) => void;
}) {
  if (goals.length === 0) {
    return (
      <div className="bg-surface rounded-2xl shadow-soft p-8 text-center">
        <p className="text-sm text-fg-faint">No goals yet — tap + to add one.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {GROUPS.map(({ key, label }) => {
        const group = goals
          .filter((g) => g.period === key)
          .sort((a, b) => a.periodKey.localeCompare(b.periodKey) || a.order - b.order);
        if (group.length === 0) return null;
        return (
          <div key={key} className="bg-surface rounded-2xl shadow-soft p-3">
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-fg-faint mb-2 px-0.5">
              {label} · {group.length}
            </p>
            <div className="flex flex-col gap-1">
              {group.map((g) => (
                <GoalRow
                  key={g.id}
                  goal={g}
                  goals={goals}
                  tasks={tasks}
                  onOpen={() => onOpenGoal(g.id)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function GoalRow({
  goal,
  goals,
  tasks,
  onOpen,
}: {
  goal: Goal;
  goals: Goal[];
  tasks: Task[];
  onOpen: () => void;
}) {
  const p = goalProgress(goal, tasks, goals);
  const accent = goalColor(goal.priority);
  const circumference = 2 * Math.PI * 11;
  const dateLabel =
    relativePeriodName(goal.period, goal.periodKey) ?? periodLabel(goal.period, goal.periodKey);

  return (
    <motion.button
      onClick={onOpen}
      whileTap={tap}
      className="w-full flex items-center gap-2.5 rounded-xl px-1.5 py-2 text-left"
    >
      <div className="relative w-8 h-8 shrink-0">
        <svg width="32" height="32" className="-rotate-90">
          <circle
            cx="16"
            cy="16"
            r="11"
            fill="none"
            stroke="var(--surface-subtle)"
            strokeWidth="3"
          />
          <circle
            cx="16"
            cy="16"
            r="11"
            fill="none"
            stroke={accent}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={p.done ? 0 : circumference * (1 - p.fraction)}
            style={{ transition: "stroke-dashoffset 0.6s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          {p.done ? (
            <Check size={13} className="text-fg-muted" strokeWidth={3} />
          ) : (
            <span className="text-[9px] font-extrabold tabular-nums">{p.percent}%</span>
          )}
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={`text-sm font-semibold truncate ${
            p.done ? "text-fg-faint line-through" : "text-fg"
          }`}
        >
          {goal.title}
        </p>
        <p className="text-[11px] text-fg-faint truncate">{dateLabel}</p>
      </div>
    </motion.button>
  );
}
