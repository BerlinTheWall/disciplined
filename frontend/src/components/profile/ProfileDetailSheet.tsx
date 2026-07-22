import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Flame, Lightbulb, Loader2, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import BottomSheet from "@/components/BottomSheet";
import Collapse from "@/components/Collapse";
import {
  CalorieBars,
  Heatmap,
  MacroBar,
  MonthBars,
  Stat,
} from "@/components/profile/ProfileCharts";
import { primeAudioChannel, speakAssistant, stopSpeaking, wordTokens } from "@/hooks/useSpeech";
import { CATEGORIES, type CategoryKey } from "@/lib/categories";
import { addDays, todayISODate, toISODate } from "@/lib/date";
import { CALORIE_GOAL, MACRO_GOALS } from "@/lib/goals";
import { money } from "@/lib/grocery";
import { ICONS } from "@/lib/icons";
import {
  consistencyByPeriod,
  dayScore,
  habitConsistencyByPeriod,
  habitMonthlyCompletion,
  habitStats,
  heatmapWeeks,
  lastPeriods,
  nutritionByPeriod,
  recentNutrition,
  spendByPeriod,
  spendInRange,
  summarizeConsistency,
  summarizeHabits,
  summarizeNutrition,
  summarizeSpending,
  summarizeWorkouts,
  weekdayBreakdown,
  workoutsByPeriod,
  workoutStats,
  type ComparePeriod,
  type PeriodRange,
} from "@/lib/insights";
import { spring, tap } from "@/lib/motion";
import { WORKOUT_TYPE_META } from "@/lib/workout";
import { useExpenseStore } from "@/store/expenseStore";
import { useGroceryStore } from "@/store/groceryStore";
import { useHabitStore } from "@/store/habitStore";
import { useMealStore } from "@/store/mealStore";
import { useTaskStore } from "@/store/taskStore";
import { useWorkoutStore } from "@/store/workoutStore";

export type ProfileDetailKind = "consistency" | "habits" | "workouts" | "nutrition" | "spending";

// How many bars to show per granularity — enough to actually compare against
// each other without the chart turning into a wall of slivers.
const PERIOD_COUNTS: Record<ComparePeriod, number> = { week: 8, month: 6, year: 5 };
const PERIODS: { key: ComparePeriod; label: string }[] = [
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
];
const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

const TITLES: Record<ProfileDetailKind, string> = {
  consistency: "Consistency",
  habits: "Habit Streaks",
  workouts: "Workouts",
  nutrition: "Nutrition",
  spending: "Spending",
};

// Week/Month/Year switcher for the comparison chart — the same segmented
// control pattern as the Goals page.
function PeriodToggle({
  value,
  onChange,
}: {
  value: ComparePeriod;
  onChange: (p: ComparePeriod) => void;
}) {
  return (
    <div className="flex items-center bg-surface-raised rounded-xl p-1 mb-4">
      {PERIODS.map((p) => (
        <button
          key={p.key}
          onClick={() => onChange(p.key)}
          className="relative flex-1 h-9 rounded-lg text-sm font-medium"
        >
          {value === p.key && (
            <motion.span
              layoutId="profileDetailPeriod"
              transition={spring.snappy}
              className="absolute inset-0 bg-surface rounded-lg shadow-sm"
            />
          )}
          <span className={`relative z-10 ${value === p.key ? "text-fg" : "text-fg-muted"}`}>
            {p.label}
          </span>
        </button>
      ))}
    </div>
  );
}

