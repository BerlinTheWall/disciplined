/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";

import Collapse from "@/components/Collapse";
import AchievementGoalCard from "@/components/goals/AchievementGoalCard";
import { buildPeriodStops, type PeriodStop, type PeriodStopItem } from "@/lib/goalPath";
import { periodLabel, relativePeriodName } from "@/lib/goalPeriods";
import { spring, tap } from "@/lib/motion";
import { smoothPathDVertical, verticalPointsForHeights, type WavePoint } from "@/lib/pathGeometry";
import { useTaskStore } from "@/store/taskStore";
import type { Goal, GoalPeriod } from "@/types/goals";
import type { Task } from "@/types/task";

const BASE_X = 20;
const AMPLITUDE = 0; // 0 = a straight rail; the wave drift lived here before
const WIDTH = 40;
const RAIL_GAP = 14; // space between the dot column and the card

// A stop's row claims only as much height as its own card actually needs —
// a quiet, unselected day stays compact, a selected day with a full item
// list gets more room, rather than every day reserving the same generous
// slot regardless of what's in it. Mirrors StopCard/ItemRow's own padding
// and row sizes, so the reserved slot and the rendered card agree.
const ROW_HEADER_H = 36; // card padding + the day-label row
const ROW_EMPTY_H = 20; // "Nothing here yet" placeholder row
const ROW_ITEM_H = 24; // one item row
const ROW_ITEM_GAP = 4; // gap between item rows
const ROW_MARGIN = 8; // breathing room so the card doesn't touch its slot's edges
const ROW_SUMMARY_H = 40; // an unselected stop with data — one line, not a full card
// An unselected, empty stop — just a quiet label, not "Nothing here yet".
// The smallest a row ever gets, so it also sets the rail's minimum gap
// between two consecutive dots (their y sits at the vertical center of
// their own row) — bumped up from 26 for a bit more breathing room between
// dots at their tightest, back-to-back-ghost-rows spacing.
const ROW_GHOST_H = 34;

// Which of three treatments a stop's row gets: the one currently selected
// (today, by default — see selectedStopId) earns a full itemized card;
// tapping a dot no longer jumps to that stop's own scope, it just expands
// it in place, deselecting whichever stop (today included) was expanded
// before. Every other stop with real activity collapses to a one-line
// summary; a stretch of empty future (or untracked past) days collapses
// further still, so the rail isn't a repeated wall of "Nothing here yet"
// cards.
type RowMode = "expanded" | "summary" | "ghost";

function rowMode(stop: PeriodStop, selected: boolean): RowMode {
  if (selected) return "expanded";
  return stop.hasData ? "summary" : "ghost";
}

// The selected stop shows every item uncapped — selecting it *is* the "show
// me everything" gesture (StopCard is only ever rendered for the selected
// stop, so there's never a "+N more" left to page through).
function stopRowHeight(stop: PeriodStop, selected: boolean): number {
  const mode = rowMode(stop, selected);
  if (mode === "ghost") return ROW_GHOST_H;
  if (mode === "summary") return ROW_SUMMARY_H;
  const count = stop.items.length;
  const content = count === 0 ? ROW_EMPTY_H : count * ROW_ITEM_H + (count - 1) * ROW_ITEM_GAP;
  return ROW_HEADER_H + content + ROW_MARGIN;
}

type NodeState = "today" | "future" | "done" | "partial";

