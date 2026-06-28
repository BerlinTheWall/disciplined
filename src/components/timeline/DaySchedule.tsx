import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { AnimatePresence } from "framer-motion";
import { useTaskStore } from "../../store/taskStore";
import { useHabitStore } from "../../store/habitStore";
import { isHabitActiveOnDate, getHabitStreak } from "../../lib/habits";
import {
  minutesToPx,
  getPillHeight,
  computeCompressedLayout,
} from "../../lib/time";
import ScheduleRow, {
  MIN_ROW_HEIGHT,
  type ScheduleRowData,
} from "./ScheduleRow";
import DoneTray from "./DoneTray";
import { Plus } from "lucide-react";
import type { EditItem } from "./Timeline";

const ICON_CENTER_X = 68;
const DEFAULT_START_MINUTES = 6 * 60;

// Scale applied to a completed task's icon (must match ScheduleRow's animation).
// Used to clip connectors at the icon's actual, scaled-down edge.
const COMPLETED_ICON_SCALE = 0.9;

// Approximate height of a row's text block (title + time). A pill is centered in
// a flex row whose height is max(pillHeight, this), so a pill shorter than the
// text gets pushed down by half the difference — that's where its true center
// sits. Taller (oval) pills define the row height themselves and aren't shifted.
const PILL_CONTENT_HEIGHT = 54;

// Vertical offset of a pill's true center from layout.topYById, caused by the
// flex row centering the pill against the (possibly taller) text block.
const pillCenterShift = (durationMinutes: number) =>
  Math.max(0, (PILL_CONTENT_HEIGHT - getPillHeight(durationMinutes)) / 2);

// Opacity the connector fades to at a completed task's end (it ramps back to
// full toward the other, incomplete end).
const DONE_LINE_OPACITY = 0.3;

// Extra empty space below the last item so the daily view can scroll a bit past
// the end of the schedule.
const BOTTOM_SCROLL_SPACE = 90;

// Where the focused "now" item lands in the viewport on open: a fraction of the
// way down from the top (slightly above center so upcoming items stay visible).
const FOCUS_VIEWPORT_RATIO = 0.3;

