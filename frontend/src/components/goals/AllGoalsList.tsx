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
          // Same fill as the header's segmented-toggle tracks (bg-surface-toggle-track,
          // index.css) — a light neutral in light theme, a dark one in dark theme.
          <div key={key} className="bg-surface-toggle-track rounded-2xl shadow-soft p-3">
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-fg-faint mb-2 px-0.5">
              {label} · {group.length}
            </p>
            {/* A plain vertical stack of full-width cards (every card is
                `solo` in its own row) — this view is for scanning every goal
                at once, which a sideways slider hides behind swipes.
                PeriodOverview's single-period strip keeps the slider. A group
                here can span every instance of its period at once, so each
                card carries its own period label (AchievementGoalCard's
                `meta`) instead of one shared heading. */}
            <div className="flex flex-col gap-2">
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
                  solo
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
