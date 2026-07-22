import type { DayScore } from "@/lib/insights";

// Small chart primitives shared between the compact Profile cards and their
// full-detail sheets (ProfileDetailSheet). Pure presentation — all the actual
// numbers come from lib/insights.ts.

const ACCENT = "#9ec06a"; // the app's soft-green progress accent

export function Ring({ percent, size = 96 }: { percent: number; size?: number }) {
  const stroke = 10;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - percent / 100);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(128,128,128,0.18)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={ACCENT}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="text-2xl font-bold text-fg tabular-nums">{percent}</span>
        <span className="text-[11px] text-fg-faint mt-0.5">percent</span>
      </div>
    </div>
  );
}

// Faint track for empty/no-data cells; a green ramp for completion; a soft red
// for days where commitments existed but none were done.
function cellColor(cell: DayScore | null): string {
  if (!cell || cell.total === 0) return "rgba(128,128,128,0.12)";
  if (cell.score === 0) return "rgba(248,113,113,0.28)";
  const s = cell.score ?? 0;
  const alpha = 0.28 + s * 0.62; // 0.28 → 0.9
  return `rgba(158,192,106,${alpha.toFixed(2)})`;
}

// Sun..Sat — only Mon/Wed/Fri get a visible label (GitHub's convention) so
// the strip doesn't crowd the tiny 13px row height.
const WEEKDAY_SIDE_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];
const CELL = 13; // px, matches w-[13px] h-[13px] below

