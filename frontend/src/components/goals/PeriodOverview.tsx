import { useLayoutEffect, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";

import AchievementGoalCard from "@/components/goals/AchievementGoalCard";
import { buildPeriodStops, type PeriodStop, type PeriodStopItem } from "@/lib/goalPath";
import { periodLabel, relativePeriodName } from "@/lib/goalPeriods";
import { tap } from "@/lib/motion";
import { smoothPathDVertical, verticalPointsForHeights, type WavePoint } from "@/lib/pathGeometry";
import { useTaskStore } from "@/store/taskStore";
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
const ROW_SUMMARY_H = 40; // a done/partial stop that isn't today — one line, not a full card
const ROW_GHOST_H = 26; // an empty stop that isn't today — just a quiet label, not "Nothing here yet"

// Which of three treatments a stop's row gets: today is the one place that
// still earns a full itemized card; every other stop with real activity
// collapses to a one-line summary; a stretch of empty future (or untracked
// past) days collapses further still, so the rail isn't a repeated wall of
// "Nothing here yet" cards.
type RowMode = "today" | "summary" | "ghost";

function rowMode(stop: PeriodStop): RowMode {
  if (stop.isToday) return "today";
  return stop.hasData ? "summary" : "ghost";
}

function stopRowHeight(stop: PeriodStop): number {
  const mode = rowMode(stop);
  if (mode === "ghost") return ROW_GHOST_H;
  if (mode === "summary") return ROW_SUMMARY_H;
  const shown = Math.min(stop.items.length, ITEM_CAP);
  const content = shown === 0 ? ROW_EMPTY_H : shown * ROW_ITEM_H + (shown - 1) * ROW_ITEM_GAP;
  const more = stop.items.length > ITEM_CAP ? ROW_MORE_H : 0;
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
// GoalRow list. A "this period's goals" strip sits above the rail (see the
// `periodGoals` prop) for the browsed period's own goals — the rail's stops
// index by day/week/month, so a goal doesn't otherwise get a slot of its
// own to sit in.
export default function PeriodOverview({
  period,
  activeKey,
  goals,
  tasks,
  periodGoals,
  onOpenGoal,
  onOpenTask,
  onOpenDay,
  onJumpPeriod,
}: {
  period: GoalPeriod;
  activeKey: string;
  goals: Goal[];
  tasks: Task[];
  // Goals native to the browsed period/instance, plus coarser or
  // date-overlapping ones cascading into it (GoalsPage's own `listed`) — the
  // strip's own card list, shown above the rail regardless of which of
  // Week/Month/Year is being browsed.
  periodGoals: Goal[];
  onOpenGoal: (goalId: string) => void;
  onOpenTask: (task: Task) => void;
  onOpenDay: (date: string) => void;
  onJumpPeriod: (period: GoalPeriod, periodKey: string) => void;
}) {
  const stops = useMemo(
    () => buildPeriodStops(period, activeKey, goals, tasks),
    [period, activeKey, goals, tasks]
  );
  const rowHeights = useMemo(() => stops.map(stopRowHeight), [stops]);
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
  // The box fills whatever's left of the page (flex-1 below), but never
  // more than its own content actually needs — a short Week view shouldn't
  // stretch into a tall empty card just because the screen has the room.
  // +24 is the scroller's own p-3 (12px top + 12px bottom).
  const railBoxMaxHeight = railHeight + 24;

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
      {periodGoals.length > 0 && (
        // bg-surface-feature-soft (index.css) — surface-feature's light/dark
        // adaptive sibling: a pale indigo tint in light theme, the same dark
        // fill as surface-feature itself in dark theme. Plain surface-feature
        // stays dark even in light mode (it's paired with hardcoded white
        // text everywhere else it's used), which read as a jarring black box
        // here against an otherwise light page.
        <div className="bg-surface-feature-soft rounded-2xl shadow-soft p-3 shrink-0">
          <p className="text-[11px] font-extrabold uppercase tracking-wide text-fg-faint mb-2 px-0.5">
            {relativePeriodName(period, activeKey)
              ? `${relativePeriodName(period, activeKey)}'s goals`
              : `${periodLabel(period, activeKey)} goals`}
          </p>
          {/* A horizontal slider, not a stacked list — this row sits above
              the rail (the page's real vertical scroller) so it must claim
              a fixed, compact height of its own rather than growing with
              however many goals the period has. Scrollbar hidden the same
              way every other horizontal slider in the app is (see e.g.
              WorkoutSessionSheet, RecipeSheet) — a bare native scrollbar
              reads as a broken widget, not a carousel. No edge-to-edge
              bleed trick here — it stays inside the box's own p-3 padding
              on both ends, same as every other side of the box. */}
          <div
            className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-0.5"
            style={{ scrollbarWidth: "none" }}
          >
            {periodGoals.map((g) => (
              <AchievementGoalCard
                key={g.id}
                goal={g}
                goals={goals}
                tasks={tasks}
                onOpen={() => onOpenGoal(g.id)}
                solo={periodGoals.length === 1}
              />
            ))}
          </div>
        </div>
      )}

      {/* The rail itself is the one thing that scrolls — bounded to
          whatever's left of the page's fixed height (see GoalsPage's own
          root) so more stops/items never grow the page, but also capped at
          railBoxMaxHeight so it doesn't stretch past its own content just
          because more space happens to be available. Outer box clips to the
          rounded shape; the actual scroller is the inner div so
          padding/rounding never look clipped mid-scroll. */}
      <div
        className="bg-surface rounded-2xl shadow-soft flex-1 min-h-0 overflow-hidden"
        style={{ maxHeight: railBoxMaxHeight }}
      >
        <div ref={scrollRef} className="h-full overflow-y-auto p-3">
          <div className="relative" style={{ height: railHeight }}>
            <svg
              width={WIDTH}
              height={railHeight}
              viewBox={`0 0 ${WIDTH} ${railHeight}`}
              className="absolute left-0 top-0 overflow-visible"
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
              {stops.map((stop, i) => {
                const mode = rowMode(stop);
                return (
                  <div
                    key={stop.id}
                    style={{ height: rowHeights[i] }}
                    className="flex items-center pr-1"
                  >
                    {mode === "today" ? (
                      <StopCard
                        stop={stop}
                        onActivateStop={() => handleActivate(stop)}
                        onOpenItem={openItem}
                      />
                    ) : mode === "summary" ? (
                      <StopSummaryRow stop={stop} onActivateStop={() => handleActivate(stop)} />
                    ) : (
                      <StopGhostRow stop={stop} onActivateStop={() => handleActivate(stop)} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// A done/partial stop that isn't today — one line, not a full itemized
// card. Reuses each item's own `done` flag (present for both task and goal
// items) so the same summary text works whether a stop's items are one
// day's tasks (Week view) or a week/month's goals (Month/Year view).
function StopSummaryRow({
  stop,
  onActivateStop,
}: {
  stop: PeriodStop;
  onActivateStop: () => void;
}) {
  const doneCount = stop.items.filter((it) => it.done).length;
  return (
    <button
      onClick={onActivateStop}
      className="flex-1 min-w-0 flex items-baseline gap-2 text-left px-2 py-1.5 rounded-xl"
    >
      <span className="text-[12px] font-extrabold uppercase tracking-wide text-fg-faint shrink-0">
        {stop.label}
      </span>
      {stop.sublabel && (
        <span className="text-[11px] font-medium text-fg-faint truncate">{stop.sublabel}</span>
      )}
      <span className="flex-1" />
      {stop.items.length > 0 && (
        <span className="text-[11.5px] text-fg-faint shrink-0">
          {doneCount} of {stop.items.length} done
        </span>
      )}
    </button>
  );
}

// An empty stop that isn't today — a quiet label only, no "Nothing here
// yet" boilerplate repeated down the whole rail.
function StopGhostRow({ stop, onActivateStop }: { stop: PeriodStop; onActivateStop: () => void }) {
  return (
    <button
      onClick={onActivateStop}
      className="flex-1 min-w-0 flex items-baseline gap-2 text-left px-2"
    >
      <span className="text-[11px] font-semibold text-fg-faint shrink-0">{stop.label}</span>
      {stop.sublabel && (
        <span className="text-[10.5px] text-fg-faint truncate">{stop.sublabel}</span>
      )}
    </button>
  );
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
    <div className="w-full flex items-center gap-2 text-left">
      {/* A task is always binary (done or not) — its fraction is only ever
          0 or 1, so a proportional ring never showed anything a plain
          checkbox couldn't. Goals genuinely have partial progress worth
          showing, so they keep the ring (tapping it opens the goal, same as
          the title — a goal has no single toggle of its own). A task's
          circle is its own button instead, checking it off right here
          without opening the task first; its outline doubles as a "which
          goal" tag (Week view only mixes tasks from several goals on the
          same day) — tinted with that goal's own accent when not done, so
          the done/not-done fill itself never gets muddied by which goal it
          happens to belong to. */}
      {item.kind === "task" ? (
        <motion.button
          onClick={() => useTaskStore.getState().toggleTaskCompleted(item.id)}
          whileTap={tap}
          aria-label={item.done ? "Mark task not done" : "Mark task done"}
          title={item.goalTitle}
          className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${
            item.done ? "bg-fg border-fg text-fg-inverse" : "text-transparent"
          }`}
          style={item.done ? undefined : { borderColor: item.goalAccent ?? "var(--border-strong)" }}
        >
          <Check size={11} strokeWidth={3.5} />
        </motion.button>
      ) : (
        <motion.button
          onClick={onOpen}
          whileTap={tap}
          aria-label={item.title}
          className="relative w-6 h-6 shrink-0"
        >
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
          <div className="absolute inset-0 flex items-center justify-center text-[6px] font-extrabold leading-none tabular-nums">
            {item.done ? (
              <Check size={9} className="text-fg-muted" strokeWidth={3} />
            ) : (
              `${item.percent}%`
            )}
          </div>
        </motion.button>
      )}
      <motion.button
        onClick={onOpen}
        whileTap={tap}
        className={`flex-1 min-w-0 text-left text-[13px] font-semibold truncate ${
          item.done ? "text-fg-faint line-through" : "text-fg"
        }`}
      >
        {item.title}
      </motion.button>
    </div>
  );
}
