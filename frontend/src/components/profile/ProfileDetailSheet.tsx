import { useMemo } from "react";
import { motion } from "framer-motion";
import { Flame, Lightbulb, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import BottomSheet from "@/components/BottomSheet";
import {
  CalorieBars,
  Heatmap,
  MacroBar,
  MonthBars,
  Stat,
} from "@/components/profile/ProfileCharts";
import { CATEGORIES, type CategoryKey } from "@/lib/categories";
import { todayISODate } from "@/lib/date";
import { CALORIE_GOAL, MACRO_GOALS } from "@/lib/goals";
import { money } from "@/lib/grocery";
import { ICONS } from "@/lib/icons";
import {
  habitMonthlyCompletion,
  habitStats,
  heatmapWeeks,
  lastMonths,
  monthlyConsistency,
  monthlyHabitConsistency,
  monthlyNutrition,
  monthlySpend,
  monthlyWorkouts,
  recentNutrition,
  spendInRange,
  summarizeConsistency,
  summarizeHabits,
  summarizeNutrition,
  summarizeSpending,
  summarizeWorkouts,
  weekdayBreakdown,
  workoutStats,
} from "@/lib/insights";
import { tap } from "@/lib/motion";
import { WORKOUT_TYPE_META } from "@/lib/workout";
import { useExpenseStore } from "@/store/expenseStore";
import { useGroceryStore } from "@/store/groceryStore";
import { useHabitStore } from "@/store/habitStore";
import { useMealStore } from "@/store/mealStore";
import { useTaskStore } from "@/store/taskStore";
import { useWorkoutStore } from "@/store/workoutStore";

export type ProfileDetailKind = "consistency" | "habits" | "workouts" | "nutrition" | "spending";

const MONTHS_BACK = 6;
const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

const TITLES: Record<ProfileDetailKind, string> = {
  consistency: "Consistency",
  habits: "Habit Streaks",
  workouts: "Workouts",
  nutrition: "Nutrition",
  spending: "Spending",
};

// The highlighted "here's what's going on" box at the top of every detail —
// a short, locally-composed analysis (arithmetic phrased as prose, not an LLM
// call) of the month-over-month numbers below it.
function Analysis({ text }: { text: string }) {
  return (
    <div className="rounded-2xl bg-surface-alt border border-border-strong p-4 flex items-start gap-3">
      <span className="w-8 h-8 rounded-full bg-surface flex items-center justify-center shrink-0 mt-0.5">
        <Lightbulb size={15} className="text-fg-muted" />
      </span>
      <p className="text-sm text-fg leading-relaxed">{text}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h3 className="text-[11px] font-semibold text-fg-faint uppercase tracking-wide mb-2">
        {title}
      </h3>
      {children}
    </div>
  );
}

export default function ProfileDetailSheet({
  kind,
  onClose,
}: {
  kind: ProfileDetailKind | null;
  onClose: () => void;
}) {
  const tasks = useTaskStore((s) => s.tasks);
  const habits = useHabitStore((s) => s.habits);
  const meals = useMealStore((s) => s.meals);
  const groceryItems = useGroceryStore((s) => s.groceryItems);
  const sessions = useWorkoutStore((s) => s.sessions);
  const expenses = useExpenseStore((s) => s.expenses);
  const monthlyBudget = useExpenseStore((s) => s.monthlyBudget);

  const today = todayISODate();
  const todayObj = useMemo(() => new Date(), []);

  // Consistency
  const heat = useMemo(() => heatmapWeeks(52, tasks, habits), [tasks, habits]);
  const consistencyMonths = useMemo(
    () => monthlyConsistency(MONTHS_BACK, tasks, habits, todayObj),
    [tasks, habits, todayObj]
  );
  const weekdays = useMemo(
    () => weekdayBreakdown(90, tasks, habits, todayObj),
    [tasks, habits, todayObj]
  );
  const bestWeekday = weekdays.reduce(
    (a, b) => (b.total > 0 && b.pct > a.pct ? b : a),
    weekdays[0]
  );
  const worstWeekday = weekdays
    .filter((w) => w.total > 0)
    .reduce((a, b) => (b.pct < a.pct ? b : a), weekdays.find((w) => w.total > 0) ?? weekdays[0]);

  // Habits
  const habitRows = useMemo(() => habitStats(habits, todayObj), [habits, todayObj]);
  const habitMonths = useMemo(
    () => monthlyHabitConsistency(MONTHS_BACK, habits, todayObj),
    [habits, todayObj]
  );

  // Workouts
  const workoutMonths = useMemo(
    () => monthlyWorkouts(MONTHS_BACK, tasks, sessions, todayObj),
    [tasks, sessions, todayObj]
  );
  const woOverall = useMemo(
    () => workoutStats(tasks, sessions, "0000-01-01", today, todayObj),
    [tasks, sessions, today, todayObj]
  );
  const currentWoMonth = workoutMonths[workoutMonths.length - 1];
  const prevWoMonth = workoutMonths[workoutMonths.length - 2];

  // Nutrition
  const nutrition14 = useMemo(
    () => recentNutrition(14, meals, groceryItems),
    [meals, groceryItems]
  );
  const nutritionMonths = useMemo(
    () => monthlyNutrition(MONTHS_BACK, meals, groceryItems, todayObj),
    [meals, groceryItems, todayObj]
  );
  const currentNutritionMonth = nutritionMonths[nutritionMonths.length - 1];

  // Spending
  const spendMonths = useMemo(
    () => monthlySpend(MONTHS_BACK, expenses, todayObj),
    [expenses, todayObj]
  );
  const currentSpendMonth = spendMonths[spendMonths.length - 1];
  const currentSpendDetail = useMemo(() => {
    const range = lastMonths(1, todayObj)[0];
    return spendInRange(expenses, range.start, range.endISO);
  }, [expenses, todayObj]);
  const topCategories = Object.entries(currentSpendDetail.byCategory).sort((a, b) => b[1] - a[1]);
  const maxCat = topCategories.length ? topCategories[0][1] : 1;

  if (!kind) return null;

  return (
    <BottomSheet
      isOpen={!!kind}
      onClose={onClose}
      className="bg-surface-alt max-h-[90vh] flex flex-col"
    >
      <div className="flex items-center justify-between p-5 pb-4">
        <h2 className="text-xl font-bold text-fg">{TITLES[kind]}</h2>
        <motion.button onClick={onClose} whileTap={tap} className="p-2 -m-2 text-fg-faint">
          <X size={22} />
        </motion.button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-[calc(2rem+env(safe-area-inset-bottom))]">
        {kind === "consistency" && (
          <>
            <Analysis text={summarizeConsistency(consistencyMonths)} />
            <div className="h-4" />
            <Section title={`Last ${MONTHS_BACK} months`}>
              <div className="rounded-2xl bg-surface p-4">
                <MonthBars
                  points={consistencyMonths}
                  value={(p) => p.pct}
                  format={(v) => `${v}%`}
                />
              </div>
            </Section>
            <Section title="Full year">
              <div className="rounded-2xl bg-surface p-4">
                <Heatmap weeks={heat} />
                <div className="flex items-center justify-end gap-1.5 mt-3 text-[11px] text-fg-faint">
                  <span>Less</span>
                  {[0.15, 0.4, 0.6, 0.8, 1].map((a) => (
                    <span
                      key={a}
                      className="w-[11px] h-[11px] rounded-[3px]"
                      style={{ backgroundColor: `rgba(158,192,106,${a})` }}
                    />
                  ))}
                  <span>More</span>
                </div>
              </div>
            </Section>
            <Section title="By day of week (last 90 days)">
              <div className="rounded-2xl bg-surface p-4">
                <div className="flex items-end gap-2 h-20">
                  {weekdays.map((w) => (
                    <div
                      key={w.day}
                      className="flex-1 flex flex-col items-center justify-end gap-1"
                    >
                      <div className="w-full h-14 rounded-md bg-surface-subtle flex items-end overflow-hidden">
                        <div
                          className="w-full rounded-md"
                          style={{
                            height: w.total ? `${Math.max(w.pct, 6)}%` : 0,
                            backgroundColor:
                              w.total === 0
                                ? "transparent"
                                : w.day === bestWeekday.day
                                  ? "#9ec06a"
                                  : "#9ec06a88",
                          }}
                        />
                      </div>
                      <p className="text-[10px] text-fg-faint">{WEEKDAY_LABELS[w.day]}</p>
                    </div>
                  ))}
                </div>
                {bestWeekday.total > 0 && (
                  <p className="text-xs text-fg-muted mt-3">
                    Best: <span className="text-fg font-medium">{dayName(bestWeekday.day)}</span> (
                    {bestWeekday.pct}%) · Toughest:{" "}
                    <span className="text-fg font-medium">{dayName(worstWeekday.day)}</span> (
                    {worstWeekday.pct}%)
                  </p>
                )}
              </div>
            </Section>
          </>
        )}

        {kind === "habits" && (
          <>
            <Analysis text={summarizeHabits(habitRows, habitMonths)} />
            <div className="h-4" />
            <Section title={`Overall completion, last ${MONTHS_BACK} months`}>
              <div className="rounded-2xl bg-surface p-4">
                <MonthBars points={habitMonths} value={(p) => p.pct} format={(v) => `${v}%`} />
              </div>
            </Section>
            <Section title="Every habit">
              <div className="rounded-2xl bg-surface p-2">
                {habitRows.length === 0 ? (
                  <p className="text-sm text-fg-faint p-3">No habits yet.</p>
                ) : (
                  habitRows.map(({ habit, current, longest, rate7 }) => {
                    const Icon = ICONS[habit.icon] ?? ICONS.default;
                    const [prevM, curM] = habitMonthlyCompletion(habit, 2, todayObj);
                    return (
                      <div
                        key={habit.id}
                        className="flex items-center gap-3 px-2.5 py-3 border-b border-border last:border-0"
                      >
                        <span
                          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                          style={{ backgroundColor: `${habit.color}22`, color: habit.color }}
                        >
                          <Icon size={16} />
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-fg truncate">{habit.title}</p>
                          <p className="text-[11px] text-fg-faint">
                            {prevM.total > 0 && `${prevM.label} ${prevM.pct}% → `}
                            {curM.label} {curM.pct}%<span className="mx-1">·</span>
                            last 7: {Math.round(rate7 * 100)}%
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="flex items-center gap-1 text-sm font-bold text-fg tabular-nums justify-end">
                            <Flame size={13} className="text-orange-400" />
                            {current}
                          </p>
                          <p className="text-[11px] text-fg-faint">best {longest}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </Section>
          </>
        )}

        {kind === "workouts" && (
          <>
            <Analysis text={summarizeWorkouts(workoutMonths, woOverall.daysSince)} />
            <div className="h-4" />
            <Section title={`Sessions per month, last ${MONTHS_BACK} months`}>
              <div className="rounded-2xl bg-surface p-4">
                <MonthBars points={workoutMonths} value={(p) => p.total} />
              </div>
            </Section>
            <Section title="Snapshot">
              <div className="grid grid-cols-3 gap-3">
                <Stat value={currentWoMonth?.total ?? 0} label="this month" />
                <Stat value={prevWoMonth?.total ?? 0} label="last month" />
                <Stat
                  value={woOverall.daysSince ?? "—"}
                  label={woOverall.daysSince === null ? "none yet" : "days since last"}
                />
              </div>
            </Section>
            <Section title="This month by type">
              {currentWoMonth && Object.keys(currentWoMonth.byType).length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(currentWoMonth.byType).map(([type, count]) => {
                    const meta = WORKOUT_TYPE_META[type as keyof typeof WORKOUT_TYPE_META];
                    const TypeIcon = meta.icon as LucideIcon;
                    return (
                      <span
                        key={type}
                        className="flex items-center gap-1.5 rounded-full pl-2 pr-3 py-1 text-xs font-medium"
                        style={{ backgroundColor: `${meta.color}1f`, color: meta.color }}
                      >
                        <TypeIcon size={13} />
                        {meta.label}
                        <span className="text-fg tabular-nums">{count}</span>
                      </span>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-fg-faint">No workouts completed this month yet.</p>
              )}
            </Section>
          </>
        )}

        {kind === "nutrition" && (
          <>
            <Analysis text={summarizeNutrition(nutritionMonths, CALORIE_GOAL)} />
            <div className="h-4" />
            <Section title={`Avg daily calories, last ${MONTHS_BACK} months`}>
              <div className="rounded-2xl bg-surface p-4">
                <MonthBars
                  points={nutritionMonths}
                  value={(p) => p.avg.calories}
                  goal={CALORIE_GOAL}
                />
              </div>
            </Section>
            <Section title="Last 14 days">
              <div className="rounded-2xl bg-surface p-4">
                <CalorieBars
                  days={nutrition14.map((d) => ({
                    date: d.date,
                    calories: d.nutrition.calories,
                    logged: d.logged,
                  }))}
                  goal={CALORIE_GOAL}
                />
              </div>
            </Section>
            <Section title="This month's average macros">
              <div className="rounded-2xl bg-surface p-4 space-y-2.5">
                <MacroBar
                  label="Protein"
                  value={currentNutritionMonth?.avg.protein ?? 0}
                  goal={MACRO_GOALS.protein}
                  color="#f87171"
                />
                <MacroBar
                  label="Carbs"
                  value={currentNutritionMonth?.avg.carbs ?? 0}
                  goal={MACRO_GOALS.carbs}
                  color="#fbbf24"
                />
                <MacroBar
                  label="Fat"
                  value={currentNutritionMonth?.avg.fat ?? 0}
                  goal={MACRO_GOALS.fat}
                  color="#60a5fa"
                />
              </div>
            </Section>
          </>
        )}

        {kind === "spending" && (
          <>
            <Analysis text={summarizeSpending(spendMonths, monthlyBudget)} />
            <div className="h-4" />
            <Section title={`Total per month, last ${MONTHS_BACK} months`}>
              <div className="rounded-2xl bg-surface p-4">
                <MonthBars
                  points={spendMonths}
                  value={(p) => p.total}
                  format={(v) => money(v)}
                  goal={monthlyBudget || undefined}
                />
              </div>
            </Section>
            <Section title="This month by category">
              <div className="rounded-2xl bg-surface p-4">
                {topCategories.length > 0 ? (
                  <div className="space-y-2.5">
                    {topCategories.map(([cat, amount]) => {
                      const meta = CATEGORIES[cat as CategoryKey] ?? CATEGORIES.other;
                      const CatIcon = meta.icon as LucideIcon;
                      return (
                        <div key={cat} className="flex items-center gap-3">
                          <span
                            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                            style={{ backgroundColor: `${meta.color}22`, color: meta.color }}
                          >
                            <CatIcon size={15} />
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-fg-muted">{meta.label}</span>
                              <span className="text-fg font-medium tabular-nums">
                                {money(amount)}
                              </span>
                            </div>
                            <div className="h-1.5 rounded-full bg-surface-subtle overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${(amount / maxCat) * 100}%`,
                                  backgroundColor: meta.color,
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-fg-faint">No spending logged this month.</p>
                )}
              </div>
            </Section>
            {currentSpendMonth && (
              <Section title="Snapshot">
                <div className="grid grid-cols-2 gap-3">
                  <Stat value={money(currentSpendMonth.total)} label="this month" />
                  <Stat value={money(monthlyBudget)} label="budget" />
                </div>
              </Section>
            )}
          </>
        )}
      </div>
    </BottomSheet>
  );
}

function dayName(day: number): string {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][day];
}