// The highlighted "here's what's going on" box at the top of every detail —
// a short, locally-composed analysis (arithmetic phrased as prose, not an LLM
// call) of the period-over-period numbers below it. Collapsed by default;
// tapping the lightbulb expands it and reads it aloud (Gemini voice via
// speakAssistant), lighting up the bulb and highlighting each word as it's
// spoken. State is kept local to this instance rather than the app's global
// read-aloud store, so this doesn't fight over play/stop with unrelated
// speech elsewhere in the app.
function Analysis({ text }: { text: string }) {
  const [status, setStatus] = useState<"idle" | "loading" | "reading">("idle");
  const [activeWord, setActiveWord] = useState(-1);
  const activeRef = useRef(false); // true while THIS instance owns the current speech
  const words = useMemo(() => wordTokens(text).map((t) => t.word), [text]);

  useEffect(() => {
    // The sheet stays mounted across a Week/Month/Year switch — only `text`
    // changes — so a reading in progress would otherwise keep narrating
    // numbers that no longer match what's on screen.
    if (activeRef.current) {
      stopSpeaking();
      activeRef.current = false;
      setStatus("idle");
      setActiveWord(-1);
    }
  }, [text]);

  useEffect(() => {
    return () => {
      if (activeRef.current) stopSpeaking();
    };
  }, []);

  function handleTap() {
    if (status !== "idle") {
      stopSpeaking();
      activeRef.current = false;
      setStatus("idle");
      setActiveWord(-1);
      return;
    }
    // Unlock the audio channel synchronously in the tap handler — the actual
    // playback starts later, after an async fetch, outside the gesture window
    // mobile browsers otherwise require.
    primeAudioChannel();
    activeRef.current = true;
    setStatus("loading");
    void speakAssistant(text, {
      onStart: () => setStatus("reading"),
      onWord: setActiveWord,
      onDone: () => {
        activeRef.current = false;
        setStatus("idle");
        setActiveWord(-1);
      },
    });
  }

  const expanded = status !== "idle";

  return (
    <div className="rounded-2xl bg-surface-alt border border-border-strong p-4">
      <div className="flex items-start gap-3">
        <motion.button
          whileTap={tap}
          onClick={handleTap}
          aria-label={
            status === "idle"
              ? "Read analysis aloud"
              : status === "loading"
                ? "Preparing voice"
                : "Stop reading"
          }
          className="w-8 h-8 rounded-full bg-surface flex items-center justify-center shrink-0 mt-0.5"
        >
          {status === "loading" ? (
            <motion.span
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="flex"
            >
              <Loader2 size={15} className="text-fg-muted" />
            </motion.span>
          ) : (
            <Lightbulb
              size={15}
              className={status === "reading" ? "text-amber-400" : "text-fg-muted"}
              fill={status === "reading" ? "currentColor" : "none"}
            />
          )}
        </motion.button>

        <div className="flex-1 min-w-0">
          {!expanded && (
            <button onClick={handleTap} className="text-sm text-fg-muted text-left pt-1.5 w-full">
              Tap to hear the analysis
            </button>
          )}
          <Collapse open={expanded}>
            <p className="text-sm text-fg leading-relaxed">
              {words.map((w, i) => (
                <span
                  key={i}
                  className={
                    i === activeWord ? "bg-amber-400/30 rounded px-0.5 -mx-0.5" : undefined
                  }
                >
                  {w}
                  {i < words.length - 1 ? " " : ""}
                </span>
              ))}
            </p>
            <p className="text-xs text-fg-faint pt-2">
              {status === "loading" ? "Preparing voice…" : "🔊 Reading aloud — tap to stop"}
            </p>
          </Collapse>
        </div>
      </div>
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

  // Chart granularity — shared across whichever card's sheet is open.
  const [period, setPeriod] = useState<ComparePeriod>("month");
  const count = PERIOD_COUNTS[period];

  // Consistency
  const heat = useMemo(() => heatmapWeeks(52, tasks, habits), [tasks, habits]);
  const consistencyPoints = useMemo(
    () => consistencyByPeriod(period, count, tasks, habits, todayObj),
    [period, count, tasks, habits, todayObj]
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

  // Week drill-down: which specific week (Mon..Sun) is expanded below the
  // "Last N weeks" chart when period === "week". Index into weekRanges/
  // consistencyPoints, which share the same ordering there. Persists across
  // switching away from and back to Week — jumping back to whatever you were
  // last looking at is more useful than always snapping to the current week.
  const [selectedWeekIdx, setSelectedWeekIdx] = useState<number | null>(null);
  const weekRanges = useMemo(() => lastPeriods("week", PERIOD_COUNTS.week, todayObj), [todayObj]);
  const effectiveWeekIdx = Math.min(
    selectedWeekIdx ?? weekRanges.length - 1,
    weekRanges.length - 1
  );
  const selectedWeek = weekRanges[effectiveWeekIdx];
  // One entry per Mon..Sun of that week; null for days after today (they
  // haven't happened, so there's nothing to show — not a 0% failure).
  const weekDayScores = useMemo(() => {
    const monday = new Date(selectedWeek.start + "T00:00:00");
    const todayISO = todayISODate();
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(monday, i);
      const iso = toISODate(d);
      return iso > todayISO ? null : dayScore(iso, tasks, habits);
    });
  }, [selectedWeek, tasks, habits]);

  // Habits
  const habitRows = useMemo(() => habitStats(habits, todayObj), [habits, todayObj]);
  const habitPoints = useMemo(
    () => habitConsistencyByPeriod(period, count, habits, todayObj),
    [period, count, habits, todayObj]
  );

  // Workouts
  const workoutPoints = useMemo(
    () => workoutsByPeriod(period, count, tasks, sessions, todayObj),
    [period, count, tasks, sessions, todayObj]
  );
  const woOverall = useMemo(
    () => workoutStats(tasks, sessions, "0000-01-01", today, todayObj),
    [tasks, sessions, today, todayObj]
  );
  const currentWorkoutPeriod = workoutPoints[workoutPoints.length - 1];
  const prevWorkoutPeriod = workoutPoints[workoutPoints.length - 2];

  // Nutrition
  const nutrition14 = useMemo(
    () => recentNutrition(14, meals, groceryItems),
    [meals, groceryItems]
  );
  const nutritionPoints = useMemo(
    () => nutritionByPeriod(period, count, meals, groceryItems, todayObj),
    [period, count, meals, groceryItems, todayObj]
  );
  const currentNutritionPeriod = nutritionPoints[nutritionPoints.length - 1];

  // Spending
  const spendPoints = useMemo(
    () => spendByPeriod(period, count, expenses, todayObj),
    [period, count, expenses, todayObj]
  );
  const currentSpendPeriod = spendPoints[spendPoints.length - 1];
  const currentSpendDetail = useMemo(() => {
    const range = lastPeriods(period, 1, todayObj)[0];
    return spendInRange(expenses, range.start, range.endISO);
  }, [period, expenses, todayObj]);
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
        <PeriodToggle value={period} onChange={setPeriod} />

        {kind === "consistency" && (
          <>
            <Analysis text={summarizeConsistency(consistencyPoints, period)} />
            <div className="h-4" />
            <Section title={`Last ${count} ${period}s`}>
              <div className="rounded-2xl bg-surface p-4">
                <MonthBars
                  points={consistencyPoints}
                  value={(p) => p.pct}
                  format={(v) => `${v}%`}
                  selectedIndex={period === "week" ? effectiveWeekIdx : undefined}
                  onSelect={period === "week" ? setSelectedWeekIdx : undefined}
                />
                {period === "week" && (
                  <p className="text-[11px] text-fg-faint text-center mt-2">
                    Tap a bar to see that week's days
                  </p>
                )}
              </div>
            </Section>

            {period === "week" && (
              <Section title="Week detail">
                <div className="rounded-2xl bg-surface p-4">
                  <div className="flex items-center justify-between mb-5">
                    <motion.button
                      onClick={() => setSelectedWeekIdx(Math.max(0, effectiveWeekIdx - 1))}
                      whileTap={tap}
                      disabled={effectiveWeekIdx === 0}
                      aria-label="Previous week"
                      className="p-1.5 -m-1.5 text-fg-muted disabled:opacity-30"
                    >
                      <ChevronLeft size={18} />
                    </motion.button>
                    <p className="text-sm font-semibold text-fg">{weekRangeLabel(selectedWeek)}</p>
                    <motion.button
                      onClick={() =>
                        setSelectedWeekIdx(Math.min(weekRanges.length - 1, effectiveWeekIdx + 1))
                      }
                      whileTap={tap}
                      disabled={effectiveWeekIdx === weekRanges.length - 1}
                      aria-label="Next week"
                      className="p-1.5 -m-1.5 text-fg-muted disabled:opacity-30"
                    >
                      <ChevronRight size={18} />
                    </motion.button>
                  </div>
                  <div className="flex items-end gap-2 h-20">
                    {weekDayScores.map((d, i) => {
                      const date = addDays(new Date(selectedWeek.start + "T00:00:00"), i);
                      const hasData = d !== null && d.total > 0;
                      return (
                        <div
                          key={i}
                          className="flex-1 flex flex-col items-center justify-end gap-1"
                        >
                          <div className="w-full h-14 rounded-md bg-surface-subtle flex items-end overflow-hidden">
                            {hasData && (
                              <div
                                className="w-full rounded-md"
                                style={{
                                  height: `${Math.max((d.score ?? 0) * 100, 6)}%`,
                                  backgroundColor: "#9ec06a",
                                }}
                                title={`${d.done}/${d.total}`}
                              />
                            )}
                          </div>
                          <p className="text-[10px] text-fg-faint">
                            {WEEKDAY_LABELS[date.getDay()]}
                          </p>
                          <p className="text-[10px] font-medium text-fg tabular-nums">
                            {date.getDate()}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Section>
            )}

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
            <Analysis text={summarizeHabits(habitRows, habitPoints, period)} />
            <div className="h-4" />
            <Section title={`Overall completion, last ${count} ${period}s`}>
              <div className="rounded-2xl bg-surface p-4">
                <MonthBars points={habitPoints} value={(p) => p.pct} format={(v) => `${v}%`} />
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
            <Analysis text={summarizeWorkouts(workoutPoints, woOverall.daysSince, period)} />
            <div className="h-4" />
            <Section title={`Sessions per ${period}, last ${count} ${period}s`}>
              <div className="rounded-2xl bg-surface p-4">
                <MonthBars points={workoutPoints} value={(p) => p.total} />
              </div>
            </Section>
            <Section title="Snapshot">
              <div className="grid grid-cols-3 gap-3">
                <Stat value={currentWorkoutPeriod?.total ?? 0} label={`this ${period}`} />
                <Stat value={prevWorkoutPeriod?.total ?? 0} label={`last ${period}`} />
                <Stat
                  value={woOverall.daysSince ?? "—"}
                  label={woOverall.daysSince === null ? "none yet" : "days since last"}
                />
              </div>
            </Section>
            <Section title={`This ${period} by type`}>
              {currentWorkoutPeriod && Object.keys(currentWorkoutPeriod.byType).length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(currentWorkoutPeriod.byType).map(([type, count]) => {
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
                <p className="text-sm text-fg-faint">No workouts completed this {period} yet.</p>
              )}
            </Section>
          </>
        )}

        {kind === "nutrition" && (
          <>
            <Analysis text={summarizeNutrition(nutritionPoints, CALORIE_GOAL, period)} />
            <div className="h-4" />
            <Section title={`Avg daily calories, last ${count} ${period}s`}>
              <div className="rounded-2xl bg-surface p-4">
                <MonthBars
                  points={nutritionPoints}
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
            <Section title={`This ${period}'s average macros`}>
              <div className="rounded-2xl bg-surface p-4 space-y-2.5">
                <MacroBar
                  label="Protein"
                  value={currentNutritionPeriod?.avg.protein ?? 0}
                  goal={MACRO_GOALS.protein}
                  color="#f87171"
                />
                <MacroBar
                  label="Carbs"
                  value={currentNutritionPeriod?.avg.carbs ?? 0}
                  goal={MACRO_GOALS.carbs}
                  color="#fbbf24"
                />
                <MacroBar
                  label="Fat"
                  value={currentNutritionPeriod?.avg.fat ?? 0}
                  goal={MACRO_GOALS.fat}
                  color="#60a5fa"
                />
              </div>
            </Section>
          </>
        )}

        {kind === "spending" && (
          <>
            <Analysis text={summarizeSpending(spendPoints, monthlyBudget, period)} />
            <div className="h-4" />
            <Section title={`Total per ${period}, last ${count} ${period}s`}>
              <div className="rounded-2xl bg-surface p-4">
                <MonthBars
                  points={spendPoints}
                  value={(p) => p.total}
                  format={(v) => money(v)}
                  goal={period === "month" ? monthlyBudget || undefined : undefined}
                />
              </div>
            </Section>
            <Section title={`This ${period} by category`}>
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
                  <p className="text-sm text-fg-faint">No spending logged this {period}.</p>
                )}
              </div>
            </Section>
            {currentSpendPeriod && (
              <Section title="Snapshot">
                <div className="grid grid-cols-2 gap-3">
                  <Stat value={money(currentSpendPeriod.total)} label={`this ${period}`} />
                  <Stat value={money(monthlyBudget)} label="monthly budget" />
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

// "Jul 14 – Jul 20" — the full Mon..Sun span, even for the current
// (still-in-progress) week, so it's clear which week you're looking at
// regardless of how much of it has actually happened yet.
function weekRangeLabel(week: PeriodRange): string {
  const monday = new Date(week.start + "T00:00:00");
  const sunday = addDays(monday, 6);
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${fmt(monday)} – ${fmt(sunday)}`;
}
