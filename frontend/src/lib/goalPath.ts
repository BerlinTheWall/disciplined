import { addDaysISO, getWeekDates, parseISODate, todayISODate, toISODate } from "./date";
import { currentPeriodKey, goalOverlapsPeriod, periodLabel, periodRange } from "./goalPeriods";
import { priorityRank } from "./goalPriority";
import { goalProgress } from "./goalProgress";
import type { Goal, GoalPeriod } from "@/types/goals";
import type { Task } from "@/types/task";

// What tapping a stop does: a day-stop (Week view) syncs the selected date;
// a coarser stop (Month/Year view) jumps the goals list itself to that
// sub-period, one zoom level in.
export type PeriodStopAction =
  { kind: "day"; date: string } | { kind: "period"; period: GoalPeriod; periodKey: string };

// One item shown inside a stop's card (PeriodOverview) — a goal for
// Month/Year stops, a task for Week's day-stops (days don't host Goal
// entities, so a day's own items are whatever's scheduled on it).
export interface PeriodStopItem {
  kind: "goal" | "task";
  id: string;
  title: string;
  done: boolean;
  fraction: number; // 0..1
  percent: number; // round(fraction * 100)
  sortKey: number; // priorityRank for goals; startMinutes for tasks — ascending
}

export interface PeriodStop {
  id: string;
  label: string;
  // Small-print detail next to the label — the calendar range a "Week N"
  // stop covers (Month view). Day-stops (Week view) and month-stops (Year
  // view) already say exactly what they are via their own label, so this
  // stays unset there.
  sublabel?: string;
  fraction: number; // 0..1, meaningless when !hasData
  hasData: boolean; // whether anything was actually tracked at this stop
  isToday: boolean;
  isFuture: boolean;
  action: PeriodStopAction;
  // Full sorted list of this stop's items — the UI caps to ~3 + "+N more".
  items: PeriodStopItem[];
}

const WEEKDAY_LABEL = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const MONTH_LABEL = new Intl.DateTimeFormat(undefined, { month: "short" });

function fractionOfTasks(tasks: Task[]): { fraction: number; hasData: boolean } {
  if (tasks.length === 0) return { fraction: 0, hasData: false };
  return { fraction: tasks.filter((t) => t.completed).length / tasks.length, hasData: true };
}

// Average of goalProgress().fraction across a set of goals — used for a
// stop's ring fill, which reads the *sibling* period's own goals (Week
// goals for a week-stop, Month goals for a month-stop) rather than trying
// to bucket a single goal's linked tasks by date. Deliberately broader than
// the card `items` set below (includes cascaded/coarser goals too) — the
// ring is a rough "how's this stop doing" signal, the card is specifically
// that stop's own goals.
function fractionOfGoals(
  matched: Goal[],
  allGoals: Goal[],
  tasks: Task[]
): { fraction: number; hasData: boolean } {
  if (matched.length === 0) return { fraction: 0, hasData: false };
  const sum = matched.reduce((s, g) => s + goalProgress(g, tasks, allGoals).fraction, 0);
  return { fraction: sum / matched.length, hasData: true };
}

// Maps goals to sorted PeriodStopItems (priority order, high first).
function goalItems(goals: Goal[], allGoals: Goal[], tasks: Task[]): PeriodStopItem[] {
  return goals
    .map((g) => {
      const p = goalProgress(g, tasks, allGoals);
      return {
        kind: "goal" as const,
        id: g.id,
        title: g.title,
        done: p.done,
        fraction: p.fraction,
        percent: p.percent,
        sortKey: priorityRank(g.priority),
      };
    })
    .sort((a, b) => a.sortKey - b.sortKey);
}

