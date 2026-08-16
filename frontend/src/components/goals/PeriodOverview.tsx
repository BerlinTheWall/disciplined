import { useLayoutEffect, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";

import { buildPeriodStops, type PeriodStop, type PeriodStopItem } from "@/lib/goalPath";
import { goalProgress } from "@/lib/goalProgress";
import { tap } from "@/lib/motion";
import { smoothPathDVertical, verticalPointsForHeights, type WavePoint } from "@/lib/pathGeometry";
import type { Goal, GoalPeriod } from "@/types/goals";
import type { Task } from "@/types/task";

const BASE_X = 20;
const AMPLITUDE = 0; // 0 = a straight rail; the wave drift lived here before
const WIDTH = 40;
const RAIL_GAP = 14; // space between the dot column and the card
const ITEM_CAP = 3;

// A stop's row claims only as much height as its own card actually needs —
// a quiet day with nothing on it stays compact, a day with a full 3 items
// gets more room, rather than every day reserving the same generous slot
// regardless of what's in it. Mirrors StopCard/ItemRow's own padding and
// row sizes, so the reserved slot and the rendered card agree.
const ROW_HEADER_H = 36; // card padding + the day-label row
const ROW_EMPTY_H = 20; // "Nothing here yet" placeholder row
const ROW_ITEM_H = 24; // one item row
const ROW_ITEM_GAP = 4; // gap between item rows
const ROW_MORE_H = 18; // "+N more" row, only when items exceed ITEM_CAP
const ROW_MARGIN = 8; // breathing room so the card doesn't touch its slot's edges

function stopRowHeight(itemCount: number): number {
  const shown = Math.min(itemCount, ITEM_CAP);
  const content = shown === 0 ? ROW_EMPTY_H : shown * ROW_ITEM_H + (shown - 1) * ROW_ITEM_GAP;
  const more = itemCount > ITEM_CAP ? ROW_MORE_H : 0;
  return ROW_HEADER_H + content + more + ROW_MARGIN;
}

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
  const rowHeights = useMemo(() => stops.map((s) => stopRowHeight(s.items.length)), [stops]);
  const points: WavePoint[] = useMemo(
    () => verticalPointsForHeights(rowHeights, BASE_X, AMPLITUDE),
    [rowHeights]
  );
  const pathD = useMemo(() => smoothPathDVertical(points), [points]);

  let travelEnd = -1;
  stops.forEach((s, i) => {
    if (!s.isFuture) travelEnd = i;
  });
  const travelledD = travelEnd > 0 ? smoothPathDVertical(points.slice(0, travelEnd + 1)) : "";

  const railHeight = rowHeights.reduce((sum, h) => sum + h, 0);

  // Land on "today" (or the closest stop to it) whenever this box opens or
  // the browsed period/instance changes — scoped to the box's own internal
  // scroll now, not the page (which no longer scrolls at all), so it can't
  // fight a page-level gesture the way the old page-scrolling version did.
  const scrollRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const todayIndex = stops.findIndex((s) => s.isToday);
    if (todayIndex < 0) {
      el.scrollTo({ top: 0, behavior: "auto" });
      return;
    }
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
    <div className="flex flex-col gap-3 flex-1 min-h-0">
      {period === "week" && weekGoals.length > 0 && (
        <div className="bg-surface rounded-2xl shadow-soft p-3 shrink-0 max-h-44 overflow-y-auto">
          {/* Capped and independently scrollable — a long list of week goals
              must never eat into the rail's own space below (that's the box
              meant to fill whatever's left and stay the one thing that
              scrolls to keep the page itself fixed-height). */}
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

      {/* The rail itself is the one thing that scrolls — bounded to
          whatever's left of the page's fixed height (see GoalsPage's own
          root), rather than growing the whole page taller as more stops or
          items pile up. Capped below that too (max-h), so it doesn't stretch
          to fill a tall screen just because the space is there. Outer box
          clips to the rounded shape; the actual scroller is the inner div so
          padding/rounding never look clipped mid-scroll. */}
      <div className="bg-surface rounded-2xl shadow-soft flex-1 min-h-0 max-h-90 overflow-hidden">
        <div ref={scrollRef} className="h-full overflow-y-auto p-3">
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
              {stops.map((stop, i) => (
                <div
                  key={stop.id}
                  style={{ height: rowHeights[i] }}
                  className="flex items-center pr-1"
                >
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
  const R = 11; // done/partial dot radius — bumped up from 9 so every day's
  // marker reads clearly against the rail, not just today's
  const circumference = 2 * Math.PI * R;
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
            r={16}
            fill="none"
            stroke={todayColor}
            strokeWidth={2}
          />
          <circle cx={x} cy={y} r={13} fill={todayColor} />
          <circle cx={x} cy={y} r={13} fill="none" stroke="var(--surface)" strokeWidth={2.5} />
        </>
      )}

      {state === "future" && (
        <circle
          cx={x}
          cy={y}
          r={9}
          fill="var(--surface)"
          stroke="var(--path-road)"
          strokeWidth={3}
        />
      )}

      {state === "empty" && (
        <circle
          cx={x}
          cy={y}
          r={8}
          fill="var(--surface-subtle)"
          stroke="var(--path-road)"
          strokeWidth={2}
        />
      )}

      {state === "done" && (
        <>
          <circle cx={x} cy={y} r={R} fill="var(--path-accent)" />
          <path
            d={`M${x - 5},${y} l3.5,3.5 l6.5,-7.5`}
            stroke="var(--surface)"
            strokeWidth={2.25}
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
            r={R}
            fill="var(--surface)"
            stroke="var(--path-road)"
            strokeWidth={3}
          />
          <circle
            cx={x}
            cy={y}
            r={R}
            fill="none"
            stroke="var(--path-accent)"
            strokeWidth={3}
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
      className={`flex-1 min-w-0 flex items-stretch gap-2 bg-surface-alt rounded-2xl p-2 ${
        past ? "opacity-70" : ""
      }`}
    >
      <span
        className="w-0.75 rounded-full shrink-0"
        style={{ backgroundColor: isToday ? "var(--path-today)" : "transparent" }}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-baseline gap-1.5 min-w-0">
            <button
              onClick={onActivateStop}
              className="text-[13px] font-extrabold uppercase tracking-wide text-fg shrink-0"
            >
              {stop.label}
            </button>
            {stop.sublabel && (
              <span className="text-[11px] font-medium text-fg-faint truncate">
                {stop.sublabel}
              </span>
            )}
          </div>
          {isToday && (
            <span className="flex items-center gap-1 text-[11px] font-medium text-fg-faint shrink-0">
              <span
                className="w-1 h-1 rounded-full"
                style={{ backgroundColor: "var(--path-today)" }}
              />
              Today
            </span>
          )}
        </div>

        {visible.length === 0 ? (
          <p className="text-xs text-fg-faint py-0.5">Nothing here yet</p>
        ) : (
          <div className="flex flex-col gap-1">
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
  const circumference = 2 * Math.PI * 9;
  return (
    <motion.button
      onClick={onOpen}
      whileTap={tap}
      className="w-full flex items-center gap-2 text-left"
    >
      {/* A task is always binary (done or not) — its fraction is only ever
          0 or 1, so a proportional ring never showed anything a plain
          checkbox couldn't. Goals genuinely have partial progress worth
          showing, so they keep the ring. */}
      {item.kind === "task" ? (
        <span
          className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${
            item.done ? "bg-fg border-fg text-fg-inverse" : "border-border-strong text-transparent"
          }`}
        >
          <Check size={11} strokeWidth={3.5} />
        </span>
      ) : (
        <div className="relative w-6 h-6 shrink-0">
          <svg width="24" height="24" className="-rotate-90">
            <circle
              cx="12"
              cy="12"
              r="9"
              fill="none"
              stroke="var(--surface-subtle)"
              strokeWidth="2.5"
            />
            <circle
              cx="12"
              cy="12"
              r="9"
              fill="none"
              stroke="var(--path-accent)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={item.done ? 0 : circumference * (1 - item.fraction)}
              style={{ transition: "stroke-dashoffset 0.6s ease" }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center text-[7px] font-extrabold tabular-nums">
            {item.done ? (
              <Check size={9} className="text-fg-muted" strokeWidth={3} />
            ) : (
              `${item.percent}%`
            )}
          </div>
        </div>
      )}
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
