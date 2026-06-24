/* eslint-disable @typescript-eslint/no-unused-expressions */
import { useState } from "react";
import { AnimatePresence } from "framer-motion";
// import { DndContext, type DragEndEvent } from "@dnd-kit/core";
import { useTaskStore } from "../../store/taskStore";
import { useHabitStore } from "../../store/habitStore";
import { isHabitActiveOnDate, getHabitStreak } from "../../lib/habits";
import {
  minutesToPx,
  // pxToMinutes,
  // snapToGrid,
  getPillHeight,
  computeCompressedLayout,
} from "../../lib/time";
import ScheduleRow, {
  MIN_ROW_HEIGHT,
  type ScheduleRowData,
} from "./ScheduleRow";
import WeeklyTimeline from "./WeeklyTimeline";
import AddItemSheet from "./AddItemSheet";
import { Plus } from "lucide-react";
import type { Task } from "../../types/task";
import type { Habit } from "../../types/habits";
import type { ViewMode } from "../../App";

const ICON_CENTER_X = 68;
const DEFAULT_START_MINUTES = 6 * 60;

// Extra empty space below the last item so the daily view can scroll a bit past
// the end of the schedule.
const BOTTOM_SCROLL_SPACE = 75;

// Opacity of the connector end that belongs to a completed task.
const DONE_LINE_OPACITY = 0.3;

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

export type EditItem =
  | { type: "task"; data: Task }
  | { type: "habit"; data: Habit };

interface TimelineProps {
  viewMode: ViewMode;
}

export default function Timeline({ viewMode }: TimelineProps) {
  const tasks = useTaskStore((s) => s.tasks);
  const selectedDate = useTaskStore((s) => s.selectedDate);
  const toggleTaskCompleted = useTaskStore((s) => s.toggleTaskCompleted);

  const habits = useHabitStore((s) => s.habits);
  const toggleHabitCompleted = useHabitStore((s) => s.toggleHabitCompleted);

  const [editItem, setEditItem] = useState<EditItem | null>(null);

  const selectedDateObj = new Date(selectedDate + "T00:00:00");

  const taskItems: ScheduleRowData[] = tasks.filter(
    (t) => t.date === selectedDate,
  );

  const habitItems: ScheduleRowData[] = habits
    .filter((h) => isHabitActiveOnDate(h, selectedDateObj))
    .map((h) => ({
      id: h.id,
      title: h.title,
      startMinutes: h.startMinutes,
      durationMinutes: h.durationMinutes,
      color: h.color,
      icon: h.icon,
      completed: h.completedDates.includes(selectedDate),
      streak: getHabitStreak(h, selectedDateObj),
    }));

  const items = [...taskItems, ...habitItems].sort(
    (a, b) => a.startMinutes - b.startMinutes,
  );

  const layout = computeCompressedLayout(items, (item) =>
    Math.max(minutesToPx(item.durationMinutes), MIN_ROW_HEIGHT),
  );
  const earliestItem = items[0];
  const startOffset = earliestItem
    ? earliestItem.startMinutes
    : DEFAULT_START_MINUTES;

  const containerHeight = items.length
    ? Math.max(
        ...items.map(
          (item) =>
            layout.topYById[item.id] +
            Math.max(minutesToPx(item.durationMinutes), MIN_ROW_HEIGHT),
        ),
      )
    : 0;

  function handleEdit(id: string) {
    const task = tasks.find((t) => t.id === id);
    if (task) {
      setEditItem({ type: "task", data: task });
      return;
    }
    const habit = habits.find((h) => h.id === id);
    if (habit) setEditItem({ type: "habit", data: habit });
  }

  function handleToggle(id: string) {
    if (tasks.some((t) => t.id === id)) toggleTaskCompleted(id);
    else toggleHabitCompleted(id, selectedDate);
  }

  if (viewMode === "weekly") {
    return <WeeklyTimeline />;
  }

  return (
    <>
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="w-14 h-14 rounded-full bg-surface-raised flex items-center justify-center">
            <Plus size={24} className="text-fg-faint" />
          </div>
          <p className="text-base font-medium text-fg">
            Nothing scheduled
          </p>
          <p className="text-sm text-fg-faint text-center">
            Tap the + button to add a task or habit for this day.
          </p>
        </div>
      ) : (
        <div className="relative" style={{ height: containerHeight + BOTTOM_SCROLL_SPACE }}>
          {/* Gradient connector lines between items */}
          {items.slice(0, -1).map((item, i) => {
            const next = items[i + 1];
            const gap = layout.gaps.find(
              (g) => g.afterId === item.id && g.beforeId === next.id,
            );

            const topY =
              layout.topYById[item.id] +
              getPillHeight(item.durationMinutes) / 2;
            const bottomY =
              layout.topYById[next.id] +
              getPillHeight(next.durationMinutes) / 2;
            const gradientId = `grad-${item.id}-${next.id}`;

            // Fade the connector end that touches a completed task, ramping the
            // opacity gradually across the middle (stops at 25%/75% keep the
            // color ramp exact while softening the transition).
            const fadeTop = item.completed ? DONE_LINE_OPACITY : 1;
            const fadeBottom = next.completed ? DONE_LINE_OPACITY : 1;
            const color25 = lerpHex(item.color, next.color, 0.25);
            const color75 = lerpHex(item.color, next.color, 0.75);

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
                        <stop offset="0%" stopColor={item.color} stopOpacity={fadeTop} />
                        <stop offset="25%" stopColor={color25} stopOpacity={fadeTop} />
                        <stop offset="75%" stopColor={color75} stopOpacity={fadeBottom} />
                        <stop offset="100%" stopColor={next.color} stopOpacity={fadeBottom} />
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
                    <stop offset="0%" stopColor={item.color} stopOpacity={fadeTop} />
                    <stop offset="25%" stopColor={color25} stopOpacity={fadeTop} />
                    <stop offset="75%" stopColor={color75} stopOpacity={fadeBottom} />
                    <stop offset="100%" stopColor={next.color} stopOpacity={fadeBottom} />
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
            {items.map((item) => (
              <ScheduleRow
                key={item.id}
                {...item}
                startOffset={startOffset}
                virtualTop={layout.topYById[item.id]}
                onToggle={handleToggle}
                onEdit={handleEdit}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      <AddItemSheet
        isOpen={!!editItem}
        onClose={() => setEditItem(null)}
        editItem={editItem}
      />
    </>
  );
}
