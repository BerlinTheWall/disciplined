import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check, Flag, Flame, Moon, Plus, Sun, Sunrise, Sunset } from "lucide-react";

import type { ScheduleRowData } from "./ScheduleRow";
import type { EditItem } from "./Timeline";
import { getHabitStreak, isHabitActiveOnDate } from "@/lib/habits";
import { ICONS } from "@/lib/icons";
import { press, tap } from "@/lib/motion";
import { PRIORITY_META } from "@/lib/priority";
import { useHabitStore } from "@/store/habitStore";
import { useTaskStore } from "@/store/taskStore";

interface DayScheduleCardsProps {
  date: string;
  active: boolean;
  onEdit: (item: EditItem) => void;
}

// Parts of the day, used to group the cards under headers like the reference.
const PERIODS = [
  { key: "morning", label: "Morning", icon: Sunrise, until: 12 * 60 },
  { key: "afternoon", label: "Afternoon", icon: Sun, until: 17 * 60 },
  { key: "evening", label: "Evening", icon: Sunset, until: 21 * 60 },
  { key: "night", label: "Night", icon: Moon, until: 24 * 60 },
] as const;

function periodKey(min: number) {
  return (PERIODS.find((p) => min < p.until) ?? PERIODS[PERIODS.length - 1]).key;
}

function fmt12(min: number) {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return {
    time: `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")}`,
    period: h < 12 ? "AM" : "PM",
  };
}

function localDateString(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function relativeDayLabel(iso: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(iso + "T00:00:00");
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long" });
}

export default function DayScheduleCards({ date, onEdit }: DayScheduleCardsProps) {
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

  const items = [...taskItems, ...habitItems].sort((a, b) => a.startMinutes - b.startMinutes);

  // Live clock so the "Now" badge follows real time (only matters for today).
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const isToday = date === localDateString(now);
  let currentId: string | null = null;
  if (isToday) {
    for (const it of items) {
      if (nowMin >= it.startMinutes && nowMin < it.startMinutes + it.durationMinutes)
        currentId = it.id;
    }
  }

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

  const groups = PERIODS.map((p) => ({
    ...p,
    items: items.filter((i) => periodKey(i.startMinutes) === p.key),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="flex flex-col gap-6 pb-24">
      {groups.map((group, gi) => {
        const PeriodIcon = group.icon;
        return (
          <div key={group.key}>
            {/* Section header */}
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-2">
                <PeriodIcon size={17} className="text-fg-muted" />
                <h3 className="text-lg font-semibold text-fg">{group.label}</h3>
              </div>
              {gi === 0 && <span className="text-sm text-fg-faint">{relativeDayLabel(date)}</span>}
            </div>

            {/* Cards */}
            <div className="flex flex-col gap-3">
              {group.items.map((item) => {
                const Icon = ICONS[item.icon] ?? ICONS.default;
                const start = fmt12(item.startMinutes);
                const end = fmt12(item.startMinutes + item.durationMinutes);
                const isCurrent = item.id === currentId && !item.completed;
                const dur =
                  item.durationMinutes < 60
                    ? `${item.durationMinutes} min`
                    : `${Math.floor(item.durationMinutes / 60)}h${
                        item.durationMinutes % 60 ? ` ${item.durationMinutes % 60}m` : ""
                      }`;

                return (
                  <motion.button
                    key={item.id}
                    onClick={() => handleEdit(item.id)}
                    whileTap={press}
                    className={`relative overflow-hidden block w-full bg-surface-alt border border-border-strong rounded-3xl shadow-soft text-left ${
                      item.completed ? "opacity-60" : ""
                    }`}
                  >
                    {/* "Happening now" cue: a faint wash of the task's color that
                        gently breathes. */}
                    {isCurrent && (
                      <motion.span
                        className="absolute inset-0 pointer-events-none"
                        style={{ backgroundColor: item.color }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: [0.06, 0.16, 0.06] }}
                        transition={{ duration: 3, ease: "easeInOut", repeat: Infinity }}
                      />
                    )}

                    <div className="relative z-10 flex">
                      {/* Time column (plain time + AM) */}
                      <div className="w-20 shrink-0 flex flex-col text-center py-5">
                        <span className="text-base font-bold text-fg leading-none tabular-nums">
                          {start.time}
                        </span>
                        <span className="text-xs text-fg-faint mt-1 text-end pr-6">
                          {start.period}
                        </span>
                      </div>

                      {/* Vertical divider in the task's colour */}
                      <span
                        className="w-px self-stretch my-4"
                        style={{
                          background: `linear-gradient(to bottom, ${item.color}, ${item.color}22)`,
                        }}
                      />

                      {/* Content */}
                      <div className="flex-1 min-w-0 px-4 py-4">
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            <Icon size={16} className="shrink-0" style={{ color: item.color }} />
                            <p
                              className={`flex-1 min-w-0 truncate text-lg font-bold leading-snug ${
                                item.completed ? "text-fg-faint line-through" : "text-fg"
                              }`}
                            >
                              {item.title}
                            </p>
                            {item.streak ? (
                              <span className="flex items-center gap-0.5 text-sm font-medium text-[#b5895f] shrink-0">
                                <Flame size={13} className="fill-[#b5895f]" />
                                {item.streak}
                              </span>
                            ) : null}
                            <div className="flex items-center justify-end mt-2">
                              {item.completed ? (
                                <motion.span
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    handleToggle(item.id);
                                  }}
                                  whileTap={tap}
                                  className="flex items-center gap-1.5 rounded-full text-sm font-semibold"
                                  style={{ backgroundColor: `${item.color}1f`, color: item.color }}
                                >
                                  <span
                                    className="w-6 h-6 rounded-full flex items-center justify-center"
                                    style={{ backgroundColor: item.color }}
                                  >
                                    <Check size={14} strokeWidth={3} className="text-white" />
                                  </span>
                                </motion.span>
                              ) : (
                                <motion.span
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    handleToggle(item.id);
                                  }}
                                  whileTap={tap}
                                  className="w-7 h-7 rounded-full border-2 shrink-0"
                                  style={{ borderColor: item.color }}
                                />
                              )}
                            </div>
                          </div>
                          {item.priority && (
                            <Flag
                              size={16}
                              fill={PRIORITY_META[item.priority].color}
                              style={{ color: PRIORITY_META[item.priority].color }}
                              className="shrink-0"
                            />
                          )}
                        </div>

                        <p className="text-sm mt-1">
                          <span className="text-fg-faint">
                            {start.time} – {end.time} {end.period}
                          </span>
                          <span className="text-fg-faint"> · </span>
                          <span className="font-medium" style={{ color: item.color }}>
                            {dur}
                          </span>
                        </p>
                      </div>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
