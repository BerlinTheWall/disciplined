import { addDays, getWeekDates, toISODate } from "./date";
import { getHabitStreak, isHabitActiveOnDate } from "./habits";
import type { Habit } from "@/types/habits";
import type { Task } from "@/types/task";

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

// ── Period-over-period comparisons (Profile detail views) ───────────────────
//
// Everything below powers the full-detail sheets behind each Profile card: a
// chart comparing the last several periods — week, month, or year, the user's
// choice — against each other, plus a short, locally-composed (not LLM)
// analysis sentence or two. Kept as pure functions over the same store data
// the compact Profile cards already use.

export type ComparePeriod = "week" | "month" | "year";

export interface PeriodRange {
  start: string;
  endISO: string; // clamped to `end` for the current, still-in-progress period
  label: string; // "Jul 14" (week) · "Jul" (month) · "2026" (year)
  key: string; // stable, sortable
}

// The last `count` periods ending on the period containing `end`, oldest
// first. Weeks are Monday-start, matching the rest of the app's week
// convention; the current, still-in-progress period is clamped so totals
// don't imply data for days that haven't happened yet.
export function lastPeriods(
  period: ComparePeriod,
  count: number,
  end: Date = new Date()
): PeriodRange[] {
  const out: PeriodRange[] = [];
  if (period === "week") {
    for (let i = count - 1; i >= 0; i--) {
      const monday = getWeekDates(addDays(end, -i * 7))[0];
      const sunday = addDays(monday, 6);
      const endDate = sunday > end ? end : sunday;
      out.push({
        start: toISODate(monday),
        endISO: toISODate(endDate),
        label: monday.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        key: toISODate(monday),
      });
    }
    return out;
  }
  if (period === "year") {
    for (let i = count - 1; i >= 0; i--) {
      const year = end.getFullYear() - i;
      const first = new Date(year, 0, 1);
      const last = new Date(year, 11, 31);
      const endDate = last > end ? end : last;
      out.push({
        start: toISODate(first),
        endISO: toISODate(endDate),
        label: String(year),
        key: String(year),
      });
    }
    return out;
  }
  for (let i = count - 1; i >= 0; i--) {
    const first = new Date(end.getFullYear(), end.getMonth() - i, 1);
    const last = new Date(end.getFullYear(), end.getMonth() - i + 1, 0);
    const endDate = last > end ? end : last;
    out.push({
      start: toISODate(first),
      endISO: toISODate(endDate),
      label: first.toLocaleDateString(undefined, { month: "short" }),
      key: `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, "0")}`,
    });
  }
  return out;
}

export interface PeriodPoint {
  key: string;
  label: string;
  done: number;
  total: number;
  pct: number; // 0..100; 0 when total is 0
}

function pointFrom(m: PeriodRange, done: number, total: number): PeriodPoint {
  return {
    key: m.key,
    label: m.label,
    done,
    total,
    pct: total ? Math.round((done / total) * 100) : 0,
  };
}

// Discipline score (tasks + habits combined) per period — the same metric as
// the heatmap, aggregated over the chosen granularity.
export function consistencyByPeriod(
  period: ComparePeriod,
  count: number,
  tasks: Task[],
  habits: Habit[],
  end: Date = new Date()
): PeriodPoint[] {
  return lastPeriods(period, count, end).map((m) => {
    let done = 0;
    let total = 0;
    let cursor = new Date(m.start + "T00:00:00");
    const last = new Date(m.endISO + "T00:00:00");
    while (cursor <= last) {
      const s = dayScore(toISODate(cursor), tasks, habits);
      done += s.done;
      total += s.total;
      cursor = addDays(cursor, 1);
    }
    return pointFrom(m, done, total);
  });
}

// Habits-only completion rate per period, aggregated across every habit — the
// habit-streak card's period-over-period trend.
export function habitConsistencyByPeriod(
  period: ComparePeriod,
  count: number,
  habits: Habit[],
  end: Date = new Date()
): PeriodPoint[] {
  return lastPeriods(period, count, end).map((m) => {
    let done = 0;
    let total = 0;
    let cursor = new Date(m.start + "T00:00:00");
    const last = new Date(m.endISO + "T00:00:00");
    while (cursor <= last) {
      const iso = toISODate(cursor);
      for (const h of habits) {
        if (!isHabitActiveOnDate(h, cursor)) continue;
        total++;
        if (h.completedDates.includes(iso)) done++;
      }
      cursor = addDays(cursor, 1);
    }
    return pointFrom(m, done, total);
  });
}

