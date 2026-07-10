import { addDays, toISODate } from "./date";
import { dayNutrition, indexItems } from "./grocery";
import { getHabitStreak, isHabitActiveOnDate } from "./habits";
import type { Nutrition } from "./nutritions";
import type { Expense } from "@/types/expense";
import type { GroceryItem } from "@/types/grocery";
import type { Habit } from "@/types/habits";
import type { Meal } from "@/types/meal";
import type { Task } from "@/types/task";
import type { WorkoutSession, WorkoutType } from "@/types/workout";

// Pure aggregation helpers behind the Profile tracker. Everything here reads the
// existing store data (passed in) — no new persisted state, no store coupling —
// so the whole dashboard is a derived view over what the app already records.

// ── Discipline score ───────────────────────────────────────────────────────

export interface DayScore {
  date: string; // ISO date
  done: number;
  total: number;
  score: number | null; // 0..1, or null when nothing was scheduled that day
}

// A day's discipline = share of that day's commitments (scheduled tasks + active
// habit occurrences) that got completed. Days with nothing scheduled score null
// so the heatmap can render them as "no data" rather than a failed 0%.
export function dayScore(dateISO: string, tasks: Task[], habits: Habit[]): DayScore {
  const date = new Date(dateISO + "T00:00:00");

  const dayTasks = tasks.filter((t) => t.date === dateISO);
  const activeHabits = habits.filter((h) => isHabitActiveOnDate(h, date));

  const taskDone = dayTasks.filter((t) => t.completed).length;
  const habitDone = activeHabits.filter((h) => h.completedDates.includes(dateISO)).length;

  const done = taskDone + habitDone;
  const total = dayTasks.length + activeHabits.length;

  return { date: dateISO, done, total, score: total === 0 ? null : done / total };
}

// Last `days` day-scores, oldest first, ending on `end` (defaults to today).
export function recentScores(
  days: number,
  tasks: Task[],
  habits: Habit[],
  end: Date = new Date()
): DayScore[] {
  const out: DayScore[] = [];
  for (let i = days - 1; i >= 0; i--) {
    out.push(dayScore(toISODate(addDays(end, -i)), tasks, habits));
  }
  return out;
}

// A GitHub-style grid: `weeks` columns of 7 rows (Sun..Sat). The last column is
// the current, possibly partial week; future days in it come back as null cells.
export function heatmapWeeks(
  weeks: number,
  tasks: Task[],
  habits: Habit[],
  end: Date = new Date()
): (DayScore | null)[][] {
  const today = new Date(end);
  today.setHours(0, 0, 0, 0);
  // Sunday of the earliest week we want to show.
  const start = addDays(today, -(today.getDay() + (weeks - 1) * 7));
  const todayISO = toISODate(today);

  const cols: (DayScore | null)[][] = [];
  for (let w = 0; w < weeks; w++) {
    const col: (DayScore | null)[] = [];
    for (let d = 0; d < 7; d++) {
      const cur = addDays(start, w * 7 + d);
      const iso = toISODate(cur);
      col.push(iso > todayISO ? null : dayScore(iso, tasks, habits));
    }
    cols.push(col);
  }
  return cols;
}

// ── Habits ─────────────────────────────────────────────────────────────────

export interface HabitStat {
  habit: Habit;
  current: number; // current streak (via getHabitStreak semantics, recomputed here)
  longest: number; // best streak ever
  rate7: number; // 0..1 completion over the last 7 active occurrences window
}

// Longest run of consecutive active-and-completed days across the habit's life.
function longestStreak(habit: Habit): number {
  if (habit.completedDates.length === 0) return 0;
  const done = new Set(habit.completedDates);
  const dates = [...habit.completedDates].sort();
  let cursor = new Date(dates[0] + "T00:00:00");
  const last = new Date(dates[dates.length - 1] + "T00:00:00");

  let best = 0;
  let run = 0;
  while (cursor <= last) {
    if (isHabitActiveOnDate(habit, cursor)) {
      if (done.has(toISODate(cursor))) {
        run++;
        if (run > best) best = run;
      } else {
        run = 0;
      }
    }
    cursor = addDays(cursor, 1);
  }
  return best;
}

// Completion rate over the last `window` active occurrences of the habit.
function recentRate(habit: Habit, window: number, end: Date = new Date()): number {
  let cursor = new Date(end);
  cursor.setHours(0, 0, 0, 0);
  let active = 0;
  let done = 0;
  let guard = 0;
  while (active < window && guard++ < 3650) {
    if (isHabitActiveOnDate(habit, cursor)) {
      active++;
      if (habit.completedDates.includes(toISODate(cursor))) done++;
    }
    cursor = addDays(cursor, -1);
  }
  return active === 0 ? 0 : done / active;
}

