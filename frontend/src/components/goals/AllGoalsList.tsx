import AchievementGoalCard from "@/components/goals/AchievementGoalCard";
import { periodLabel, relativePeriodName } from "@/lib/goalPeriods";
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
          // bg-surface-feature-soft (index.css) — surface-feature's
          // light/dark adaptive sibling: a pale indigo tint in light theme,
          // the same dark fill as surface-feature itself in dark theme.
          // Plain surface-feature stays dark even in light mode (it's paired
          // with hardcoded white text everywhere else it's used), which read
          // as a jarring black box here against an otherwise light page.
          <div key={key} className="bg-surface-feature-soft rounded-2xl shadow-soft p-3">
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-fg-faint mb-2 px-0.5">
              {label} · {group.length}
            </p>
            {/* Same horizontal slider of achievement cards as PeriodOverview's
                "this week's goals" strip — a group here can span every
                instance of its period at once, so each card carries its own
                period label (see AchievementGoalCard's `meta`) instead of one
                shared heading the way PeriodOverview's single-instance strip
                can get away with. Scrollbar hidden the same way every other
                horizontal slider in the app is — a bare native scrollbar
                reads as a broken widget, not a carousel. No edge-to-edge
                bleed trick here — it stays inside the box's own p-3 padding
                on both ends, same as every other side of the box. */}
            <div
              className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-0.5"
              style={{ scrollbarWidth: "none" }}
            >
              {group.map((g) => (
                <AchievementGoalCard
                  key={g.id}
                  goal={g}
                  goals={goals}
                  tasks={tasks}
                  onOpen={() => onOpenGoal(g.id)}
                  meta={
                    relativePeriodName(g.period, g.periodKey) ?? periodLabel(g.period, g.periodKey)
                  }
                  solo={group.length === 1}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
