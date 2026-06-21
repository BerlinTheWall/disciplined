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

const ICON_CENTER_X = 80;
const DEFAULT_START_MINUTES = 6 * 60;

export type EditItem =
  | { type: "task"; data: Task }
  | { type: "habit"; data: Habit };

interface TimelineProps {
  viewMode: ViewMode;
}

export default function Timeline({ viewMode }: TimelineProps) {
  const tasks = useTaskStore((s) => s.tasks);
  const selectedDate = useTaskStore((s) => s.selectedDate);
  // const updateTaskTime = useTaskStore((s) => s.updateTaskTime);
  // const updateTaskDuration = useTaskStore((s) => s.updateTaskDuration);
  const toggleTaskCompleted = useTaskStore((s) => s.toggleTaskCompleted);

  const habits = useHabitStore((s) => s.habits);
  // const updateHabitTime = useHabitStore((s) => s.updateHabitTime);
  // const updateHabitDuration = useHabitStore((s) => s.updateHabitDuration);
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
  // Start the timeline exactly at the first item (fall back to a default only
  // when the day is empty — that case renders the empty state below anyway).
  const earliestItem = items[0];
  const startOffset = earliestItem
    ? earliestItem.startMinutes
    : DEFAULT_START_MINUTES;

  // End the timeline at the bottom of the last-finishing row — not at midnight.
  // Each row renders at least MIN_ROW_HEIGHT, and a long earlier item can finish
  // lower than a short later one, so take the largest rendered bottom.
  const containerHeight = items.length
    ? Math.max(
        ...items.map(
          (item) =>
            layout.topYById[item.id] +
            Math.max(minutesToPx(item.durationMinutes), MIN_ROW_HEIGHT),
        ),
      )
    : 0;

  function handleLongPress(id: string) {
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

  // function handleDragEnd(event: DragEndEvent) {
  //   const { active, delta } = event;
  //   const activeId = String(active.id);
  //   const deltaMinutes = snapToGrid(pxToMinutes(delta.y));
  //   const isResize = activeId.startsWith("resize-");
  //   const targetId = isResize ? activeId.replace("resize-", "") : activeId;

  //   const task = tasks.find((t) => t.id === targetId);
  //   if (task) {
  //     isResize
  //       ? updateTaskDuration(targetId, task.durationMinutes + deltaMinutes)
  //       : updateTaskTime(targetId, task.startMinutes + deltaMinutes);
  //     return;
  //   }
  //   const habit = habits.find((h) => h.id === targetId);
  //   if (habit) {
  //     isResize
  //       ? updateHabitDuration(targetId, habit.durationMinutes + deltaMinutes)
  //       : updateHabitTime(targetId, habit.startMinutes + deltaMinutes);
  //   }
  // }

  if (viewMode === "weekly") {
    return <WeeklyTimeline />;
  }

  return (
    <>
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center">
            <Plus size={24} className="text-gray-400" />
          </div>
          <p className="text-base font-medium text-gray-900">
            Nothing scheduled
          </p>
          <p className="text-sm text-gray-400 text-center">
            Tap the + button to add a task or habit for this day.
          </p>
        </div>
      ) : (
        // <DndContext onDragEnd={handleDragEnd}>
        <div className="relative" style={{ height: containerHeight }}>
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

            if (gap) {
              const hours = gap.realMinutes / 60;
              const label =
                hours % 1 === 0
                  ? `${hours} hour break`
                  : `${hours.toFixed(1)} hour break`;

              // Label position: centered in the actual visible gap between pill
              // edges, not between pill centers (which skews when the next pill
              // is tall, e.g. a long-duration task).
              const prevBottomEdge =
                layout.topYById[item.id] + getPillHeight(item.durationMinutes);
              const nextTopEdge = layout.topYById[next.id];
              const labelY = (prevBottomEdge + nextTopEdge) / 2;

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
                    <line
                      x1="1"
                      y1="0"
                      x2="1"
                      y2={bottomY - topY}
                      stroke="#9ca3af"
                      strokeWidth="2"
                      strokeDasharray="4 4"
                    />
                  </svg>
                  <span
                    className="absolute text-[11px] text-gray-400 whitespace-nowrap"
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
                    <stop offset="0%" stopColor={item.color} />
                    <stop offset="100%" stopColor={next.color} />
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
                onLongPress={handleLongPress}
              />
            ))}
          </AnimatePresence>
        </div>
        // </DndContext>
      )}

      <AddItemSheet
        isOpen={!!editItem}
        onClose={() => setEditItem(null)}
        editItem={editItem}
      />
    </>
  );
}
