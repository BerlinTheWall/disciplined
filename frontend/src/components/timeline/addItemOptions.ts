import { DAY_NAMES } from "@/lib/date";

// Shared vocabulary of the add/edit item form: the pickable palettes and the
// small pure formatters that describe a selection.

export const COLOR_OPTIONS = [
  "#34d399",
  "#fb7185",
  "#fb923c",
  "#fbbf24",
  "#a3e635",
  "#60a5fa",
  "#22d3ee",
  "#a78bfa",
  "#f472b6",
  "#f87171",
];

export const DURATION_OPTIONS = [15, 30, 45, 60, 90];

export const DAY_OPTIONS = [
  { label: "S", value: 0 },
  { label: "M", value: 1 },
  { label: "T", value: 2 },
  { label: "W", value: 3 },
  { label: "T", value: 4 },
  { label: "F", value: 5 },
  { label: "S", value: 6 },
];

export const MINUTES_PER_DAY = 1440;

// Labels in the duration track: bare minutes when idle ("30"), the unit only
// on the selected pill ("30min"), hours always spelled ("1h", "1.5h").
export function durationTrackLabel(d: number, selected: boolean) {
  if (d < 60) return selected ? `${d}min` : `${d}`;
  const h = d / 60;
  return `${h % 1 === 0 ? h : h.toFixed(1)}h`;
}

export function repeatSummary(days: number[]) {
  if (days.length === 7) return "Every day";
  if (days.length === 0) return "No days picked";
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 5 && sorted[0] === 1 && sorted[4] === 5) return "Weekdays";
  if (sorted.length === 2 && sorted[0] === 0 && sorted[1] === 6) return "Weekends";
  return sorted.map((d) => DAY_NAMES[d]).join(", ");
}

// The pill look for a selectable chip (reminder options, link pickers, …).
export function chipCls(selected: boolean) {
  return `px-3.5 py-2 rounded-full text-sm font-medium shrink-0 ${selected ? "bg-surface-inverse text-fg-inverse" : "bg-surface-raised text-fg-muted"}`;
}
