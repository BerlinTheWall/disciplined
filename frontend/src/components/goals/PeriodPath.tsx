import { useMemo } from "react";
import { motion } from "framer-motion";

import { buildPeriodStops, type PeriodStop } from "@/lib/goalPath";
import { tap } from "@/lib/motion";
import { smoothPathDVertical, waveLayoutVertical, type WavePoint } from "@/lib/pathGeometry";
import type { Goal, GoalPeriod } from "@/types/goals";
import type { Task } from "@/types/task";

const SPACING = 58;
const BASE_X = 58;
const AMPLITUDE = 14;
const MARGIN_Y = 26;
const WIDTH = 100;
const LABEL_X = 6;

type NodeState = "today" | "future" | "empty" | "done" | "partial";

function nodeState(stop: PeriodStop): NodeState {
  if (stop.isToday) return "today";
  if (stop.isFuture) return "future";
  if (!stop.hasData) return "empty";
  if (stop.fraction >= 1) return "done";
  return "partial";
}

// A vertical rail of stops (today, upcoming days/weeks/months) running
// top-to-bottom beside the goal list — same data/drill-down behavior as
// before, just no longer trying to line up 1:1 against the goal rows next
// to it (goals aren't bound to a specific stop; the rail is its own
// independent timeline).
export default function PeriodPath({
  period,
  activeKey,
  goals,
  tasks,
  onOpenDay,
  onJumpPeriod,
}: {
  period: GoalPeriod;
  activeKey: string;
  goals: Goal[];
  tasks: Task[];
  onOpenDay: (date: string) => void;
  onJumpPeriod: (period: GoalPeriod, periodKey: string) => void;
}) {
  const stops = useMemo(
    () => buildPeriodStops(period, activeKey, goals, tasks),
    [period, activeKey, goals, tasks]
  );
  const points: WavePoint[] = useMemo(
    () => waveLayoutVertical(stops.length, SPACING, BASE_X, AMPLITUDE, MARGIN_Y),
    [stops.length]
  );
  const pathD = useMemo(() => smoothPathDVertical(points), [points]);

  let travelEnd = -1;
  stops.forEach((s, i) => {
    if (!s.isFuture) travelEnd = i;
  });
  const travelledD = travelEnd > 0 ? smoothPathDVertical(points.slice(0, travelEnd + 1)) : "";

  const height = MARGIN_Y * 2 + Math.max(0, stops.length - 1) * SPACING;

  function handleActivate(stop: PeriodStop) {
    if (stop.action.kind === "day") onOpenDay(stop.action.date);
    else onJumpPeriod(stop.action.period, stop.action.periodKey);
  }

  return (
    <div className="bg-surface rounded-2xl shadow-soft py-4 px-2 shrink-0">
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        width={WIDTH}
        height={height}
        role="group"
        aria-label={`${period} progress path`}
      >
        <path
          d={pathD}
          fill="none"
          stroke="var(--path-road)"
          strokeWidth={5}
          strokeLinecap="round"
        />
        {travelledD && (
          <path
            d={travelledD}
            fill="none"
            stroke="var(--path-accent)"
            strokeWidth={5}
            strokeLinecap="round"
          />
        )}

        {stops.map((stop, i) => (
          <PathNode
            key={stop.id}
            stop={stop}
            x={points[i].x}
            y={points[i].y}
            onActivate={() => handleActivate(stop)}
          />
        ))}
      </svg>
    </div>
  );
}

function PathNode({
  stop,
  x,
  y,
  onActivate,
}: {
  stop: PeriodStop;
  x: number;
  y: number;
  onActivate: () => void;
}) {
  const state = nodeState(stop);
  const circumference = 2 * Math.PI * 10;

  return (
    <motion.g
      whileTap={tap}
      style={{ transformBox: "fill-box", transformOrigin: "center", cursor: "pointer" }}
      onClick={onActivate}
      role="button"
      tabIndex={0}
      aria-label={stop.label}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onActivate();
        }
      }}
    >
      <text
        x={LABEL_X}
        y={y}
        dominantBaseline="middle"
        textAnchor="start"
        fontSize={state === "today" ? 10.5 : 10}
        fontWeight={state === "today" ? 800 : state === "done" || state === "partial" ? 700 : 500}
        fill={
          state === "today"
            ? "var(--path-ink)"
            : state === "future" || state === "empty"
              ? "var(--fg-faint)"
              : "var(--fg)"
        }
      >
        {state === "today" ? "TODAY" : stop.label}
      </text>

      {state === "today" && (
        <>
          <circle
            className="goal-path-pulse"
            cx={x}
            cy={y}
            r={15}
            fill="none"
            stroke="var(--path-accent)"
            strokeWidth={1.5}
          />
          <circle cx={x} cy={y} r={12} fill="var(--path-accent)" />
          <circle cx={x} cy={y} r={12} fill="none" stroke="var(--surface)" strokeWidth={2} />
        </>
      )}

      {state === "future" && (
        <circle
          cx={x}
          cy={y}
          r={7}
          fill="var(--surface)"
          stroke="var(--path-road)"
          strokeWidth={2.5}
        />
      )}

      {state === "empty" && <circle cx={x} cy={y} r={5} fill="var(--surface-subtle)" />}

      {state === "done" && (
        <>
          <circle cx={x} cy={y} r={10} fill="var(--path-accent)" />
          <path
            d={`M${x - 4.5},${y} l3.5,3.5 l6,-7`}
            stroke="var(--surface)"
            strokeWidth={2}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}

      {state === "partial" && (
        <>
          <circle
            cx={x}
            cy={y}
            r={10}
            fill="var(--surface)"
            stroke="var(--path-road)"
            strokeWidth={2.5}
          />
          <circle
            cx={x}
            cy={y}
            r={10}
            fill="none"
            stroke="var(--path-accent)"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeDasharray={`${stop.fraction * circumference} ${circumference}`}
            transform={`rotate(-90 ${x} ${y})`}
          />
        </>
      )}
    </motion.g>
  );
}
