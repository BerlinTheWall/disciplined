import { motion } from "framer-motion";
import { Check } from "lucide-react";

import { goalTimeLeftLabel } from "@/lib/goalPeriods";
import { goalAccent } from "@/lib/goalPriority";
import { GOAL_PACE_COLOR, GOAL_PACE_LABEL, goalPace, goalProgress } from "@/lib/goalProgress";
import { tap } from "@/lib/motion";
import type { Goal } from "@/types/goals";
import type { Task } from "@/types/task";

// The shared "achievement card" look for a goal shown outside its own detail
// screen — a solid bg-surface card against its section's own bg-fg/5 tinted
// box (see PeriodOverview/AllGoalsList), so the card reads as the crisp,
// tappable surface and the box around it reads as the quieter backdrop,
// plus the border-fg/10 outline for a clear edge either way. Used both by
// PeriodOverview's "this week's goals" strip (a horizontal slider) and
// AllGoalsList's per-period groups (a vertical stack of `solo` cards). The
// progress ring always wears the goal's own color (goalAccent), so
// a goal reads as the color the user picked wherever its ring shows up; the
// status pill beside the title carries the pace color instead (only
// meaningful for the period actually running now — see goalPace).
export default function AchievementGoalCard({
  goal,
  goals,
  tasks,
  onOpen,
  meta,
  solo,
}: {
  goal: Goal;
  goals: Goal[];
  tasks: Task[];
  onOpen: () => void;
  // AllGoalsList's context line — which period instance this goal belongs
  // to ("This week" / "Jul 14 – Jul 20") — since that view spans every
  // instance at once, unlike PeriodOverview's single browsed one.
  meta?: string;
  // The only card in its row — fills the row's full width instead of the
  // usual fixed slider width, so a single goal doesn't sit stranded next to
  // a stretch of dead space where the rest of the (non-existent) slider
  // would be. A slider passes `group.length === 1`; a vertical list passes
  // it always.
  solo?: boolean;
}) {
  const p = goalProgress(goal, tasks, goals);
  const pace = goalPace(goal, tasks, goals);
  const accent = goalAccent(goal);
  const statusColor = p.done ? GOAL_PACE_COLOR["on-track"] : pace ? GOAL_PACE_COLOR[pace] : accent;
  // r18 in a 48px box, with the stroke left at 5 — the ring grew but the
  // hole inside it grew more, so the % underneath isn't crowding the stroke.
  const circumference = 2 * Math.PI * 18;
  const progressLabel =
    p.mode === "linked"
      ? `${p.current} of ${p.total} task${p.total === 1 ? "" : "s"}`
      : p.mode === "milestones"
        ? `${p.current} of ${p.total} milestone${p.total === 1 ? "" : "s"}`
        : p.mode === "manual"
          ? `${p.current} of ${p.total}`
          : "Manual progress";
  const timeLeft = goalTimeLeftLabel(
    goal.period,
    goal.periodKey,
    goal.startDate,
    goal.durationCount
  );

  return (
    <motion.button
      onClick={onOpen}
      whileTap={tap}
      className={`${solo ? "w-full" : "w-60 shrink-0 snap-start"} flex flex-col gap-3 rounded-2xl p-3.5 text-left bg-surface border border-fg/10 shadow-soft`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="relative w-12 h-12 shrink-0">
          <svg width="48" height="48" className="-rotate-90">
            <circle
              cx="24"
              cy="24"
              r="18"
              fill="none"
              stroke="var(--surface-subtle)"
              strokeWidth="5"
            />
            <circle
              cx="24"
              cy="24"
              r="18"
              fill="none"
              stroke={accent}
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={p.done ? 0 : circumference * (1 - p.fraction)}
              style={{ transition: "stroke-dashoffset 0.6s ease" }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            {p.done ? (
              <Check size={15} style={{ color: accent }} strokeWidth={3} />
            ) : (
              <span className="text-[11px] font-extrabold text-fg tabular-nums">{p.percent}%</span>
            )}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          {meta && (
            <p className="text-[10px] font-semibold text-fg-faint truncate mb-0.5">{meta}</p>
          )}
          <p
            className={`text-[14px] font-bold truncate ${p.done ? "text-fg-faint line-through" : "text-fg"}`}
          >
            {goal.title}
          </p>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {goal.category && (
              <span className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-fg/10 text-fg-faint">
                {goal.category}
              </span>
            )}
            {(pace || p.done) && (
              <span
                className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={{ color: statusColor, backgroundColor: `${statusColor}26` }}
              >
                {p.done ? "Done" : GOAL_PACE_LABEL[pace!]}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-fg/10 text-[11px] text-fg-faint">
        <span className="truncate">{progressLabel}</span>
        {timeLeft && <span className="shrink-0">{timeLeft}</span>}
      </div>
    </motion.button>
  );
}