// Nothing tracked (no tasks/goals at all) reads the same as everything
// tracked being done — there was nothing left undone either way — so both
// get the tick. Only a stop with something real still outstanding gets the
// distinct "partial" ring instead.
function nodeState(stop: PeriodStop): NodeState {
  if (stop.isToday) return "today";
  if (stop.isFuture) return "future";
  if (!stop.hasData || stop.fraction >= 1) return "done";
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
}) {
  const stops = useMemo(
    () => buildPeriodStops(period, activeKey, goals, tasks),
    [period, activeKey, goals, tasks]
  );
  // A density preference, not tied to whatever's being browsed — stays as
  // the user left it across period/tab switches, unlike selectedStopId below.
  const [goalsStripOpen, setGoalsStripOpen] = useState(true);
  // Which stop is expanded to its full itemized card via a tap on its own
  // dot/row — replaces the rail's old behavior of jumping straight into
  // that stop's own scope (a week's dot used to switch the page to Week
  // view on that week, etc.); now it just reveals what's inside right here
  // instead. Only one stop is ever expanded at a time — today starts out
  // selected by default (same as before this was selectable at all), but
  // picking a different stop deselects it rather than leaving both open.
  // Reset (back to today) whenever the browsed period/instance changes so a
  // selection never survives into an unrelated view.
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  useEffect(() => {
    setSelectedStopId(stops.find((s) => s.isToday)?.id ?? null);
    // Deliberately keyed on period/activeKey, not `stops` — a data edit
    // shouldn't yank the user's current selection back to today.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, activeKey]);

  const rowHeights = useMemo(
    () => stops.map((s) => stopRowHeight(s, s.id === selectedStopId)),
    [stops, selectedStopId]
  );
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

  // A dot/row tap toggles that stop's selection (see selectedStopId above)
  // instead of navigating anywhere. Day-stops (Week view) additionally still
  // sync the selected date, same as before — that's a separate, harmless
  // side effect (it never left the Goals page), not a scope jump.
  function handleActivate(stop: PeriodStop) {
    if (stop.action.kind === "day") onOpenDay(stop.action.date);
    setSelectedStopId((cur) => (cur === stop.id ? null : stop.id));
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
        // Same fill as the header's segmented-toggle tracks (bg-surface-toggle-track,
        // index.css) — a light neutral in light theme, a dark one in dark theme.
        <div className="bg-surface-toggle-track rounded-2xl shadow-soft p-3 shrink-0">
          <button
            onClick={() => setGoalsStripOpen((v) => !v)}
            aria-expanded={goalsStripOpen}
            className="flex w-full items-center justify-between gap-2 px-0.5"
          >
            <span className="text-[11px] font-extrabold uppercase tracking-wide text-fg-faint">
              {relativePeriodName(period, activeKey)
                ? `${relativePeriodName(period, activeKey)}'s goals`
                : `${periodLabel(period, activeKey)} goals`}
            </span>
            <motion.span
              animate={{ rotate: goalsStripOpen ? 180 : 0 }}
              transition={{ duration: 0.2 }}
              className="text-fg-faint shrink-0"
            >
              <ChevronDown size={15} />
            </motion.span>
          </button>
          <Collapse open={goalsStripOpen} outerClassName="mt-2" className="pb-0.5">
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
              className="flex gap-3 overflow-x-auto snap-x snap-mandatory"
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
          </Collapse>
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
                style={{ transition: "d 0.4s ease" }}
              />
              {travelledD && (
                <path
                  d={travelledD}
                  fill="none"
                  stroke="var(--path-accent)"
                  strokeWidth={5}
                  strokeLinecap="round"
                  style={{ transition: "d 0.4s ease" }}
                />
              )}
              {stops.map((stop, i) => (
                <PathDot
                  key={stop.id}
                  stop={stop}
                  x={points[i].x}
                  y={points[i].y}
                  selected={stop.id === selectedStopId}
                  onActivate={() => handleActivate(stop)}
                />
              ))}
            </svg>

            {/* Starts exactly at the card column (left: WIDTH+RAIL_GAP), not
              at x:0 with padding-left standing in for it — a w-full box
              padded over like that still occupies the dot column with its
              own (invisible but very much still hit-testable) padding area,
              which — being painted after the SVG — silently intercepted
              every tap meant for a dot underneath it. */}
            <div className="absolute top-0 right-0" style={{ left: WIDTH + RAIL_GAP }}>
              {stops.map((stop, i) => {
                const selected = stop.id === selectedStopId;
                const mode = rowMode(stop, selected);
                // A collapsed row (summary/ghost) is one uniform tap target —
                // the click lives on the row itself now, not a button hugging
                // just the label text, so the *entire* row's width and height
                // select it, same as its dot does. An expanded row (StopCard)
                // stays hands-off here since it hosts its own independent
                // controls (item checkboxes, the milestone label, etc.) that
                // must each keep their own click, not also toggle the row.
                const rowClickable = mode !== "expanded";
                return (
                  // Height animates as an explicit tween to the known target
                  // (rowHeights[i]) rather than framer-motion's generic
                  // `layout` FLIP measurement — layout's scale-compensation
                  // trick visibly squashes/stretches content when what's
                  // inside changes shape entirely (a card growing into an
                  // itemized list, say), which read as the "unsmooth" part.
                  // overflow-hidden keeps the taller/shorter content clipped
                  // to that height mid-transition instead of spilling out.
                  <motion.div
                    key={stop.id}
                    initial={false}
                    animate={{ height: rowHeights[i] }}
                    transition={spring.gentle}
                    style={{ overflow: "hidden", cursor: rowClickable ? "pointer" : undefined }}
                    className="flex items-center pr-1"
                    onClick={rowClickable ? () => handleActivate(stop) : undefined}
                    role={rowClickable ? "button" : undefined}
                    tabIndex={rowClickable ? 0 : undefined}
                    aria-label={rowClickable ? stop.label : undefined}
                    onKeyDown={
                      rowClickable
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              handleActivate(stop);
                            }
                          }
                        : undefined
                    }
                  >
                    {/* The row's own content (card vs. one-line summary vs.
                      ghost label) swaps entirely rather than just resizing —
                      cross-fades instead of popping straight from one to the
                      other, decoupled from (and layered under) the height
                      tween above. */}
                    <AnimatePresence mode="wait" initial={false}>
                      {mode === "expanded" ? (
                        <motion.div
                          key="expanded"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.15 }}
                          className="min-w-0 flex-1"
                        >
                          <StopCard
                            stop={stop}
                            onActivateStop={() => handleActivate(stop)}
                            onOpenItem={openItem}
                          />
                        </motion.div>
                      ) : mode === "summary" ? (
                        <motion.div
                          key="summary"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.15 }}
                          className="min-w-0 flex-1"
                        >
                          <StopSummaryRow stop={stop} />
                        </motion.div>
                      ) : (
                        <motion.div
                          key="ghost"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.15 }}
                          className="min-w-0 flex-1"
                        >
                          <StopGhostRow stop={stop} />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
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
function StopSummaryRow({ stop }: { stop: PeriodStop }) {
  const doneCount = stop.items.filter((it) => it.done).length;
  return (
    <div className="flex w-full min-w-0 items-baseline justify-between gap-2 px-2 py-1.5 rounded-xl">
      <span className="flex min-w-0 items-baseline gap-2">
        <span className="text-[12px] font-extrabold uppercase tracking-wide text-fg-faint shrink-0">
          {stop.label}
        </span>
        {stop.sublabel && (
          <span className="text-[11px] font-medium text-fg-faint truncate">{stop.sublabel}</span>
        )}
      </span>
      {stop.items.length > 0 && (
        <span className="text-[11.5px] text-fg-faint shrink-0">
          {doneCount} of {stop.items.length} done
        </span>
      )}
    </div>
  );
}

// An empty stop that isn't today — a quiet label only, no "Nothing here
// yet" boilerplate repeated down the whole rail.
function StopGhostRow({ stop }: { stop: PeriodStop }) {
  return (
    <div className="flex w-full min-w-0 items-baseline gap-2 px-2">
      <span className="text-[11px] font-semibold text-fg-faint shrink-0">{stop.label}</span>
      {stop.sublabel && (
        <span className="text-[10.5px] text-fg-faint truncate">{stop.sublabel}</span>
      )}
    </div>
  );
}

function PathDot({
  stop,
  x,
  y,
  selected,
  onActivate,
}: {
  stop: PeriodStop;
  x: number;
  y: number;
  // The expanded stop's own dot reads larger than the rest of the rail, so
  // it's obvious at a glance which one you're looking at without needing to
  // find the (also-expanded) card beside it.
  selected: boolean;
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

  // Inner shapes are all drawn relative to the dot's own origin (0,0); the
  // group itself is what's actually positioned and sized, via framer-motion's
  // x/y/scale (not raw SVG transform/attribute changes — those would fight
  // whileTap's own scale transform) so a stop expanding/collapsing, shifting
  // every dot below it, and being selected/deselected all animate smoothly
  // instead of snapping straight to the new layout.
  return (
    <motion.g
      initial={false}
      animate={{ x, y, scale: selected ? 1.25 : 1 }}
      transition={spring.gentle}
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
            cx={0}
            cy={0}
            r={16}
            fill="none"
            stroke={todayColor}
            strokeWidth={2}
          />
          <circle cx={0} cy={0} r={13} fill={todayColor} />
          <circle cx={0} cy={0} r={13} fill="none" stroke="var(--surface)" strokeWidth={2.5} />
        </>
      )}

      {state === "future" && (
        <circle
          cx={0}
          cy={0}
          r={9}
          fill="var(--surface)"
          stroke="var(--path-road)"
          strokeWidth={3}
        />
      )}

      {state === "done" && (
        <>
          <circle cx={0} cy={0} r={R} fill="var(--path-accent)" />
          <path
            d="M-5,0 l3.5,3.5 l6.5,-7.5"
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
            cx={0}
            cy={0}
            r={R}
            fill="var(--surface)"
            stroke="var(--path-road)"
            strokeWidth={3}
          />
          <circle
            cx={0}
            cy={0}
            r={R}
            fill="none"
            stroke="var(--path-accent)"
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray={`${stop.fraction * circumference} ${circumference}`}
            transform="rotate(-90)"
            style={{ transition: "stroke-dasharray 0.6s ease" }}
          />
        </>
      )}
    </motion.g>
  );
}

// Only ever rendered for the currently-selected stop (rowMode gates on
// exactly that), so it always shows every item, uncapped — no "+N more"
// left to page through once a stop is actually expanded.
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
  const past = !isToday && !stop.isFuture;

  return (
    <div
      className={`flex-1 min-w-0 flex items-stretch gap-2 bg-surface-alt rounded-2xl p-2 ${
        past ? "opacity-70" : ""
      }`}
    >
      <span
        className="w-0.75 rounded-full shrink-0"
        style={{ backgroundColor: isToday ? "var(--path-today)" : "var(--path-accent)" }}
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

        {stop.items.length === 0 ? (
          <p className="text-xs text-fg-faint py-0.5">Nothing here yet</p>
        ) : (
          <div className="flex flex-col gap-1">
            {stop.items.map((item) => (
              <ItemRow key={item.id} item={item} onOpen={() => onOpenItem(item)} />
            ))}
          </div>
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