export function habitStats(habits: Habit[], end: Date = new Date()): HabitStat[] {
  return habits
    .map((habit) => ({
      habit,
      current: getHabitStreak(habit, end),
      longest: longestStreak(habit),
      rate7: recentRate(habit, 7, end),
    }))
    .sort((a, b) => b.current - a.current);
}

// ── Workouts ───────────────────────────────────────────────────────────────

export interface WorkoutStats {
  total: number;
  byType: Partial<Record<WorkoutType, number>>;
  lastDate: string | null; // ISO date of the most recent completed workout
  daysSince: number | null; // whole days since that workout
}

// A workout counts as "done" when a completed schedule task links a session.
export function workoutStats(
  tasks: Task[],
  sessions: WorkoutSession[],
  startISO: string,
  endISO: string,
  today: Date = new Date()
): WorkoutStats {
  const typeById = new Map(sessions.map((s) => [s.id, s.type]));
  const done = tasks.filter(
    (t) => t.completed && t.workoutSessionId && t.date >= startISO && t.date <= endISO
  );

  const byType: Partial<Record<WorkoutType, number>> = {};
  for (const t of done) {
    const type = typeById.get(t.workoutSessionId!);
    if (type) byType[type] = (byType[type] ?? 0) + 1;
  }

  // Most recent completed workout across all history (not just the range).
  const anyDone = tasks
    .filter((t) => t.completed && t.workoutSessionId)
    .map((t) => t.date)
    .sort();
  const lastDate = anyDone.length ? anyDone[anyDone.length - 1] : null;

  let daysSince: number | null = null;
  if (lastDate) {
    const d0 = new Date(lastDate + "T00:00:00").getTime();
    const t0 = new Date(toISODate(today) + "T00:00:00").getTime();
    daysSince = Math.round((t0 - d0) / 86_400_000);
  }

  return { total: done.length, byType, lastDate, daysSince };
}

// ── Nutrition ──────────────────────────────────────────────────────────────

export interface DayNutrition {
  date: string;
  nutrition: Nutrition;
  logged: boolean; // whether any meal was recorded that day
}

export function recentNutrition(
  days: number,
  meals: Meal[],
  items: GroceryItem[],
  end: Date = new Date()
): DayNutrition[] {
  const index = indexItems(items);
  const out: DayNutrition[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const iso = toISODate(addDays(end, -i));
    const dayMeals = meals.filter((m) => m.date === iso);
    out.push({ date: iso, nutrition: dayNutrition(dayMeals, index), logged: dayMeals.length > 0 });
  }
  return out;
}

// Averages over the days that actually had meals logged (empty days would drag
// the mean toward zero and misrepresent typical intake).
export function averageNutrition(days: DayNutrition[]): { avg: Nutrition; loggedDays: number } {
  const logged = days.filter((d) => d.logged);
  const sum: Nutrition = { calories: 0, protein: 0, fat: 0, carbs: 0, sugar: 0, fiber: 0 };
  for (const d of logged) {
    sum.calories += d.nutrition.calories;
    sum.protein += d.nutrition.protein;
    sum.fat += d.nutrition.fat;
    sum.carbs += d.nutrition.carbs;
    sum.sugar += d.nutrition.sugar;
    sum.fiber += d.nutrition.fiber;
  }
  const n = logged.length || 1;
  return {
    loggedDays: logged.length,
    avg: {
      calories: Math.round(sum.calories / n),
      protein: Math.round(sum.protein / n),
      fat: Math.round(sum.fat / n),
      carbs: Math.round(sum.carbs / n),
      sugar: Math.round(sum.sugar / n),
      fiber: Math.round(sum.fiber / n),
    },
  };
}

// ── Expenses ───────────────────────────────────────────────────────────────

export interface SpendStats {
  total: number;
  byCategory: Record<string, number>;
}

export function spendInRange(expenses: Expense[], startISO: string, endISO: string): SpendStats {
  const inRange = expenses.filter((e) => e.date >= startISO && e.date <= endISO);
  const byCategory: Record<string, number> = {};
  let total = 0;
  for (const e of inRange) {
    total += e.amount;
    byCategory[e.category] = (byCategory[e.category] ?? 0) + e.amount;
  }
  return { total, byCategory };
}

// ── Range helpers ──────────────────────────────────────────────────────────

// First day of the current month, as ISO.
export function monthStartISO(end: Date = new Date()): string {
  return toISODate(new Date(end.getFullYear(), end.getMonth(), 1));
}

// First day of the previous month and its last day, as ISO.
export function prevMonthRangeISO(end: Date = new Date()): { start: string; endISO: string } {
  const first = new Date(end.getFullYear(), end.getMonth() - 1, 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 0);
  return { start: toISODate(first), endISO: toISODate(last) };
}