export function Heatmap({ weeks }: { weeks: (DayScore | null)[][] }) {
  // A month label above the column where that month first appears (its first
  // non-empty cell), so the grid reads as a timeline instead of bare blocks —
  // the same convention GitHub's contribution graph uses. Built via a single
  // self-contained reduce (rather than a `let` mutated across map callbacks)
  // so there's no variable reassigned after the render that computed it.
  const { labels: monthLabels } = weeks.reduce<{
    labels: (string | null)[];
    prevMonth: string | null;
  }>(
    (acc, col) => {
      const first = col.find((c): c is DayScore => c !== null);
      if (!first) {
        acc.labels.push(null);
        return acc;
      }
      const label = new Date(first.date + "T00:00:00").toLocaleDateString(undefined, {
        month: "short",
      });
      if (label === acc.prevMonth) {
        acc.labels.push(null);
      } else {
        acc.labels.push(label);
        acc.prevMonth = label;
      }
      return acc;
    },
    { labels: [], prevMonth: null }
  );

  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <div className="flex gap-1.5" style={{ width: "max-content" }}>
        {/* Weekday labels down the left, aligned to the cell rows below. */}
        <div className="flex flex-col gap-[3px] shrink-0">
          <div style={{ height: CELL }} />
          {WEEKDAY_SIDE_LABELS.map((label, i) => (
            <div key={i} className="flex items-center" style={{ height: CELL }}>
              <span className="text-[9px] leading-none text-fg-faint">{label}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-[3px]">
          {/* Month labels across the top, one slot per column. */}
          <div className="flex gap-[3px]" style={{ height: CELL }}>
            {monthLabels.map((label, ci) => (
              <div key={ci} className="relative shrink-0" style={{ width: CELL }}>
                {label && (
                  <span className="absolute left-0 top-0 whitespace-nowrap text-[9px] leading-none text-fg-faint">
                    {label}
                  </span>
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-[3px]">
            {weeks.map((col, ci) => (
              <div key={ci} className="flex flex-col gap-[3px]">
                {col.map((cell, ri) => (
                  <div
                    key={ri}
                    title={cell ? `${cell.date}: ${cell.done}/${cell.total}` : undefined}
                    className="w-[13px] h-[13px] rounded-[3px]"
                    style={{ backgroundColor: cellColor(cell) }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function CalorieBars({
  days,
  goal,
}: {
  days: { date: string; calories: number; logged: boolean }[];
  goal: number;
}) {
  const max = Math.max(goal, ...days.map((d) => d.calories), 1);
  return (
    <div className="relative">
      {/* goal line */}
      <div
        className="absolute left-0 right-0 border-t border-dashed border-fg-faint/50"
        style={{ bottom: `${(goal / max) * 88}px` }}
      />
      <div className="flex items-end gap-[3px] h-[88px]">
        {days.map((d) => {
          const h = d.logged ? Math.max((d.calories / max) * 88, 2) : 0;
          const over = d.calories > goal;
          return (
            <div key={d.date} className="flex-1 flex items-end" style={{ height: 88 }}>
              <div
                className="w-full rounded-t-[3px]"
                style={{
                  height: h,
                  backgroundColor: over ? "rgba(248,113,113,0.75)" : ACCENT,
                }}
                title={`${d.date}: ${d.calories} kcal`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function MacroBar({
  label,
  value,
  goal,
  color,
}: {
  label: string;
  value: number;
  goal: number;
  color: string;
}) {
  const pct = goal ? Math.min((value / goal) * 100, 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs text-fg-muted">{label}</span>
        <span className="text-xs font-medium text-fg tabular-nums">
          {value}
          <span className="text-fg-faint">/{goal}g</span>
        </span>
      </div>
      <div className="h-2 rounded-full bg-surface-subtle overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

export function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="rounded-2xl bg-surface-subtle px-3 py-3 text-center">
      <p className="text-xl font-bold text-fg tabular-nums leading-none">{value}</p>
      <p className="text-[11px] text-fg-faint mt-1">{label}</p>
    </div>
  );
}

// Period-over-period comparison bars: one bar per point, an optional dashed
// goal/reference line, and a value + label under each bar. Used by every
// Profile detail sheet. The highlighted bar defaults to the last (current)
// point; pass `selectedIndex` + `onSelect` to make bars tappable and drive
// the highlight from outside (the Consistency detail's week drill-down).
export function MonthBars<T extends { key: string; label: string }>({
  points,
  value,
  format = (v: number) => String(Math.round(v)),
  accent = ACCENT,
  goal,
  height = 120,
  selectedIndex,
  onSelect,
}: {
  points: T[];
  value: (p: T) => number;
  format?: (v: number) => string;
  accent?: string;
  goal?: number;
  height?: number;
  selectedIndex?: number;
  onSelect?: (index: number) => void;
}) {
  const values = points.map(value);
  const max = Math.max(goal ?? 0, ...values, 1);
  const highlightIdx = selectedIndex ?? points.length - 1;
  return (
    <div>
      <div className="relative" style={{ height }}>
        {goal !== undefined && (
          <div
            className="absolute left-0 right-0 border-t border-dashed border-fg-faint/50"
            style={{ bottom: (goal / max) * height }}
          />
        )}
        <div className="absolute inset-0 flex items-end gap-2">
          {points.map((p, i) => {
            const v = value(p);
            const isHighlighted = i === highlightIdx;
            const h = Math.max((v / max) * height, v > 0 ? 3 : 0);
            const bar = (
              <div
                className="w-full rounded-t-md"
                style={{ height: h, backgroundColor: isHighlighted ? accent : `${accent}55` }}
              />
            );
            return (
              <div key={p.key} className="flex-1 flex justify-center">
                {onSelect ? (
                  <button
                    onClick={() => onSelect(i)}
                    aria-label={`${p.label}: ${format(v)}`}
                    className="w-full h-full flex items-end justify-center"
                  >
                    {bar}
                  </button>
                ) : (
                  <div title={`${p.label}: ${format(v)}`} className="w-full h-full flex items-end">
                    {bar}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex gap-2 mt-2">
        {points.map((p, i) => {
          const isHighlighted = i === highlightIdx;
          return (
            <div key={p.key} className="flex-1 text-center">
              <p
                className={`text-[10px] font-medium tabular-nums ${isHighlighted ? "text-fg" : "text-fg-faint"}`}
              >
                {format(value(p))}
              </p>
              <p
                className={`text-[10px] mt-0.5 ${isHighlighted ? "font-bold text-fg" : "text-fg-faint"}`}
              >
                {p.label}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