function buildWeekStops(activeKey: string, goals: Goal[], tasks: Task[]): PeriodStop[] {
  const today = todayISODate();
  const weekGoals = goals.filter((g) => g.period === "week" && g.periodKey === activeKey);
  // Union both goal-level and milestone-level linked tasks — a goal planned
  // through the AI wizard has its tasks attached to milestones
  // (linkTasksToMilestones), never to the goal's own linkedTaskIds, so
  // reading only the latter would make every AI-scheduled session invisible
  // here.
  const linkedTaskIds = new Set(
    weekGoals.flatMap((g) => [
      ...(g.linkedTaskIds ?? []),
      ...g.milestones.flatMap((m) => m.linkedTaskIds ?? []),
    ])
  );

  return Array.from({ length: 7 }, (_, i) => {
    const date = addDaysISO(activeKey, i);
    const dayTasks = tasks
      .filter((t) => t.date === date && linkedTaskIds.has(t.id))
      .sort((a, b) => a.startMinutes - b.startMinutes);
    const { fraction, hasData } = fractionOfTasks(dayTasks);
    const items: PeriodStopItem[] = dayTasks.map((t) => ({
      kind: "task",
      id: t.id,
      title: t.title,
      done: t.completed,
      fraction: t.completed ? 1 : 0,
      percent: t.completed ? 100 : 0,
      sortKey: t.startMinutes,
    }));
    const parsedDate = parseISODate(date);
    return {
      id: date,
      label: `${parsedDate.getDate()} ${WEEKDAY_LABEL.format(parsedDate)}`,
      fraction,
      hasData,
      isToday: date === today,
      isFuture: date > today,
      action: { kind: "day", date },
      items,
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
  const weekKeys = weeksInMonth(activeKey);
  const todayIndex = weekKeys.findIndex((wk) => wk <= today && today <= addDaysISO(wk, 6));
  const foldIndex = todayIndex >= 0 ? todayIndex : 0;
  // Goals filed directly under this month, or spanning into it from a
  // neighboring month (goalOverlapsPeriod, not a strict periodKey match) —
  // a 2-month goal starting last month is still just as much this month's
  // goal for however many of its weeks land here, the same reasoning
  // goalOverlapsPeriod's own doc comment gives one level up for Year.
  // Folded into whichever stop is "current" (or the first, if browsing a
  // past/future month) rather than getting their own section.
  const ownGoals = goals.filter(
    (g) => g.period === "month" && goalOverlapsPeriod(g, "month", activeKey)
  );

  return weekKeys.map((weekKey, i) => {
    const cascadeGoals = goals.filter((g) => goalOverlapsPeriod(g, "week", weekKey));
    const { fraction, hasData } = fractionOfGoals(cascadeGoals, goals, tasks);

    const sunday = addDaysISO(weekKey, 6);

    // Card items: narrower than the ring's cascade set — this week's own
    // native (or same-scale spanning) goals only, plus the fold above.
    const nativeGoals = goals.filter(
      (g) => g.period === "week" && goalOverlapsPeriod(g, "week", weekKey)
    );
    const chipGoals = i === foldIndex ? [...nativeGoals, ...ownGoals] : nativeGoals;
    const chipGoalIds = new Set(chipGoals.map((g) => g.id));

    // A coarser (month/year) goal cascades into every one of this month's
    // weeks (cascadeGoals, above) but only ever gets its own chip in the fold
    // week — so a goal with one task per week would otherwise only ever show
    // up in that single week's card, even though it genuinely has a session
    // in every other week too. Surface those actual per-week sessions here,
    // skipping goals already shown as their own chip this week so the same
    // goal doesn't appear twice in one card.
    const taskLinkedGoals = cascadeGoals.filter((g) => !chipGoalIds.has(g.id));
    const weekTaskIds = new Set(
      taskLinkedGoals.flatMap((g) => [
        ...(g.linkedTaskIds ?? []),
        ...g.milestones.flatMap((m) => m.linkedTaskIds ?? []),
      ])
    );
    const weekTasks = tasks
      .filter((t) => weekTaskIds.has(t.id) && t.date >= weekKey && t.date <= sunday)
      .sort((a, b) => a.startMinutes - b.startMinutes);
    const taskItems: PeriodStopItem[] = weekTasks.map((t) => ({
      kind: "task",
      id: t.id,
      title: t.title,
      done: t.completed,
      fraction: t.completed ? 1 : 0,
      percent: t.completed ? 100 : 0,
      sortKey: t.startMinutes,
    }));

    const items = [...goalItems(chipGoals, goals, tasks), ...taskItems];

    return {
      id: weekKey,
      label: `Week ${i + 1}`,
      sublabel: periodLabel("week", weekKey),
      fraction,
      hasData,
      isToday: weekKey <= today && today <= sunday,
      isFuture: weekKey > today,
      action: { kind: "period", period: "week", periodKey: weekKey },
      items,
    };
  });
}

function buildYearStops(activeKey: string, goals: Goal[], tasks: Task[]): PeriodStop[] {
  const todayMonthKey = currentPeriodKey("month");
  const todayYearKey = currentPeriodKey("year");
  const monthKeys = Array.from(
    { length: 12 },
    (_, i) => `${activeKey}-${String(i + 1).padStart(2, "0")}`
  );
  const todayIndex = activeKey === todayYearKey ? monthKeys.indexOf(todayMonthKey) : -1;
  const foldIndex = todayIndex >= 0 ? todayIndex : 0;
  // Goals filed directly under this year itself — same fold rule one level up.
  const ownGoals = goals.filter((g) => g.period === "year" && g.periodKey === activeKey);

  return monthKeys.map((monthKey, i) => {
    const cascadeGoals = goals.filter((g) => goalOverlapsPeriod(g, "month", monthKey));
    const { fraction, hasData } = fractionOfGoals(cascadeGoals, goals, tasks);

    const nativeGoals = goals.filter(
      (g) => g.period === "month" && goalOverlapsPeriod(g, "month", monthKey)
    );
    const chipGoals = i === foldIndex ? [...nativeGoals, ...ownGoals] : nativeGoals;
    const chipGoalIds = new Set(chipGoals.map((g) => g.id));

    // Same reasoning as buildMonthStops one level down: a year goal only
    // ever gets its own chip in the fold month, so surface its actually-
    // scheduled tasks under whichever month they're really on too.
    const { start: monthStart, end: monthEnd } = periodRange("month", monthKey);
    const monthStartISO = toISODate(monthStart);
    const monthEndISO = toISODate(monthEnd);
    const taskLinkedGoals = cascadeGoals.filter((g) => !chipGoalIds.has(g.id));
    const monthTaskIds = new Set(
      taskLinkedGoals.flatMap((g) => [
        ...(g.linkedTaskIds ?? []),
        ...g.milestones.flatMap((m) => m.linkedTaskIds ?? []),
      ])
    );
    const monthTasks = tasks
      .filter((t) => monthTaskIds.has(t.id) && t.date >= monthStartISO && t.date <= monthEndISO)
      .sort((a, b) => a.startMinutes - b.startMinutes);
    const taskItems: PeriodStopItem[] = monthTasks.map((t) => ({
      kind: "task",
      id: t.id,
      title: t.title,
      done: t.completed,
      fraction: t.completed ? 1 : 0,
      percent: t.completed ? 100 : 0,
      sortKey: t.startMinutes,
    }));

    const items = [...goalItems(chipGoals, goals, tasks), ...taskItems];

    return {
      id: monthKey,
      label: MONTH_LABEL.format(new Date(Number(activeKey), i, 1)),
      fraction,
      hasData,
      isToday: activeKey === todayYearKey && monthKey === todayMonthKey,
      isFuture: monthKey > todayMonthKey,
      action: { kind: "period", period: "month", periodKey: monthKey },
      items,
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
