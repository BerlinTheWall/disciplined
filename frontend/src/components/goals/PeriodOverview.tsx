import { useEffect, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";

import { buildPeriodStops, type PeriodStop, type PeriodStopItem } from "@/lib/goalPath";
import { goalProgress } from "@/lib/goalProgress";
import { tap } from "@/lib/motion";
import { smoothPathDVertical, waveLayoutVertical, type WavePoint } from "@/lib/pathGeometry";
import type { Goal, GoalPeriod } from "@/types/goals";
import type { Task } from "@/types/task";

const SPACING = 172; // tall enough for a ~3-item card
const MARGIN_Y = SPACING / 2; // keeps a stop's dot vertically centered on its row
const BASE_X = 20;
const AMPLITUDE = 6;
const WIDTH = 40;
const RAIL_GAP = 14; // space between the dot column and the card
const MAX_HEIGHT = 640;
const ITEM_CAP = 3;

type NodeState = "today" | "future" | "empty" | "done" | "partial";

function nodeState(stop: PeriodStop): NodeState {
  if (stop.isToday) return "today";
  if (stop.isFuture) return "future";
  if (!stop.hasData) return "empty";
  if (stop.fraction >= 1) return "done";
  return "partial";
}

// The merged path+card overview: a vertical winding rail of stops (today,
// upcoming days/weeks/months), each with its own top-items card laid out
// right beside it — replaces the old side-by-side PeriodPath + flat
// GoalRow list. Week view additionally gets a "this week's goals" strip
// above the rail (see the `weekGoals` prop) for goals that don't belong to
// any specific day.
export default function PeriodOverview({
  period,
  activeKey,
  goals,
  tasks,
  weekGoals,
  onOpenGoal,
  onOpenTask,
  onOpenDay,
  onJumpPeriod,
}: {
  period: GoalPeriod;
  activeKey: string;
  goals: Goal[];
  tasks: Task[];
  // Week view only: goals natively filed under this week itself, with no
  // day-card representation of their own (see PeriodStop's day items,
  // which are tasks only — days don't host Goal entities).
  weekGoals: Goal[];
  onOpenGoal: (goalId: string) => void;
  onOpenTask: (task: Task) => void;
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

  const railHeight = stops.length * SPACING;

  // Bring "today" into view whenever the period/instance being browsed
  // changes — same reasoning PeriodPath used: the rail can outgrow
  // MAX_HEIGHT (Year's 12 stops), so it scrolls internally instead of
  // pushing the rest of the page down.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const todayIndex = stops.findIndex((s) => s.isToday);
    if (todayIndex < 0) return;
    const target = Math.max(0, points[todayIndex].y - el.clientHeight / 2);
    el.scrollTo({ top: target, behavior: "auto" });
    // Only re-run when the browsed period/instance changes, not on every
    // goal/task edit — a data change shouldn't yank the user's scroll spot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, activeKey]);

  function handleActivate(stop: PeriodStop) {
    if (stop.action.kind === "day") onOpenDay(stop.action.date);
    else onJumpPeriod(stop.action.period, stop.action.periodKey);
  }

  function openItem(item: PeriodStopItem) {
    if (item.kind === "goal") {
      onOpenGoal(item.id);
      return;
    }
    const t = tasks.find((x) => x.id === item.id);
    if (t) onOpenTask(t);
  }

  return (
    <div className="flex flex-col gap-3">
      {period === "week" && weekGoals.length > 0 && (
        <div className="bg-surface rounded-2xl shadow-soft p-3">
          <p className="text-[11px] font-extrabold uppercase tracking-wide text-fg-faint mb-2 px-0.5">
            This week's goals
          </p>
          <div className="flex flex-col gap-1">
            {weekGoals.map((g) => (
              <ItemRow
                key={g.id}
                item={{
                  kind: "goal",
                  id: g.id,
                  title: g.title,
                  ...toRingProps(goalProgress(g, tasks, goals)),
                }}
                onOpen={() => onOpenGoal(g.id)}
              />
            ))}
          </div>
        </div>
      )}

      <div className="bg-surface rounded-2xl shadow-soft p-3">
        <div ref={scrollRef} style={{ maxHeight: MAX_HEIGHT }} className="overflow-y-auto">
          <div className="relative" style={{ height: railHeight }}>
            <svg
              width={WIDTH}
              height={railHeight}
              viewBox={`0 0 ${WIDTH} ${railHeight}`}
              className="absolute left-0 top-0"
              role="presentation"
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
                <PathDot
                  key={stop.id}
                  stop={stop}
                  x={points[i].x}
                  y={points[i].y}
                  onActivate={() => handleActivate(stop)}
                />
              ))}
            </svg>

            <div className="absolute left-0 top-0 w-full" style={{ paddingLeft: WIDTH + RAIL_GAP }}>
              {stops.map((stop) => (
                <div key={stop.id} style={{ height: SPACING }} className="flex items-center pr-1">
                  <StopCard
                    stop={stop}
                    onActivateStop={() => handleActivate(stop)}
                    onOpenItem={openItem}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function toRingProps(p: ReturnType<typeof goalProgress>) {
  return { done: p.done, fraction: p.fraction, percent: p.percent, sortKey: 0 };
}

function PathDot({
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
  const circumference = 2 * Math.PI * 9;
  // Only "today" gets the dedicated red accent — every other state keeps
  // the green used for progress everywhere else in Goals, so red reads
  // specifically as "you are here", not as more/less progress.
  const todayColor = "var(--path-today)";

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
            r={14}
            fill="none"
            stroke={todayColor}
            strokeWidth={1.5}
          />
          <circle cx={x} cy={y} r={11} fill={todayColor} />
          <circle cx={x} cy={y} r={11} fill="none" stroke="var(--surface)" strokeWidth={2} />
        </>
      )}

      {state === "future" && (
        <circle
          cx={x}
          cy={y}
          r={6.5}
          fill="var(--surface)"
          stroke="var(--path-road)"
          strokeWidth={2.5}
        />
      )}

      {state === "empty" && <circle cx={x} cy={y} r={4.5} fill="var(--surface-subtle)" />}

      {state === "done" && (
        <>
          <circle cx={x} cy={y} r={9} fill="var(--path-accent)" />
          <path
            d={`M${x - 4},${y} l3,3 l5.5,-6.5`}
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
            r={9}
            fill="var(--surface)"
            stroke="var(--path-road)"
            strokeWidth={2.5}
          />
          <circle
            cx={x}
            cy={y}
            r={9}
            fill="none"
            stroke="var(--path-accent)"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeDasharray={`${stop.fraction * circumference} ${circumference}`}
            transform={`rotate(-90 ${x} ${y})`}
            style={{ transition: "stroke-dasharray 0.6s ease" }}
          />
        </>
      )}
    </motion.g>
  );
}

function StopCard({
  stop,
  onActivateStop,
  onOpenItem,
}: {
  stop: PeriodStop;
  onActivateStop: () => void;
  onOpenItem: (item: PeriodStopItem) => void;
}) {
  const isToday = stop.isToday;
  const visible = stop.items.slice(0, ITEM_CAP);
  const hiddenCount = stop.items.length - visible.length;
  const past = !isToday && !stop.isFuture;

  return (
    <div
      className={`flex-1 min-w-0 flex items-stretch gap-2.5 bg-surface-alt rounded-2xl p-2.5 ${
        past ? "opacity-70" : ""
      }`}
    >
      <span
        className="w-0.75 rounded-full shrink-0"
        style={{ backgroundColor: isToday ? "var(--path-today)" : "transparent" }}
      />
      <div className="min-w-0 flex-1">
        <button
          onClick={onActivateStop}
          className="text-[11px] font-extrabold uppercase tracking-wide text-fg-faint mb-1.5 block"
        >
          {stop.label}
        </button>

        {visible.length === 0 ? (
          <p className="text-xs text-fg-faint py-1">Nothing here yet</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {visible.map((item) => (
              <ItemRow key={item.id} item={item} onOpen={() => onOpenItem(item)} />
            ))}
          </div>
        )}

        {hiddenCount > 0 && (
          <button onClick={onActivateStop} className="text-[11px] font-semibold text-fg-faint mt-1">
            +{hiddenCount} more
          </button>
        )}
      </div>
    </div>
  );
}

function ItemRow({ item, onOpen }: { item: PeriodStopItem; onOpen: () => void }) {
  const circumference = 2 * Math.PI * 11;
  return (
    <motion.button
      onClick={onOpen}
      whileTap={tap}
      className="w-full flex items-center gap-2 text-left"
    >
      <div className="relative w-7 h-7 shrink-0">
        <svg width="28" height="28" className="-rotate-90">
          <circle
            cx="14"
            cy="14"
            r="11"
            fill="none"
            stroke="var(--surface-subtle)"
            strokeWidth="3"
          />
          <circle
            cx="14"
            cy="14"
            r="11"
            fill="none"
            stroke="var(--path-accent)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={item.done ? 0 : circumference * (1 - item.fraction)}
            style={{ transition: "stroke-dashoffset 0.6s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-[8px] font-extrabold tabular-nums">
          {item.done ? (
            <Check size={10} className="text-fg-muted" strokeWidth={3} />
          ) : (
            `${item.percent}%`
          )}
        </div>
      </div>
      <span
        className={`flex-1 min-w-0 text-[13px] font-semibold truncate ${
          item.done ? "text-fg-faint line-through" : "text-fg"
        }`}
      >
        {item.title}
      </span>
    </motion.button>
  );
}
