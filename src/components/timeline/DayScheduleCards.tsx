import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Flame,
  Moon,
  Pencil,
  Plus,
  Sun,
  Sunrise,
  Sunset,
} from "lucide-react";
import { useShallow } from "zustand/shallow";

import type { ScheduleRowData } from "./ScheduleRow";
import type { EditItem } from "./Timeline";
import { getHabitStreak, isHabitActiveOnDate } from "@/lib/habits";
import { ICONS } from "@/lib/icons";
import { press, tap } from "@/lib/motion";
import { PRIORITY_META } from "@/lib/priority";
import { useHabitStore } from "@/store/habitStore";
import { useScheduleEditStore } from "@/store/scheduleEditStore";
import { useScheduleFocusStore } from "@/store/scheduleFocusStore";
import { useTaskStore } from "@/store/taskStore";

// How far down the viewport the focused card lands when scrolled into view.
const FOCUS_VIEWPORT_RATIO = 0.3;

interface DayScheduleCardsProps {
  date: string;
  active: boolean;
  onEdit: (item: EditItem) => void;
  onDetail: (item: EditItem) => void;
}

// Parts of the day, used to group the cards under headers — each with a colour
// that suits the time of day.
const PERIODS = [
  { key: "morning", label: "Morning", icon: Sunrise, until: 12 * 60, color: "#e2a35c" },
  { key: "afternoon", label: "Afternoon", icon: Sun, until: 17 * 60, color: "#dca63f" },
  { key: "evening", label: "Evening", icon: Sunset, until: 21 * 60, color: "#cf7566" },
  { key: "night", label: "Night", icon: Moon, until: 24 * 60, color: "#6f79bd" },
] as const;

const DONE_GREEN = "#5f8c78";

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

