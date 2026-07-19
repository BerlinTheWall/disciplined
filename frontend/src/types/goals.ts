export type GoalPeriod = "week" | "month" | "year";

// A goal/intention for a specific week, month or year. Deliberately not a
// task: no date or time of day — either a simple check-off or a numeric
// progress target ("read 300 pages" → progress/target).
export interface Goal {
  id: string;
  period: GoalPeriod;
  // Which period instance it belongs to: week → the Monday's ISO date,
  // month → "2026-07", year → "2026".
  periodKey: string;
  title: string;
  done: boolean;
  // null = plain check-off goal; > 0 = progress goal.
  target: number | null;
  progress: number;
  createdAt: number;
}
