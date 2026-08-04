import { useEffect, useMemo, useRef } from "react";
import { motion } from "framer-motion";

import { buildPeriodStops, type PeriodStop } from "@/lib/goalPath";
import { tap } from "@/lib/motion";
import { smoothPathD, waveLayout, type WavePoint } from "@/lib/pathGeometry";
import type { Goal, GoalPeriod } from "@/types/goals";
import type { Task } from "@/types/task";

const SPACING = 60;
const BASE_Y = 62;
const AMPLITUDE = 18;
const MARGIN_X = 34;
const HEIGHT = 130;

type NodeState = "today" | "future" | "empty" | "done" | "partial";

function nodeState(stop: PeriodStop): NodeState {
  if (stop.isToday) return "today";
  if (stop.isFuture) return "future";
  if (!stop.hasData) return "empty";
  if (stop.fraction >= 1) return "done";
  return "partial";
}

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
  // Every stop is an exact anchor of the bezier curve built through it (see
  // pathGeometry.ts), so — unlike the old grid-with-rounded-corners layout —
  // nodes need no separate alignment pass to sit exactly on the line.
  const points: WavePoint[] = useMemo(
    () => waveLayout(stops.length, SPACING, BASE_Y, AMPLITUDE, MARGIN_X),
    [stops.length]
  );
  const pathD = useMemo(() => smoothPathD(points), [points]);

  let travelEnd = -1;
  stops.forEach((s, i) => {
    if (!s.isFuture) travelEnd = i;
  });
  // A prefix of the same points, run through the same curve-building
  // function, reproduces exactly the travelled portion of the full curve —
  // each segment only ever depends on its own two endpoints.
  const travelledD = travelEnd > 0 ? smoothPathD(points.slice(0, travelEnd + 1)) : "";

  const width = MARGIN_X * 2 + (stops.length - 1) * SPACING;

  // Longer periods (Month/Year) don't fit one screen width — land on
  // "today" rather than the start of the line.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    const todayIndex = stops.findIndex((s) => s.isToday);
    if (!el || todayIndex < 0) return;
    const targetX = points[todayIndex].x;
    el.scrollTo({ left: Math.max(0, targetX - el.clientWidth / 2), behavior: "auto" });
    // Only re-center on a genuine period/tab change, not on every progress
    // update — re-reading `points`/`stops` here would fight a user who's
    // deliberately scrolled elsewhere in the same period.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, activeKey]);

  function handleActivate(stop: PeriodStop) {
    if (stop.action.kind === "day") onOpenDay(stop.action.date);
    else onJumpPeriod(stop.action.period, stop.action.periodKey);
  }

  return (
    <div ref={scrollRef} className="bg-surface rounded-2xl shadow-soft py-6 px-4 overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${HEIGHT}`}
        width={width}
        height={HEIGHT}
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
            baseY={BASE_Y}
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
  baseY,
  onActivate,
}: {
  stop: PeriodStop;
  x: number;
  y: number;
  baseY: number;
  onActivate: () => void;
}) {
  const state = nodeState(stop);
  const circumference = 2 * Math.PI * 10;
  // A stop above the wave's centre reads as a "peak" — its label sits below
  // to stay clear of the curve arcing away above it, and vice versa.
  const labelBelow = y < baseY;
  const labelY = labelBelow ? y + 26 : y - 20;

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

      <text
        x={x}
        y={labelY}
        textAnchor="middle"
        fontSize={state === "today" ? 11 : 11.5}
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
    </motion.g>
  );
}
