import { useState } from "react";
import { motion } from "framer-motion";
import { Flame, Plus, Repeat } from "lucide-react";

import { repeatSummary } from "@/components/timeline/addItemOptions";
import AddItemSheet from "@/components/timeline/AddItemSheet";
import TaskDetailSheet from "@/components/timeline/TaskDetailSheet";
import type { EditItem } from "@/components/timeline/Timeline";
import { todayISODate } from "@/lib/date";
import { anchorDay, getHabitStreak, isHabitActiveOnDate } from "@/lib/habits";
import { ICONS } from "@/lib/icons";
import { tap } from "@/lib/motion";
import { useHabitStore } from "@/store/habitStore";

const DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export default function HabitsPage() {
  const habits = useHabitStore((s) => s.habits);
  const today = new Date();
  const todayISO = todayISODate();

  // Mirrors Timeline.tsx's pattern: tap a row for the read-only detail sheet,
  // its Edit button promotes to the full editor (which is also where Delete
  // lives, via the existing "this day only" vs "entire habit" dialog).
  const [detailItem, setDetailItem] = useState<EditItem | null>(null);
  const [editItem, setEditItem] = useState<EditItem | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);

  if (habits.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <div className="w-14 h-14 rounded-full bg-surface-raised flex items-center justify-center">
          <Repeat size={24} className="text-fg-faint" />
        </div>
        <p className="text-base font-medium text-fg">No habits yet</p>
        <motion.button
          onClick={() => setIsAddOpen(true)}
          whileTap={tap}
          className="flex items-center gap-1 text-sm font-medium text-fg-muted"
        >
          <Plus size={15} />
          Add a habit
        </motion.button>
        <AddItemSheet isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} defaultMode="habit" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between px-1">
        <h2 className="text-base font-semibold text-fg">Your habits</h2>
        <motion.button
          onClick={() => setIsAddOpen(true)}
          whileTap={tap}
          className="flex items-center gap-1 text-sm text-fg-muted"
        >
          <Plus size={15} />
          New habit
        </motion.button>
      </div>

      {habits.map((habit) => {
        const IconComponent = ICONS[habit.icon] ?? ICONS.default;
        const streak = getHabitStreak(habit, today);
        const isActiveToday = isHabitActiveOnDate(habit, today);
        const completedToday = habit.completedDates.includes(todayISO);

        return (
          <div
            key={habit.id}
            role="button"
            tabIndex={0}
            onClick={() => setDetailItem({ type: "habit", data: habit })}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") setDetailItem({ type: "habit", data: habit });
            }}
            className="flex items-center gap-4 p-4 rounded-2xl bg-surface-alt cursor-pointer"
          >
            {/* Colored icon pill */}
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
              style={{ backgroundColor: habit.color }}
            >
              <IconComponent size={18} className="text-white" />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-fg leading-tight">{habit.title}</p>

              {/* Active days dots — only meaningful for a weekly recurrence;
                  monthly/interval habits get a text summary instead. */}
              {(habit.freq ?? "weekly") === "monthly" ? (
                <p className="text-xs text-fg-faint mt-1.5">
                  {repeatSummary(
                    "monthly",
                    habit.interval ?? 1,
                    habit.daysOfWeek,
                    anchorDay(habit.anchorDate)
                  )}
                </p>
              ) : (
                <>
                  {(habit.interval ?? 1) > 1 && (
                    <p className="text-xs text-fg-faint mt-1.5">Every {habit.interval} weeks</p>
                  )}
                  <div className="flex gap-1 mt-1.5">
                    {DAY_LABELS.map((label, i) => (
                      <span
                        key={i}
                        className={`w-5 h-5 rounded-full text-[9px] font-medium flex items-center justify-center ${
                          habit.daysOfWeek.includes(i)
                            ? "bg-surface-inverse text-fg-inverse"
                            : "bg-surface-subtle text-fg-faint"
                        }`}
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Streak + today status */}
            <div className="flex flex-col items-end gap-1 shrink-0">
              {streak > 0 && (
                <span className="flex items-center gap-0.5 text-sm font-semibold text-[#b5895f]">
                  <Flame size={14} className="fill-[#b5895f]" />
                  {streak}
                </span>
              )}
              {isActiveToday && (
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    completedToday
                      ? "bg-green-100 text-green-600"
                      : "bg-surface-raised text-fg-faint"
                  }`}
                >
                  {completedToday ? "Done" : "Pending"}
                </span>
              )}
              {!isActiveToday && <span className="text-xs text-fg-disabled">Off today</span>}
            </div>
          </div>
        );
      })}

      <TaskDetailSheet
        item={detailItem}
        onClose={() => setDetailItem(null)}
        onEdit={(item) => {
          setDetailItem(null);
          setEditItem(item);
        }}
      />
      <AddItemSheet isOpen={!!editItem} onClose={() => setEditItem(null)} editItem={editItem} />
      <AddItemSheet isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} defaultMode="habit" />
    </div>
  );
}