// Local YYYY-MM-DD for the given date (matches how selectedDate is stored).
function localDateString(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Picks the item the user should be on "right now": the one whose time span
// contains nowMinutes (most recently started wins when several overlap, so a
// short task nested in a long one takes precedence); otherwise the next upcoming
// item; otherwise the last item of the day.
function findCurrentItemId(
  items: ScheduleRowData[],
  nowMinutes: number,
): string | null {
  if (!items.length) return null;

  let current: ScheduleRowData | null = null;
  let upcoming: ScheduleRowData | null = null;
  for (const item of items) {
    const end = item.startMinutes + item.durationMinutes;
    if (nowMinutes >= item.startMinutes && nowMinutes < end) {
      // items are start-sorted, so the last match has the latest start.
      current = item;
    } else if (item.startMinutes > nowMinutes && !upcoming) {
      upcoming = item;
    }
  }

  return (current ?? upcoming ?? items[items.length - 1]).id;
}

// The item whose span strictly contains nowMinutes (latest start wins when
// several overlap), or null if now falls in a gap. Used for the "happening now"
// row highlight — unlike findCurrentItemId, it has no upcoming/last fallback.
function findActiveItemId(
  items: ScheduleRowData[],
  nowMinutes: number,
): string | null {
  let active: ScheduleRowData | null = null;
  for (const item of items) {
    const end = item.startMinutes + item.durationMinutes;
    if (nowMinutes >= item.startMinutes && nowMinutes < end) active = item;
  }
  return active?.id ?? null;
}

// Linear blend between two hex colors at position t (0 = a, 1 = b). Used to pick
// the exact color at the gradient's transition stops so the color ramp stays
// perfectly linear while we fade the opacity across the middle.
function lerpHex(a: string, b: string, t: number) {
  const parse = (h: string) => {
    const c = h.replace("#", "");
    return [
      parseInt(c.slice(0, 2), 16),
      parseInt(c.slice(2, 4), 16),
      parseInt(c.slice(4, 6), 16),
    ];
  };
  const [r1, g1, b1] = parse(a);
  const [r2, g2, b2] = parse(b);
  const mix = (x: number, y: number) => Math.round(x + (y - x) * t);
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(mix(r1, r2))}${toHex(mix(g1, g2))}${toHex(mix(b1, b2))}`;
}

interface LineStop {
  offset: number; // 0..1 along the connector
  color: string;
  opacity: number;
}

// Builds the gradient stops for a connector between two icon centers.
// The connector runs center-to-center, so each end passes under its icon's
// pill. The stretch under each icon is always clipped away with a hard cut so
// the line stops exactly at the icon's edge — even for incomplete items, where
// the opaque icon would cover it anyway. Clipping unconditionally avoids a flash
// of the under-icon line while an icon animates back to full size on uncheck.
// On top of the cut, a completed end emerges at a faded opacity that ramps back
// to full toward the other (incomplete) end.
function buildLineStops(
  lineH: number,
  rTop: number,
  rBottom: number,
  topColor: string,
  bottomColor: string,
  topDone: boolean,
  bottomDone: boolean,
): LineStop[] {
  const topEdge = Math.min(Math.max(rTop, 0), lineH);
  const bottomEdge = Math.max(Math.min(lineH - rBottom, lineH), 0);
  const topEdgeT = lineH ? topEdge / lineH : 0;
  const bottomEdgeT = lineH ? bottomEdge / lineH : 1;

  // Opacity ramp along the line: faded at a completed end, full elsewhere, with
  // the transition spread across the middle (25%–75%) so it stays gentle.
  const fadeTop = topDone ? DONE_LINE_OPACITY : 1;
  const fadeBottom = bottomDone ? DONE_LINE_OPACITY : 1;
  const fadeAt = (t: number) => {
    if (t <= 0.25) return fadeTop;
    if (t >= 0.75) return fadeBottom;
    return fadeTop + (fadeBottom - fadeTop) * ((t - 0.25) / 0.5);
  };

  const stops: LineStop[] = [];
  const push = (t: number, opacity: number) =>
    stops.push({ offset: t, color: lerpHex(topColor, bottomColor, t), opacity });

  // Top end: always clip to invisible under the icon, then jump to the (possibly
  // faded) value at the icon's edge.
  push(0, 0);
  push(topEdgeT, 0);
  push(topEdgeT, fadeAt(topEdgeT));

  // Middle ramp anchors, only where they fall within the visible stretch.
  for (const m of [0.25, 0.75]) {
    if (m > topEdgeT && m < bottomEdgeT) push(m, fadeAt(m));
  }

  // Bottom end: ramp into the value at the icon's edge, then hard cut to invisible.
  push(bottomEdgeT, fadeAt(bottomEdgeT));
  push(bottomEdgeT, 0);
  push(1, 0);

  return stops;
}

interface DayScheduleProps {
  date: string; // ISO date this panel shows
  active: boolean; // center panel — only it auto-scrolls to "now"
  onEdit: (item: EditItem) => void;
}

export default function DaySchedule({ date, active, onEdit }: DayScheduleProps) {
  const tasks = useTaskStore((s) => s.tasks);
  const toggleTaskCompleted = useTaskStore((s) => s.toggleTaskCompleted);

  const habits = useHabitStore((s) => s.habits);
  const toggleHabitCompleted = useHabitStore((s) => s.toggleHabitCompleted);

  const dateObj = new Date(date + "T00:00:00");

  const taskItems: ScheduleRowData[] = tasks.filter((t) => t.date === date);

  const habitItems: ScheduleRowData[] = habits
    .filter((h) => isHabitActiveOnDate(h, dateObj))
    .map((h) => ({
      id: h.id,
      title: h.title,
      startMinutes: h.startMinutes,
      durationMinutes: h.durationMinutes,
      color: h.color,
      icon: h.icon,
      completed: h.completedDates.includes(date),
      streak: getHabitStreak(h, dateObj),
    }));

  const items = [...taskItems, ...habitItems].sort(
    (a, b) => a.startMinutes - b.startMinutes,
  );

  // Completed items leave the timeline and collapse into the Done tray below, so
  // the schedule only lays out (and draws connectors between) what's still to do.
  const activeItems = items.filter((i) => !i.completed);
  const doneItems = items.filter((i) => i.completed);

  const layout = computeCompressedLayout(activeItems, (item) =>
    Math.max(minutesToPx(item.durationMinutes), MIN_ROW_HEIGHT),
  );

  // Items that take part in any overlap — used to tint their time labels.
  const overlapIds = new Set<string>();
  for (const o of layout.overlaps) {
    overlapIds.add(o.afterId);
    overlapIds.add(o.beforeId);
  }

  // Live clock so the "happening now" highlight follows real time and hops to
  // the next task as the day progresses (only matters when viewing today).
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  const currentItemId =
    date === localDateString(now)
      ? findActiveItemId(activeItems, now.getHours() * 60 + now.getMinutes())
      : null;

  const earliestItem = activeItems[0];
  const startOffset = earliestItem
    ? earliestItem.startMinutes
    : DEFAULT_START_MINUTES;

  const containerHeight = activeItems.length
    ? Math.max(
        ...activeItems.map(
          (item) =>
            layout.topYById[item.id] +
            Math.max(minutesToPx(item.durationMinutes), MIN_ROW_HEIGHT),
        ),
      )
    : 0;

  // On open, scroll the schedule so the task happening right now (per the real
  // clock) is in view. Only the active (center) panel, and only when today is
  // its day; other days stay at the top.
  const containerRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!active) return;
    const now = new Date();
    if (date !== localDateString(now)) return;

    const focusId = findCurrentItemId(activeItems, now.getHours() * 60 + now.getMinutes());
    const root = containerRef.current;
    if (!focusId || !root) return;

    const scroller = root.closest("[data-scroll-lock]") as HTMLElement | null;
    const target = root.querySelector(
      `[data-item-id="${focusId}"]`,
    ) as HTMLElement | null;
    if (!scroller || !target) return;

    const targetRect = target.getBoundingClientRect();
    const scrollerRect = scroller.getBoundingClientRect();
    const delta =
      targetRect.top -
      scrollerRect.top -
      scroller.clientHeight * FOCUS_VIEWPORT_RATIO;
    scroller.scrollTop += delta; // scrollTop self-clamps to the valid range
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, active]);

  function handleEdit(id: string) {
    const task = tasks.find((t) => t.id === id);
    if (task) {
      onEdit({ type: "task", data: task });
      return;
    }
    const habit = habits.find((h) => h.id === id);
    if (habit) onEdit({ type: "habit", data: habit });
  }

  function handleToggle(id: string) {
    if (tasks.some((t) => t.id === id)) toggleTaskCompleted(id);
    else toggleHabitCompleted(id, date);
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <div className="w-14 h-14 rounded-full bg-surface-raised flex items-center justify-center">
          <Plus size={24} className="text-fg-faint" />
        </div>
        <p className="text-base font-medium text-fg">Nothing scheduled</p>
        <p className="text-sm text-fg-faint text-center">
          Tap the + button to add a task or habit for this day.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Always mounted (even when empty) so the last task's exit animation
          still plays — unmounting AnimatePresence would skip it. */}
      <div ref={containerRef} className="relative" style={{ height: containerHeight }}>
        {/* Gradient connector lines between items */}
        {activeItems.slice(0, -1).map((item, i) => {
          const next = activeItems[i + 1];
          const gap = layout.gaps.find(
            (g) => g.afterId === item.id && g.beforeId === next.id,
          );
          const overlap = layout.overlaps.find(
            (o) => o.afterId === item.id && o.beforeId === next.id,
          );

          const topY =
            layout.topYById[item.id] +
            getPillHeight(item.durationMinutes) / 2 +
            pillCenterShift(item.durationMinutes);
          const bottomY =
            layout.topYById[next.id] +
            getPillHeight(next.durationMinutes) / 2 +
            pillCenterShift(next.durationMinutes);
          const gradientId = `grad-${item.id}-${next.id}`;

          // Clip the connector at the edge of each icon so the line stops
          // exactly where the icon ends. topY/bottomY already sit at the icons'
          // true centers, so the clip radius is just the pill radius scaled by
          // the completed-icon scale (the smallest the icon ever gets).
          const lineH = bottomY - topY;
          const rTop =
            (getPillHeight(item.durationMinutes) / 2) * COMPLETED_ICON_SCALE;
          const rBottom =
            (getPillHeight(next.durationMinutes) / 2) * COMPLETED_ICON_SCALE;
          const lineStops = buildLineStops(
            lineH,
            rTop,
            rBottom,
            item.color,
            next.color,
            item.completed,
            next.completed,
          );

          if (overlap) {
            const overlapH = Math.floor(overlap.overlapMinutes / 60);
            const overlapM = Math.round(overlap.overlapMinutes % 60);
            const hLabel = `${overlapH} hour${overlapH === 1 ? "" : "s"}`;
            const mLabel = `${overlapM} minute${overlapM === 1 ? "" : "s"}`;
            const overlapLabel =
              overlapM === 0
                ? `overlaps by ${hLabel}`
                : overlapH === 0
                  ? `overlaps by ${mLabel}`
                  : `overlaps by ${hLabel} and ${mLabel}`;

            const prevBottomEdge =
              layout.topYById[item.id] + getPillHeight(item.durationMinutes);
            const nextTopEdge = layout.topYById[next.id];
            const labelY = (prevBottomEdge + nextTopEdge) / 2;
            const overlapGradientId = `overlap-grad-${item.id}-${next.id}`;

            return (
              <div
                key={`line-${item.id}`}
                className="absolute pointer-events-none"
                style={{
                  left: ICON_CENTER_X - 1,
                  top: topY,
                  height: bottomY - topY,
                }}
              >
                <svg
                  width="6"
                  height={bottomY - topY}
                  style={{ overflow: "visible" }}
                >
                  <defs>
                    <linearGradient
                      id={overlapGradientId}
                      x1="0" y1="0" x2="0" y2={bottomY - topY}
                      gradientUnits="userSpaceOnUse"
                    >
                      {lineStops.map((s, idx) => (
                        <stop
                          key={idx}
                          offset={s.offset}
                          stopColor={s.color}
                          stopOpacity={s.opacity}
                        />
                      ))}
                    </linearGradient>
                  </defs>
                  {/* Doubled, offset segment to signal the overlap — same
                      gradient as a normal connector. */}
                  <line
                    x1="-1"
                    y1="0"
                    x2="-1"
                    y2={bottomY - topY}
                    stroke={`url(#${overlapGradientId})`}
                    strokeWidth="2"
                  />
                  <line
                    x1="3"
                    y1="0"
                    x2="3"
                    y2={bottomY - topY}
                    stroke={`url(#${overlapGradientId})`}
                    strokeWidth="2"
                  />
                </svg>
                <span
                  className="absolute text-[11px] whitespace-nowrap"
                  style={{
                    left: 12,
                    top: labelY - topY,
                    transform: "translateY(-50%)",
                    color: "rgba(245, 158, 11, 0.6)",
                  }}
                >
                  ({overlapLabel})
                </span>
              </div>
            );
          }

          if (gap) {
            const gapH = Math.floor(gap.realMinutes / 60);
            const gapM = Math.round(gap.realMinutes % 60);
            const hLabel = `${gapH} hour${gapH === 1 ? "" : "s"}`;
            const mLabel = `${gapM} minute${gapM === 1 ? "" : "s"}`;
            const label =
              gapM === 0
                ? `${hLabel} break`
                : gapH === 0
                  ? `${mLabel} break`
                  : `${hLabel} and ${mLabel} break`;

            const prevBottomEdge =
              layout.topYById[item.id] + getPillHeight(item.durationMinutes);
            const nextTopEdge = layout.topYById[next.id];
            const labelY = (prevBottomEdge + nextTopEdge) / 2;
            const gapGradientId = `gap-grad-${item.id}-${next.id}`;

            return (
              <div
                key={`line-${item.id}`}
                className="absolute pointer-events-none"
                style={{
                  left: ICON_CENTER_X - 1,
                  top: topY,
                  height: bottomY - topY,
                }}
              >
                <svg
                  width="2"
                  height={bottomY - topY}
                  style={{ overflow: "visible" }}
                >
                  <defs>
                    <linearGradient
                      id={gapGradientId}
                      x1="0" y1="0" x2="0" y2={bottomY - topY}
                      gradientUnits="userSpaceOnUse"
                    >
                      {lineStops.map((s, idx) => (
                        <stop
                          key={idx}
                          offset={s.offset}
                          stopColor={s.color}
                          stopOpacity={s.opacity}
                        />
                      ))}
                    </linearGradient>
                  </defs>
                  <line
                    x1="1"
                    y1="0"
                    x2="1"
                    y2={bottomY - topY}
                    stroke={`url(#${gapGradientId})`}
                    strokeWidth="2"
                    strokeDasharray="4 4"
                  />
                </svg>
                <span
                  className="absolute text-[11px] text-fg-faint whitespace-nowrap"
                  style={{
                    left: 12,
                    top: labelY - topY,
                    transform: "translateY(-50%)",
                  }}
                >
                  ({label})
                </span>
              </div>
            );
          }

          return (
            <svg
              key={`line-${item.id}`}
              className="absolute pointer-events-none"
              style={{
                left: ICON_CENTER_X - 1,
                top: topY,
                width: 2,
                height: bottomY - topY,
                overflow: "visible",
              }}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  {lineStops.map((s, idx) => (
                    <stop
                      key={idx}
                      offset={s.offset}
                      stopColor={s.color}
                      stopOpacity={s.opacity}
                    />
                  ))}
                </linearGradient>
              </defs>
              <rect
                x="0"
                y="0"
                width="2"
                height={bottomY - topY}
                fill={`url(#${gradientId})`}
              />
            </svg>
          );
        })}

        <AnimatePresence>
          {activeItems.map((item) => (
            <ScheduleRow
              key={item.id}
              {...item}
              startOffset={startOffset}
              virtualTop={layout.topYById[item.id]}
              overlapping={overlapIds.has(item.id)}
              isCurrent={item.id === currentItemId}
              // Only the active (center) panel animates its rows in; the off-screen
              // neighbour panels render without the entrance animation so nothing
              // flickers at the edge during a swipe.
              entrance={active}
              onToggle={handleToggle}
              onEdit={handleEdit}
            />
          ))}
        </AnimatePresence>
      </div>

      {activeItems.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-2">
          <p className="text-base font-medium text-fg">All done for today 🎉</p>
          <p className="text-sm text-fg-faint">Every task is complete.</p>
        </div>
      )}

      <DoneTray items={doneItems} onToggle={handleToggle} onEdit={handleEdit} />

      {/* Slack below everything so the day can scroll a bit past its end. */}
      <div style={{ height: BOTTOM_SCROLL_SPACE }} />
    </>
  );
}