// hex → rgba string, for the pulsing ring around the current task's icon.
function hexToRgba(hex: string, alpha: number) {
  const c = hex.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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

export default function DayScheduleCards({ date, active, onEdit, onDetail }: DayScheduleCardsProps) {
  // Page-level editing mode: cards slide aside to reveal a per-card edit button.
  const editMode = useScheduleEditStore((s) => s.editMode);
  const [tasks, toggleTaskCompleted] = useTaskStore(
    useShallow((state) => [state.tasks, state.toggleTaskCompleted])
  );
  const [habits, toggleHabitCompleted] = useHabitStore(
    useShallow((state) => [state.habits, state.toggleHabitCompleted])
  );

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

  // Live clock so the pulse follows real time (only matters for today).
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

  // A just-completed task lingers in its group (showing the check) for a beat
  // before it animates out and drops into the Completed section.
  const [settling, setSettling] = useState<Set<string>>(new Set());
  const [showCompleted, setShowCompleted] = useState(false);

  // A tap on the Home page can ask to reveal a specific card here — scroll it
  // into view when this (center) panel mounts, then consume the request.
  const containerRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!active) return;
    const pending = useScheduleFocusStore.getState().pendingItemId;
    if (!pending || !items.some((i) => i.id === pending)) return;
    useScheduleFocusStore.getState().clear();

    const root = containerRef.current;
    const scroller = root?.closest("[data-scroll-lock]") as HTMLElement | null;
    const target = root?.querySelector(`[data-item-id="${pending}"]`) as HTMLElement | null;
    if (!scroller || !target) return;

    const delta =
      target.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top -
      scroller.clientHeight * FOCUS_VIEWPORT_RATIO;
    scroller.scrollTop += delta; // scrollTop self-clamps to the valid range
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, active]);

  function handleEdit(id: string) {
    // Editing mode opens the editor; a normal tap shows the read-only detail popup.
    const open = useScheduleEditStore.getState().editMode ? onEdit : onDetail;
    const task = tasks.find((t) => t.id === id);
    if (task) {
      open({ type: "task", data: task });
      return;
    }
    const habit = habits.find((h) => h.id === id);
    if (habit) open({ type: "habit", data: habit });
  }

  function handleToggle(id: string) {
    const wasCompleted = items.find((i) => i.id === id)?.completed ?? false;
    if (tasks.some((t) => t.id === id)) toggleTaskCompleted(id);
    else toggleHabitCompleted(id, date);

    setSettling((prev) => {
      const next = new Set(prev);
      if (wasCompleted) next.delete(id);
      else next.add(id);
      return next;
    });
    if (!wasCompleted) {
      window.setTimeout(() => {
        setSettling((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, 250);
    }
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

  // Active items live in their time-of-day groups; completed ones drop to the
  // Completed section (but linger in their group while `settling`).
  const activeItems = items.filter((i) => !i.completed || settling.has(i.id));
  const doneItems = items.filter((i) => i.completed && !settling.has(i.id));

  const groups = PERIODS.map((p) => ({
    ...p,
    items: activeItems.filter((i) => periodKey(i.startMinutes) === p.key),
  })).filter((g) => g.items.length > 0);

  function renderCard(item: ScheduleRowData) {
    const Icon = ICONS[item.icon] ?? ICONS.default;
    const start = fmt12(item.startMinutes);
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
        data-item-id={item.id}
        // Layout tracking only on the active panel: an off-screen neighbour has
        // it off, so when it slides into center on a swipe there's no prior box
        // to animate from (no "loading" slide). In-panel reflow — a card leaving
        // to the Completed section — still animates. Discrete nav remounts the
        // panel, so its entrance plays via `initial` below.
        layout={active}
        onClick={() => handleEdit(item.id)}
        whileTap={press}
        initial={active ? { opacity: 0, scale: 0.9 } : false}
        animate={{ opacity: item.completed ? 0.6 : 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.25, ease: "easeOut" } }}
        transition={{ type: "spring", stiffness: 500, damping: 34, mass: 0.4 }}
        className="relative overflow-hidden block w-full bg-surface-alt border border-border-strong rounded-3xl shadow-soft text-left"
      >
        {/* "Happening now" cue: a faint wash of the task's color that gently breathes. */}
        {isCurrent && (
          <motion.span
            className="absolute inset-0 pointer-events-none"
            style={{ backgroundColor: item.color }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.1, 0.2, 0.1] }}
            transition={{ duration: 3, ease: "easeInOut", repeat: Infinity }}
          />
        )}

        <div className="relative z-10 flex">
          {/* Time column — the one place the start time is shown */}
          <div className="w-20 shrink-0 flex flex-col items-center justify-center py-4">
            <span className="text-lg font-bold text-fg leading-none tabular-nums">
              {start.time}
            </span>
            <span className="text-xs text-fg-faint mt-1">{start.period}</span>
          </div>

          {/* Vertical divider in the task's colour */}
          <span
            className="w-px self-stretch my-4"
            style={{ background: `linear-gradient(to bottom, ${item.color}, ${item.color}22)` }}
          />

          {/* Content */}
          <div className="flex-1 min-w-0 pl-4 pr-3 py-4 flex flex-col justify-center gap-2.5">
            {/* Title row: icon + title + complete toggle */}
            <div className="flex items-center gap-2">
              <motion.span
                className="relative shrink-0 flex items-center justify-center rounded-full"
                style={{ width: 22, height: 22 }}
                animate={
                  isCurrent
                    ? {
                        boxShadow: [
                          `0 0 0 0 ${hexToRgba(item.color, 0.5)}`,
                          `0 0 0 9px ${hexToRgba(item.color, 0)}`,
                        ],
                      }
                    : { boxShadow: "0 0 0 0 rgba(0,0,0,0)" }
                }
                transition={
                  isCurrent
                    ? { duration: 1.8, ease: "easeOut", repeat: Infinity }
                    : { duration: 0.2 }
                }
              >
                <Icon size={20} style={{ color: item.color }} />
              </motion.span>

              <p
                className={`flex-1 min-w-0 truncate text-lg font-bold leading-snug ${
                  item.completed ? "text-fg-faint line-through" : "text-fg"
                }`}
              >
                {item.title}
              </p>
            </div>

            {/* Meta row: duration, priority, streak */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-sm font-medium text-fg-faint">{dur}</span>
              {item.priority && (
                <span
                  className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
                  style={{
                    backgroundColor: `${PRIORITY_META[item.priority].color}1f`,
                    color: PRIORITY_META[item.priority].color,
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: PRIORITY_META[item.priority].color }}
                  />
                  {PRIORITY_META[item.priority].label} priority
                </span>
              )}
              {item.streak ? (
                <span className="flex items-center gap-0.5 text-sm font-medium text-[#b5895f]">
                  <Flame size={13} className="fill-[#b5895f]" />
                  {item.streak}
                </span>
              ) : null}
            </div>
          </div>

          {/* Complete toggle — its own column so it centers vertically in the card */}
          <div className="flex items-center pr-4 shrink-0">
            {item.completed ? (
              <motion.span
                onClick={(ev) => {
                  ev.stopPropagation();
                  handleToggle(item.id);
                }}
                whileTap={tap}
                initial={{ scale: 0.4 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 600, damping: 18 }}
                className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                style={{ backgroundColor: item.color }}
              >
                <Check size={15} strokeWidth={3} className="text-white" />
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

          {/* Edit-mode rail: grows in from the right, nudging the card content
              aside, and is the card's edit entry point. (span, not button — the
              whole card is already a button.) */}
          <AnimatePresence initial={false}>
            {editMode && (
              <motion.span
                key="edit"
                onClick={(ev) => {
                  ev.stopPropagation();
                  handleEdit(item.id);
                }}
                whileTap={tap}
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 46, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                className="self-stretch shrink-0 flex items-center justify-center overflow-hidden bg-surface-raised border-l border-border-strong"
              >
                <Pencil size={16} className="text-fg-muted shrink-0" />
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </motion.button>
    );
  }

  // Compact row used in the Completed section.
  function renderCompactCard(item: ScheduleRowData) {
    const Icon = ICONS[item.icon] ?? ICONS.default;
    const start = fmt12(item.startMinutes);
    return (
      <motion.button
        key={item.id}
        layout={active}
        onClick={() => handleEdit(item.id)}
        whileTap={press}
        initial={active ? { opacity: 0, y: -6 } : false}
        animate={{ opacity: 0.7, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
        transition={{ type: "spring", stiffness: 500, damping: 34, mass: 0.4 }}
        className="flex items-center gap-2.5 w-full bg-surface-alt border border-border-strong rounded-2xl shadow-soft px-3 py-2 text-left"
      >
        <Icon size={15} style={{ color: item.color }} className="shrink-0" />
        <span className="flex-1 min-w-0 truncate text-sm font-semibold text-fg-faint line-through">
          {item.title}
        </span>
        <span className="text-xs text-fg-faint tabular-nums shrink-0">
          {start.time} {start.period}
        </span>
        <motion.span
          onClick={(ev) => {
            ev.stopPropagation();
            handleToggle(item.id);
          }}
          whileTap={tap}
          className="w-5.5 h-5.5 rounded-full flex items-center justify-center shrink-0"
          style={{ backgroundColor: item.color }}
        >
          <Check size={12} strokeWidth={3} className="text-white" />
        </motion.span>
      </motion.button>
    );
  }

  return (
    <div ref={containerRef} className="flex flex-col gap-6 pb-24">
      {groups.map((group, gi) => {
        const PeriodIcon = group.icon;
        return (
          <div key={group.key}>
            {/* Section header */}
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-2">
                <PeriodIcon size={17} style={{ color: group.color }} />
                <h3 className="text-lg font-semibold" style={{ color: group.color }}>
                  {group.label}
                </h3>
              </div>
              {gi === 0 && <span className="text-sm text-fg-faint">{relativeDayLabel(date)}</span>}
            </div>

            {/* Cards */}
            <div className="flex flex-col gap-3">
              {/* initial={active}: the center panel plays its entrance when it
                  mounts on discrete nav (tap a date); off-screen neighbours mount
                  silently, so a swipe (which reuses a neighbour) shows no enter. */}
              <AnimatePresence initial={active}>
                {group.items.map((item) => renderCard(item))}
              </AnimatePresence>
            </div>
          </div>
        );
      })}

      {/* Completed — collapsible */}
      {doneItems.length > 0 && (
        <div>
          <button
            onClick={() => setShowCompleted((v) => !v)}
            className="flex items-center gap-2 w-full px-1"
          >
            <CheckCircle2 size={17} style={{ color: DONE_GREEN }} />
            <h3 className="text-lg font-semibold" style={{ color: DONE_GREEN }}>
              Completed
            </h3>
            <span className="text-sm text-fg-faint">{doneItems.length}</span>
            <motion.span
              animate={{ rotate: showCompleted ? 180 : 0 }}
              transition={{ duration: 0.2 }}
              className="ml-auto text-fg-faint"
            >
              <ChevronDown size={18} />
            </motion.span>
          </button>

          <AnimatePresence initial={false}>
            {showCompleted && (
              <motion.div
                key="completed-list"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                <div className="flex flex-col gap-2 pt-3">
                  <AnimatePresence initial={false}>
                    {doneItems.map((item) => renderCompactCard(item))}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