// A single habit's own monthly completion rate — used for its "this month vs
// last month" pair in the habit-streak detail list (always month-granularity,
// independent of the chart's period switcher).
export function habitMonthlyCompletion(
  habit: Habit,
  count: number,
  end: Date = new Date()
): PeriodPoint[] {
  return lastPeriods("month", count, end).map((m) => {
    let done = 0;
    let total = 0;
    let cursor = new Date(m.start + "T00:00:00");
    const last = new Date(m.endISO + "T00:00:00");
    while (cursor <= last) {
      if (isHabitActiveOnDate(habit, cursor)) {
        total++;
        if (habit.completedDates.includes(toISODate(cursor))) done++;
      }
      cursor = addDays(cursor, 1);
    }
    return pointFrom(m, done, total);
  });
}

// Average discipline by weekday over the last `days` days — "you're strongest
// on Wednesdays, weakest on Sundays" material for the consistency detail.
export interface WeekdayPoint {
  day: number; // 0 = Sunday
  pct: number;
  total: number;
}

export function weekdayBreakdown(
  days: number,
  tasks: Task[],
  habits: Habit[],
  end: Date = new Date()
): WeekdayPoint[] {
  const buckets = Array.from({ length: 7 }, () => ({ done: 0, total: 0 }));
  for (const s of recentScores(days, tasks, habits, end)) {
    const wd = new Date(s.date + "T00:00:00").getDay();
    buckets[wd].done += s.done;
    buckets[wd].total += s.total;
  }
  return buckets.map((b, day) => ({
    day,
    total: b.total,
    pct: b.total ? Math.round((b.done / b.total) * 100) : 0,
  }));
}

// ── Locally-composed analysis (no LLM — pure arithmetic phrased as prose) ────

export function summarizeConsistency(points: PeriodPoint[], period: ComparePeriod): string {
  const current = points[points.length - 1];
  const prev = points[points.length - 2];
  if (current.total === 0) {
    return `Nothing scheduled yet this ${period} — plan a few tasks or habits to start tracking your consistency.`;
  }
  const parts = [
    `You're completing ${current.pct}% of what you plan this ${period} (${current.done}/${current.total}).`,
  ];
  if (prev && prev.total > 0) {
    const delta = current.pct - prev.pct;
    if (Math.abs(delta) >= 3) {
      parts.push(
        delta > 0
          ? `That's up ${delta} points from ${prev.label} — solid improvement.`
          : `That's down ${Math.abs(delta)} points from ${prev.label} — worth tightening up.`
      );
    } else {
      parts.push(`That's about the same as ${prev.label}.`);
    }
  }
  const withData = points.filter((p) => p.total > 0);
  const best = withData.reduce((a, b) => (b.pct > a.pct ? b : a), withData[0]);
  if (best && best.key !== current.key) {
    parts.push(`Your best ${period} recently was ${best.label} at ${best.pct}%.`);
  }
  return parts.join(" ");
}

export function summarizeHabits(
  rows: HabitStat[],
  points: PeriodPoint[],
  period: ComparePeriod
): string {
  if (rows.length === 0) return "No habits set up yet — add one to start building a streak.";
  const current = points[points.length - 1];
  const prev = points[points.length - 2];
  const parts: string[] = [];
  if (current.total > 0) {
    parts.push(`Across all habits you're at ${current.pct}% this ${period}.`);
    if (prev && prev.total > 0) {
      const delta = current.pct - prev.pct;
      if (Math.abs(delta) >= 3) {
        parts.push(
          delta > 0
            ? `Up ${delta} points from ${prev.label}.`
            : `Down ${Math.abs(delta)} points from ${prev.label}.`
        );
      }
    }
  }
  const best = [...rows].sort((a, b) => b.rate7 - a.rate7)[0];
  const worst = [...rows].sort((a, b) => a.rate7 - b.rate7)[0];
  if (best) {
    parts.push(
      `${best.habit.title} is your strongest right now at ${Math.round(best.rate7 * 100)}% (current streak: ${best.current}).`
    );
  }
  if (worst && worst.habit.id !== best?.habit.id && worst.rate7 < 0.6) {
    parts.push(
      `${worst.habit.title} could use attention — only ${Math.round(worst.rate7 * 100)}% lately.`
    );
  }
  return parts.join(" ");
}
