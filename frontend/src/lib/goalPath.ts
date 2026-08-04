import { addDaysISO, getWeekDates, parseISODate, todayISODate, toISODate } from "./date";
import { currentPeriodKey } from "./goalPeriods";
import { goalProgress } from "./goalProgress";
import type { Goal, GoalPeriod } from "@/types/goals";
import type { Task } from "@/types/task";

// What tapping a stop does: a day-stop (Week view) jumps to that day in the
// schedule; a coarser stop (Month/Year view) jumps the goals list itself to
// that sub-period, one zoom level in.
export type PeriodStopAction =
  { kind: "day"; date: string } | { kind: "period"; period: GoalPeriod; periodKey: string };

export interface PeriodStop {
  id: string;
  label: string;
  fraction: number; // 0..1, meaningless when !hasData
  hasData: boolean; // whether anything was actually tracked at this stop
  isToday: boolean;
  isFuture: boolean;
  action: PeriodStopAction;
}

const WEEKDAY_LABEL = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const MONTH_LABEL = new Intl.DateTimeFormat(undefined, { month: "short" });

function fractionOfTasks(tasks: Task[]): { fraction: number; hasData: boolean } {
  if (tasks.length === 0) return { fraction: 0, hasData: false };
  return { fraction: tasks.filter((t) => t.completed).length / tasks.length, hasData: true };
}

// Average of goalProgress().fraction across a set of goals — used for
// Month/Year stops, which read the *sibling* period's own goals (Week goals
// for a week-stop, Month goals for a month-stop) rather than trying to
// bucket a single goal's linked tasks by date. No new schema needed: it's
// just reading what's already in the store, keyed by the existing
// periodKey convention.
function fractionOfGoals(
  matched: Goal[],
  allGoals: Goal[],
  tasks: Task[]
): { fraction: number; hasData: boolean } {
  if (matched.length === 0) return { fraction: 0, hasData: false };
  const sum = matched.reduce((s, g) => s + goalProgress(g, tasks, allGoals).fraction, 0);
  return { fraction: sum / matched.length, hasData: true };
}

function buildWeekStops(activeKey: string, goals: Goal[], tasks: Task[]): PeriodStop[] {
  const today = todayISODate();
  const weekGoals = goals.filter((g) => g.period === "week" && g.periodKey === activeKey);
  const linkedTaskIds = new Set(weekGoals.flatMap((g) => g.linkedTaskIds ?? []));

  return Array.from({ length: 7 }, (_, i) => {
    const date = addDaysISO(activeKey, i);
    const dayTasks = tasks.filter((t) => t.date === date && linkedTaskIds.has(t.id));
    const { fraction, hasData } = fractionOfTasks(dayTasks);
    return {
      id: date,
      label: WEEKDAY_LABEL.format(parseISODate(date)),
      fraction,
      hasData,
      isToday: date === today,
      isFuture: date > today,
      action: { kind: "day", date },
    };
  });
}

// Every Monday-anchored ISO week that overlaps the given month, in order —
// the same keys the Week tab itself uses, so a tap lands exactly where the
// Week tab would show that week.
function weeksInMonth(monthKey: string): string[] {
  const [y, m] = monthKey.split("-").map(Number);
  const lastOfMonth = new Date(y, m, 0);
  const keys: string[] = [];
  let monday = getWeekDates(new Date(y, m - 1, 1))[0];
  while (monday <= lastOfMonth) {
    keys.push(toISODate(monday));
    monday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 7);
  }
  return keys;
}

function buildMonthStops(activeKey: string, goals: Goal[], tasks: Task[]): PeriodStop[] {
  const today = todayISODate();
  return weeksInMonth(activeKey).map((weekKey, i) => {
    const weekGoals = goals.filter((g) => g.period === "week" && g.periodKey === weekKey);
    const { fraction, hasData } = fractionOfGoals(weekGoals, goals, tasks);
    const sunday = addDaysISO(weekKey, 6);
    return {
      id: weekKey,
      label: `W${i + 1}`,
      fraction,
      hasData,
      isToday: weekKey <= today && today <= sunday,
      isFuture: weekKey > today,
      action: { kind: "period", period: "week", periodKey: weekKey },
    };
  });
}

function buildYearStops(activeKey: string, goals: Goal[], tasks: Task[]): PeriodStop[] {
  const todayMonthKey = currentPeriodKey("month");
  const todayYearKey = currentPeriodKey("year");

  return Array.from({ length: 12 }, (_, i) => {
    const monthKey = `${activeKey}-${String(i + 1).padStart(2, "0")}`;
    const monthGoals = goals.filter((g) => g.period === "month" && g.periodKey === monthKey);
    const { fraction, hasData } = fractionOfGoals(monthGoals, goals, tasks);
    return {
      id: monthKey,
      label: MONTH_LABEL.format(new Date(Number(activeKey), i, 1)),
      fraction,
      hasData,
      isToday: activeKey === todayYearKey && monthKey === todayMonthKey,
      isFuture: monthKey > todayMonthKey,
      action: { kind: "period", period: "month", periodKey: monthKey },
    };
  });
}

export function buildPeriodStops(
  period: GoalPeriod,
  activeKey: string,
  goals: Goal[],
  tasks: Task[]
): PeriodStop[] {
  if (period === "week") return buildWeekStops(activeKey, goals, tasks);
  if (period === "month") return buildMonthStops(activeKey, goals, tasks);
  return buildYearStops(activeKey, goals, tasks);
}
