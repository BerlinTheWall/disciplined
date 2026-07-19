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
