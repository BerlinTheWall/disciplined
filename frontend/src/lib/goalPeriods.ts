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

// The date a goal's own run ends on — startDate plus durationCount (or 1,
// its implicit default when the user never set one explicitly) whole
// `period` units. Gives an AI scheduling pass a concrete window to work
// within even for the common case of no explicit duration.
export function goalEndDate(
  period: GoalPeriod,
  periodKey: string,
  startDate: string | null,
  durationCount: number | null
): string {
  const start = startDate
    ? parseISODate(startDate)
    : parseISODate(periodStartDate(period, periodKey));
  const n = durationCount ?? 1;
  const end = new Date(start);
  if (period === "week") {
    end.setDate(start.getDate() + n * 7 - 1);
  } else if (period === "month") {
    end.setMonth(start.getMonth() + n);
    end.setDate(end.getDate() - 1);
  } else {
    end.setFullYear(start.getFullYear() + n);
    end.setDate(end.getDate() - 1);
  }
  return toISODate(end);
}

// goalEndDate's inverse: given a start and a target end date the user
// actually picked (add-goal sheet's "End date" field), the whole-`period`
// durationCount that reproduces it — so the stored field stays a count of
// period units even though the UI lets someone pick a calendar date
// directly. Whole-months/-years counting (not calendar-day division)
// mirrors how goalEndDate itself advances by whole months/years, so picking
// the sheet's own default end date round-trips to the same durationCount
// it started from. Always at least 1 — a goal can't end before it starts.
export function durationCountFromEndDate(
  period: GoalPeriod,
  startDate: string,
  endDate: string
): number {
  const start = parseISODate(startDate);
  const end = parseISODate(endDate);
  if (end <= start) return 1;

  if (period === "week") {
    const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    return Math.max(1, Math.round(days / 7));
  }

  // goalEndDate computes end = (start + n period-units) - 1 day, so its
  // inverse target is end + 1 day — the whole-unit count from start to
  // there.
  const target = new Date(end);
  target.setDate(target.getDate() + 1);

  if (period === "month") {
    let months = (target.getFullYear() - start.getFullYear()) * 12 + (target.getMonth() - start.getMonth());
    if (target.getDate() < start.getDate()) months -= 1;
    return Math.max(1, months);
  }

  let years = target.getFullYear() - start.getFullYear();
  if (
    target.getMonth() < start.getMonth() ||
    (target.getMonth() === start.getMonth() && target.getDate() < start.getDate())
  ) {
    years -= 1;
  }
  return Math.max(1, years);
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

// Whether `goal` is "live" during some other period instance being viewed —
// true for the goal's own native period/key (trivially — its range always
// overlaps itself), for a coarser goal reaching into a finer view (a month
// goal is really just a four-week goal wearing a month label, so it's live
// in every one of that month's weeks), AND for a goal whose own real date
// range (startDate + goalEndDate, not just its nominal periodKey bucket)
// spills into another instance of the *same* scale — a 2-month goal
// starting in August is just as much a September goal for however many of
// its days land there. One-directional on the granularity axis only: a
// single week's goal never bleeds up into its whole month's view. ISO
// weeks don't align exactly to month boundaries, so a month's edge week
// can technically straddle into the next month — an accepted rounding
// case, not a bug.
export function goalOverlapsPeriod(
  goal: {
    period: GoalPeriod;
    periodKey: string;
    startDate: string | null;
    durationCount: number | null;
  },
  viewPeriod: GoalPeriod,
  viewKey: string
): boolean {
  if (PERIOD_GRANULARITY[goal.period] > PERIOD_GRANULARITY[viewPeriod]) return false;
  const start = goal.startDate
    ? parseISODate(goal.startDate)
    : parseISODate(periodStartDate(goal.period, goal.periodKey));
  const end = parseISODate(
    goalEndDate(goal.period, goal.periodKey, goal.startDate, goal.durationCount)
  );
  const view = periodRange(viewPeriod, viewKey);
  return start <= view.end && view.start <= end;
}
