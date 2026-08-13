import { getWeekDates, parseISODate, toISODate } from "./date";
import type { GoalPeriod } from "@/types/goals";

// Period-instance keys: week → the Monday's ISO date, month → "YYYY-MM",
// year → "YYYY". Stable, sortable, and trivial to shift.

export function periodKeyFor(period: GoalPeriod, date: Date): string {
  if (period === "week") return toISODate(getWeekDates(date)[0]);
  if (period === "month")
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  return String(date.getFullYear());
}

export function currentPeriodKey(period: GoalPeriod): string {
  return periodKeyFor(period, new Date());
}

// Inverse of periodKeyFor: the ISO date a period instance itself begins on
// (week's own Monday, month/year's first day). Used to default a new goal's
// start date to whatever period the user is browsing when they add it.
export function periodStartDate(period: GoalPeriod, key: string): string {
  if (period === "week") return key;
  if (period === "month") {
    const [y, m] = key.split("-").map(Number);
    return toISODate(new Date(y, m - 1, 1));
  }
  return toISODate(new Date(Number(key), 0, 1));
}

export function shiftPeriodKey(period: GoalPeriod, key: string, delta: number): string {
  if (period === "week") {
    const monday = parseISODate(key);
    monday.setDate(monday.getDate() + delta * 7);
    return toISODate(monday);
  }
  if (period === "month") {
    const [y, m] = key.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  return String(Number(key) + delta);
}

const MONTH_LABEL = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
const DAY_LABEL = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

// "Jul 14 – Jul 20", "July 2026", "2026".
export function periodLabel(period: GoalPeriod, key: string): string {
  if (period === "week") {
    const monday = parseISODate(key);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return `${DAY_LABEL.format(monday)} – ${DAY_LABEL.format(sunday)}`;
  }
  if (period === "month") {
    const [y, m] = key.split("-").map(Number);
    return MONTH_LABEL.format(new Date(y, m - 1, 1));
  }
  return key;
}

// "This week" / "This month" / "This year" when the key is the current one.
export function relativePeriodName(period: GoalPeriod, key: string): string | null {
  return key === currentPeriodKey(period) ? `This ${period}` : null;
}

const PERIOD_GRANULARITY: Record<GoalPeriod, number> = { year: 0, month: 1, week: 2 };

// A goal may only link another goal as a contributor if that goal's period
// is strictly more granular than its own (year -> month/week, month ->
// week, week -> none). Period nesting is a strict order, so this rule alone
// makes a link cycle structurally impossible — no cycle-detection needed.
export function canLinkGoalPeriod(parent: GoalPeriod, child: GoalPeriod): boolean {
  return PERIOD_GRANULARITY[child] > PERIOD_GRANULARITY[parent];
}

// The calendar span a period instance covers — a week's own Mon–Sun, a
// month's 1st to last day, a year's Jan 1–Dec 31.
export function periodRange(period: GoalPeriod, key: string): { start: Date; end: Date } {
  if (period === "week") {
    const start = parseISODate(key);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start, end };
  }
  if (period === "month") {
    const [y, m] = key.split("-").map(Number);
    return { start: new Date(y, m - 1, 1), end: new Date(y, m, 0) };
  }
  const y = Number(key);
  return { start: new Date(y, 0, 1), end: new Date(y, 11, 31) };
}

// A goal set at a coarser scale (a month goal, say) is still "live" during
// every finer period inside it (each of that month's weeks) — a monthly
// goal is really just a four-week goal wearing a month label. This decides
// whether `goal`'s own period/key should surface while browsing some other,
// finer `view` period/key, so it can cascade into that view instead of
// being invisible outside the one bucket it was filed under. One-directional
// on purpose: a single week's goal shouldn't clutter its whole month's
// view, only the reverse. ISO weeks don't align exactly to month
// boundaries, so a month's edge week can technically straddle into the
// next month — an accepted rounding case, not a bug.
export function goalCascadesInto(
  goalPeriod: GoalPeriod,
  goalKey: string,
  viewPeriod: GoalPeriod,
  viewKey: string
): boolean {
  if (PERIOD_GRANULARITY[goalPeriod] >= PERIOD_GRANULARITY[viewPeriod]) return false;
  const a = periodRange(goalPeriod, goalKey);
  const b = periodRange(viewPeriod, viewKey);
  return a.start <= b.end && b.start <= a.end;
}
