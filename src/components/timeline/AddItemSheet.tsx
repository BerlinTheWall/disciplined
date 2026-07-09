/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-hooks/immutability */
/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUpRight,
  Bell,
  Calendar,
  Check,
  CheckCircle2,
  ChefHat,
  ChevronLeft,
  ChevronRight,
  Clock,
  Dumbbell,
  Flag,
  Link2,
  MoreHorizontal,
  Palette,
  Repeat,
  Trash2,
  X,
} from "lucide-react";
import { useShallow } from "zustand/shallow";

import type { EditItem } from "./Timeline";
import { useAutoFocus } from "@/hooks/useAutoFocus";
import { useScrollLock } from "@/hooks/useScrollLock";
import { toISODate } from "@/lib/date";
import { formatAmount, indexItems } from "@/lib/grocery";
import { isHabitActiveOnDate } from "@/lib/habits";
import { guessIcon, guessLinkKind, ICONS } from "@/lib/icons";
import { spring, tap } from "@/lib/motion";
import { PRIORITIES, PRIORITY_META } from "@/lib/priority";
import {
  notifyPermission,
  REMINDER_OPTIONS,
  reminderLabel,
  requestNotifyPermission,
} from "@/lib/reminders";
import { exerciseSummary, WORKOUT_TYPE_META } from "@/lib/workout";
import { useGroceryStore } from "@/store/groceryStore";
import { useHabitStore } from "@/store/habitStore";
import { useRecipeFocusStore } from "@/store/recipeFocusStore";
import { useRecipeStore } from "@/store/recipeStore";
import { useSettingsStore } from "@/store/settingsStore";
import { useTaskStore } from "@/store/taskStore";
import { useWorkoutFocusStore } from "@/store/workoutFocusStore";
import { useWorkoutStore } from "@/store/workoutStore";
import type { Priority } from "@/types/task";
import { useChoose, useConfirm } from "../ConfirmDialog";

const COLOR_OPTIONS = [
  "#34d399",
  "#fb7185",
  "#fb923c",
  "#fbbf24",
  "#a3e635",
  "#60a5fa",
  "#22d3ee",
  "#a78bfa",
  "#f472b6",
  "#f87171",
];
const DURATION_OPTIONS = [15, 30, 45, 60, 90];

// Labels in the duration track: bare minutes when idle ("30"), the unit only
// on the selected pill ("30min"), hours always spelled ("1h", "1.5h").
function durationTrackLabel(d: number, selected: boolean) {
  if (d < 60) return selected ? `${d}min` : `${d}`;
  const h = d / 60;
  return `${h % 1 === 0 ? h : h.toFixed(1)}h`;
}
const DAY_OPTIONS = [
  { label: "S", value: 0 },
  { label: "M", value: 1 },
  { label: "T", value: 2 },
  { label: "W", value: 3 },
  { label: "T", value: 4 },
  { label: "F", value: 5 },
  { label: "S", value: 6 },
];

const MINUTES_PER_DAY = 1440;

// Rows of the edit sheet; tapping one slides its editor up from the bottom.
type EditRowKey = "date" | "time" | "repeat" | "alert" | "priority" | "links";

const FIELD_PANEL_TITLES: Record<EditRowKey, string> = {
  date: "Date",
  time: "Time",
  repeat: "Repeat",
  alert: "Alert",
  priority: "Priority",
  links: "Links",
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function repeatSummary(days: number[]) {
  if (days.length === 7) return "Every day";
  if (days.length === 0) return "No days picked";
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 5 && sorted[0] === 1 && sorted[4] === 5) return "Weekdays";
  if (sorted.length === 2 && sorted[0] === 0 && sorted[1] === 6) return "Weekends";
  return sorted.map((d) => DAY_NAMES[d]).join(", ");
}

/* ---- helpers ----------------------------------------------------- */

function isLightColor(hex: string) {
  const c = hex.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62;
}

function minutesToTimeString(minutes: number) {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
function timeStringToMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function label24(min: number) {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
function rangeLabel(startMin: number, dur: number) {
  return `${label24(startMin)}–${label24(startMin + dur)}`;
}
function durationWords(d: number) {
  if (d < 60) return `${d} mins`;
  const h = Math.floor(d / 60);
  const m = d % 60;
  return m ? `${h} hr, ${m} mins` : `${h} hr`;
}
function formatDuration(d: number) {
  if (d < 60) return `${d}m`;
  const h = Math.floor(d / 60);
  const m = d % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function isoToDate(iso: string) {
  return new Date(iso + "T00:00:00");
}
function formatFullDate(iso: string) {
  return isoToDate(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
function relativeDayLabel(iso: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = isoToDate(iso);
  d.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long" });
}

/* ---- single-column time wheel ------------------------------------ */

const WHEEL_ITEM_H = 40;
const WHEEL_VISIBLE = 3;

function TimeWheel({
  value,
  durationMinutes,
  color,
  onChange,
  visibleRows = WHEEL_VISIBLE,
}: {
  value: string;
  durationMinutes: number;
  color: string;
  onChange: (next: string) => void;
  visibleRows?: number;
}) {
  const wheelPad = ((visibleRows - 1) / 2) * WHEEL_ITEM_H;
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didMount = useRef(false);

  // The wheel steps by the chosen duration so short tasks sit back-to-back — a
  // 1-min task offers every minute (6:00, 6:01, …), a 5-min task every fifth
  // (6:00, 6:05, …) — but never coarser than 15 min, so a 1-hour task still
  // steps every 15 (6:00, 6:15, …) instead of only on the hour.
  const step = Math.max(1, Math.min(durationMinutes, 15));
  const steps = useMemo(() => {
    const arr: number[] = [];
    for (let m = 0; m < MINUTES_PER_DAY; m += step) arr.push(m);
    return arr;
  }, [step]);

  const selectedIndex = Math.max(
    0,
    Math.min(steps.length - 1, Math.round(timeStringToMinutes(value) / step))
  );
  const [active, setActive] = useState(selectedIndex);

  // Park the wheel on the current value. Runs on mount, when the value changes
  // from outside (opening the sheet to edit an existing task), and when the step
  // changes (the user picked a new duration). The distance guard avoids fighting
  // a user scroll that has already settled at the target.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = selectedIndex * WHEEL_ITEM_H;
    if (Math.abs(el.scrollTop - target) > WHEEL_ITEM_H / 2) {
      el.scrollTop = target;
    }
    setActive(selectedIndex);
    // Keep the stored start time on the grid so what's shown matches what's
    // saved: a task loaded at 6:15 with a 30-min duration (no 6:15 slot) snaps to
    // the nearest slot. The guard skips the first, pre-populate render so we don't
    // write back the stale default time the sheet still holds from last time.
    if (didMount.current) {
      const aligned = minutesToTimeString(steps[selectedIndex]);
      if (aligned !== value) onChange(aligned);
    } else {
      didMount.current = true;
    }
  }, [selectedIndex, step]);

  function handleScroll() {
    const el = ref.current;
    if (!el) return;
    const idx = Math.max(0, Math.min(steps.length - 1, Math.round(el.scrollTop / WHEEL_ITEM_H)));
    setActive(idx);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (idx !== selectedIndex) onChange(minutesToTimeString(steps[idx]));
    }, 110);
  }

  return (
    <div className="bg-surface-raised rounded-2xl py-2">
      <div
        ref={ref}
        onScroll={handleScroll}
        className="wheel-col overflow-y-scroll snap-y snap-mandatory"
        style={{ height: visibleRows * WHEEL_ITEM_H, scrollbarWidth: "none" }}
      >
        <div style={{ height: wheelPad }} />
        {steps.map((min, i) => (
          <div
            key={min}
            className="flex items-center justify-center snap-center"
            style={{ height: WHEEL_ITEM_H }}
          >
            {i === active ? (
              <span
                className="px-4 py-1.5 rounded-full font-semibold text-base tabular-nums"
                style={{ backgroundColor: color, color: isLightColor(color) ? "#111827" : "#fff" }}
              >
                {rangeLabel(min, durationMinutes)}
              </span>
            ) : (
              <span className="text-base tabular-nums text-fg-disabled">{label24(min)}</span>
            )}
          </div>
        ))}
        <div style={{ height: wheelPad }} />
      </div>
    </div>
  );
}

/* ---- step slide animation ---------------------------------------- */

const stepVariants = {
  enter: (d: number) => ({ x: d > 0 ? 32 : -32, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (d: number) => ({ x: d > 0 ? -32 : 32, opacity: 0 }),
};

// Same idea for the calendar's month grid: slide in from the side you're
// heading toward (dir 0 on first render skips the slide entirely).
const monthVariants = {
  enter: (d: number) => ({ x: d > 0 ? 56 : d < 0 ? -56 : 0, opacity: d === 0 ? 1 : 0 }),
  center: { x: 0, opacity: 1 },
  exit: (d: number) => ({ x: d > 0 ? -56 : d < 0 ? 56 : 0, opacity: 0 }),
};

interface AddItemSheetProps {
  isOpen: boolean;
  onClose: () => void;
  editItem?: EditItem | null;
}

export default function AddItemSheet({ isOpen, onClose, editItem }: AddItemSheetProps) {
  const [selectedDate, updateTask, addTask, deleteTask, toggleTaskCompleted] = useTaskStore(
    useShallow((state) => [
      state.selectedDate,
      state.updateTask,
      state.addTask,
      state.deleteTask,
      state.toggleTaskCompleted,
    ])
  );
  const [addHabit, updateHabit, deleteHabit, skipHabitOccurrence, toggleHabitCompleted] =
    useHabitStore(
      useShallow((state) => [
        state.addHabit,
        state.updateHabit,
        state.deleteHabit,
        state.skipHabitOccurrence,
        state.toggleHabitCompleted,
      ])
    );
  const tasks = useTaskStore((s) => s.tasks);
  const habits = useHabitStore((s) => s.habits);
  const workoutSessions = useWorkoutStore((s) => s.sessions);
  const openWorkoutSession = useWorkoutFocusStore((s) => s.openSession);
  const recipes = useRecipeStore((s) => s.recipes);
  const openRecipe = useRecipeFocusStore((s) => s.openRecipe);
  const groceryItems = useGroceryStore((s) => s.groceryItems);
  const catalog = indexItems(groceryItems);
  const confirm = useConfirm();
  const choose = useChoose();

  const isEditing = !!editItem;
  useScrollLock(isOpen);
  const titleRef = useRef<HTMLInputElement>(null);
  useAutoFocus(titleRef, isOpen);

  const [step, setStep] = useState(1);
  const [dir, setDir] = useState(1);
  const [mode, setMode] = useState<"task" | "habit">("task");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(selectedDate);
  const [time, setTime] = useState("09:00");
  const [duration, setDuration] = useState(30);
  const [customMode, setCustomMode] = useState(false);
  const [customH, setCustomH] = useState("0");
  const [customM, setCustomM] = useState("30");
  const [color, setColor] = useState(COLOR_OPTIONS[0]);
  const [icon, setIcon] = useState<keyof typeof ICONS>("alarm");
  const [iconTouched, setIconTouched] = useState(false);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [workoutSessionId, setWorkoutSessionId] = useState<string | undefined>(undefined);
  const [recipeId, setRecipeId] = useState<string | undefined>(undefined);
  const [priority, setPriority] = useState<Priority | null>(null);
  const [reminder, setReminder] = useState<number | null>(null);
  const [openRow, setOpenRow] = useState<EditRowKey | null>(null);
  const [done, setDone] = useState(false);
  const [styleOpen, setStyleOpen] = useState(false);
  const [suggestDismissed, setSuggestDismissed] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setStep(1);
    setDir(1);
    setOpenRow(null);
    setStyleOpen(false);
    setSuggestDismissed(false);
    if (editItem) {
      setDone(
        editItem.type === "task"
          ? editItem.data.completed
          : editItem.data.completedDates.includes(selectedDate)
      );
      setMode(editItem.type);
      setTitle(editItem.data.title);
      setDate(editItem.type === "task" ? editItem.data.date : selectedDate);
      setTime(minutesToTimeString(editItem.data.startMinutes));
      const loadedDuration = Math.min(
        editItem.data.durationMinutes,
        MINUTES_PER_DAY - editItem.data.startMinutes
      );
      setDuration(loadedDuration);
      const custom = !DURATION_OPTIONS.includes(loadedDuration);
      setCustomMode(custom);
      setCustomH(String(Math.floor(loadedDuration / 60)));
      setCustomM(String(loadedDuration % 60));
      setColor(editItem.data.color);
      setIcon(editItem.data.icon);
      setIconTouched(true);
      setDaysOfWeek(editItem.type === "habit" ? editItem.data.daysOfWeek : [0, 1, 2, 3, 4, 5, 6]);
      setWorkoutSessionId(editItem.data.workoutSessionId ?? undefined);
      setRecipeId(editItem.data.recipeId ?? undefined);
      setPriority(editItem.type === "task" ? (editItem.data.priority ?? null) : null);
      setReminder(editItem.data.reminderMinutesBefore ?? null);
    } else {
      resetForm();
    }
  }, [editItem, isOpen]);

  function resetForm() {
    setMode("task");
    setTitle("");
    setDate(selectedDate);
    setTime("09:00");
    setDuration(30);
    setCustomMode(false);
    setCustomH("0");
    setCustomM("30");
    setColor(COLOR_OPTIONS[0]);
    setIcon("alarm");
    setIconTouched(false);
    setDaysOfWeek([0, 1, 2, 3, 4, 5, 6]);
    setWorkoutSessionId(undefined);
    setRecipeId(undefined);
    setPriority(null);
    setReminder(useSettingsStore.getState().defaultReminderMinutes);
  }

  function pickReminder(value: number | null) {
    setReminder(value);
    // First time someone asks for a reminder, get notification permission out
    // of the way; declining still leaves in-app banners working.
    if (value !== null && notifyPermission() === "default") {
      void requestNotifyPermission();
    }
  }

  function linkWorkout(sessionId: string | undefined) {
    setWorkoutSessionId(sessionId);
    if (!sessionId) return;
    // A task is one thing — linking a workout clears any recipe link.
    setRecipeId(undefined);
    const session = workoutSessions.find((s) => s.id === sessionId);
    if (!session) return;
    // Adopt the session's color and a dumbbell icon for a clear at-a-glance link,
    // unless the user has already personalised the icon.
    setColor(session.color);
    if (!iconTouched) setIcon("workout");
  }

  function linkRecipe(id: string | undefined) {
    setRecipeId(id);
    if (!id) return;
    setWorkoutSessionId(undefined);
    const recipe = recipes.find((r) => r.id === id);
    if (!recipe) return;
    setColor(recipe.color);
    if (!iconTouched) setIcon("meal");
  }

  function handleTitleChange(value: string) {
    setTitle(value);
    if (value === "") {
      setIconTouched(false);
      setIcon("alarm");
    } else if (!iconTouched) {
      const guess = guessIcon(value);
      if (guess) setIcon(guess);
    }
  }

  function applyCustom(hStr: string, mStr: string) {
    const cleanH = hStr.replace(/\D/g, "").slice(0, 2);
    const cleanM = mStr.replace(/\D/g, "").slice(0, 2);
    const maxDur = MINUTES_PER_DAY - timeStringToMinutes(time);
    const raw = Math.min(23, Number(cleanH || 0)) * 60 + Math.min(59, Number(cleanM || 0));
    const clamped = Math.min(raw, maxDur);
    if (clamped !== raw) {
      setCustomH(String(Math.floor(clamped / 60)));
      setCustomM(String(clamped % 60));
    } else {
      setCustomH(cleanH);
      setCustomM(cleanM);
    }
    setDuration(clamped);
  }

  function handleTimeChange(next: string) {
    setTime(next);
    const maxDur = MINUTES_PER_DAY - timeStringToMinutes(next);
    if (duration > maxDur) {
      setDuration(maxDur);
      setCustomH(String(Math.floor(maxDur / 60)));
      setCustomM(String(maxDur % 60));
    }
  }

  function toggleDay(value: number) {
    setDaysOfWeek((prev) =>
      prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value]
    );
  }

  async function handleSubmit() {
    if (!title.trim() || duration < 1) return;
    const startMinutes = timeStringToMinutes(time);
    if (startMinutes + duration > MINUTES_PER_DAY) return;

    // Type changed while editing: create the item on the other side, then
    // remove the original. Each store syncs its own create/delete.
    if (isEditing && mode !== editItem!.type) {
      if (mode === "habit") {
        if (daysOfWeek.length === 0) return;
        addHabit({
          title: title.trim(),
          startMinutes,
          durationMinutes: duration,
          color,
          icon,
          daysOfWeek,
          reminderMinutesBefore: reminder,
          workoutSessionId,
          recipeId,
        });
        deleteTask(editItem!.data.id);
      } else {
        const ok = await confirm({
          title: "Convert to one-time task?",
          message: `"${title.trim()}" will stop repeating and its completion history will be removed.`,
          confirmLabel: "Convert",
        });
        if (!ok) return;
        addTask({
          title: title.trim(),
          startMinutes,
          durationMinutes: duration,
          color,
          icon,
          date,
          priority,
          reminderMinutesBefore: reminder,
          workoutSessionId,
          recipeId,
        });
        deleteHabit(editItem!.data.id);
      }
      onClose();
      return;
    }

    if (isEditing) {
      if (editItem!.type === "habit" && daysOfWeek.length === 0) return;
      if (editItem!.type === "task") {
        updateTask(editItem!.data.id, {
          title: title.trim(),
          startMinutes,
          durationMinutes: duration,
          color,
          icon,
          date,
          priority,
          reminderMinutesBefore: reminder,
          workoutSessionId: workoutSessionId ?? null,
          recipeId: recipeId ?? null,
        });
      } else {
        updateHabit(editItem!.data.id, {
          title: title.trim(),
          startMinutes,
          durationMinutes: duration,
          color,
          icon,
          daysOfWeek,
          reminderMinutesBefore: reminder,
          workoutSessionId: workoutSessionId ?? null,
          recipeId: recipeId ?? null,
        });
      }
    } else {
      if (mode === "task") {
        addTask({
          title: title.trim(),
          startMinutes,
          durationMinutes: duration,
          color,
          icon,
          date,
          priority,
          reminderMinutesBefore: reminder,
          workoutSessionId,
          recipeId,
        });
      } else {
        if (daysOfWeek.length === 0) return;
        addHabit({
          title: title.trim(),
          startMinutes,
          durationMinutes: duration,
          color,
          icon,
          daysOfWeek,
          reminderMinutesBefore: reminder,
          workoutSessionId,
          recipeId,
        });
      }
    }
    onClose();
  }

  async function handleDelete() {
    if (!editItem) return;

    // A recurring task (habit): let the user remove just this day's occurrence
    // or the whole habit.
    if (editItem.type === "habit") {
      const choice = await choose({
        title: "Delete recurring task?",
        message: `"${editItem.data.title}" repeats on a schedule.`,
        options: [
          { label: "Delete only this day", value: "occurrence" },
          { label: "Delete entire habit", value: "habit", destructive: true },
        ],
      });
      if (!choice) return;
      if (choice === "occurrence") {
        skipHabitOccurrence(editItem.data.id, date);
      } else {
        deleteHabit(editItem.data.id);
      }
      onClose();
      return;
    }

    const ok = await confirm({
      title: "Delete task?",
      message: `"${editItem.data.title}" will be permanently removed.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    deleteTask(editItem.data.id);
    onClose();
  }

  function goTo(next: number) {
    setDir(next > step ? 1 : -1);
    setStep(next);
  }

  // Calendar dots: colors of the items already scheduled on a given day.
  function dayMarkers(iso: string) {
    const d = isoToDate(iso);
    return [
      ...habits.filter((h) => isHabitActiveOnDate(h, d)).map((h) => h.color),
      ...tasks.filter((t) => t.date === iso).map((t) => t.color),
    ];
  }

  // Header completion circle — writes straight to the store (completion isn't
  // part of the staged form), mirrored locally since editItem is a snapshot.
  function toggleDone() {
    if (!editItem) return;
    if (editItem.type === "task") toggleTaskCompleted(editItem.data.id);
    else toggleHabitCompleted(editItem.data.id, date);
    setDone((v) => !v);
  }

  const startMin = timeStringToMinutes(time);
  const maxDuration = MINUTES_PER_DAY - startMin;
  const endMin = startMin + duration;
  const endLabel = endMin >= MINUTES_PER_DAY ? "midnight" : label24(endMin);
  const onColor = isLightColor(color) ? "#111827" : "#ffffff";
  const HeaderIcon = ICONS[icon] ?? ICONS.default;
  const linkedSession = workoutSessions.find((s) => s.id === workoutSessionId);
  const linkedRecipe = recipes.find((r) => r.id === recipeId);

  // Title/icon smells like a workout or a meal but nothing is linked yet —
  // offer a one-tap link without making the user dig into Advanced settings.
  const guessedKind = guessLinkKind(title, icon);
  const linkSuggestion =
    guessedKind === "workout" && !workoutSessionId && workoutSessions.length > 0
      ? ("workout" as const)
      : guessedKind === "meal" && !recipeId && recipes.length > 0
        ? ("meal" as const)
        : null;
  const chipCls = (selected: boolean) =>
    `px-3.5 py-2 rounded-full text-sm font-medium shrink-0 ${selected ? "bg-surface-inverse text-fg-inverse" : "bg-surface-raised text-fg-muted"}`;

  /* ---- field sections — shared by the wizard (create) and the single
     scrollable form (edit) ----------------------------------------- */

  const detailsBody = (
    <div>
      <label className="text-xs font-medium text-fg-muted mb-2 block">Color</label>
      <div
        className="wheel-col flex gap-3 overflow-x-auto bg-surface-raised rounded-full p-1.5 mb-5"
        style={{ scrollbarWidth: "none" }}
      >
        {COLOR_OPTIONS.map((c) => (
          <motion.button
            key={c}
            onClick={() => setColor(c)}
            whileTap={tap}
            className="w-8 h-8 rounded-full shrink-0"
            style={{
              backgroundColor: c,
              outline: color === c ? "2px solid var(--fg)" : "none",
              outlineOffset: 2,
            }}
          />
        ))}
      </div>

      <label className="text-xs font-medium text-fg-muted mb-2 block">Icon</label>
      <div className="wheel-col flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
        {(Object.keys(ICONS) as Array<keyof typeof ICONS>)
          .filter((key) => key !== "default")
          .map((key) => {
            const IconComp = ICONS[key];
            const selected = icon === key;
            return (
              <motion.button
                key={key}
                onClick={() => {
                  setIcon(key);
                  setIconTouched(true);
                }}
                whileTap={tap}
                className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                style={{
                  backgroundColor: selected ? color : "var(--surface-raised)",
                  color: selected ? onColor : "var(--fg-muted)",
                }}
              >
                <IconComp size={18} />
              </motion.button>
            );
          })}
      </div>
    </div>
  );

  const datePickerField = (
    <div className="relative">
      <div className="flex items-center justify-between bg-surface-raised rounded-2xl px-4 py-2.5">
        <span className="flex items-center gap-2 text-fg font-medium">
          <Calendar size={18} className="text-fg-faint" />
          {formatFullDate(date)}
        </span>
        <span className="flex items-center gap-1 text-fg-faint text-sm">
          {relativeDayLabel(date)}
          <ChevronRight size={16} />
        </span>
      </div>
      <input
        type="date"
        value={date}
        onChange={(e) => e.target.value && setDate(e.target.value)}
        className="absolute inset-0 opacity-0 w-full h-full"
      />
    </div>
  );

  const dateBody = (
    <div>
      <label className="text-xs font-medium text-fg-muted mb-1.5 block">Date</label>
      <div className="mb-4">{datePickerField}</div>
    </div>
  );

  const timeWheelField = (
    <TimeWheel value={time} durationMinutes={duration} color={color} onChange={handleTimeChange} />
  );

  const timeBody = (
    <div>
      <label className="text-xs font-medium text-fg-muted mb-1.5 block">Start time</label>
      {timeWheelField}
    </div>
  );

  const durationField = (
    <div>
      {/* Segmented track: the selected duration is a filled pill in the
          item's color, everything else quiet text on the shared rail. */}
      <div className="flex items-center bg-surface-raised rounded-full p-1">
        {DURATION_OPTIONS.map((d) => {
          const tooLong = d > maxDuration;
          const selected = !customMode && duration === d;
          return (
            <motion.button
              key={d}
              onClick={() => {
                if (tooLong) return;
                setCustomMode(false);
                setDuration(d);
              }}
              whileTap={tooLong ? undefined : tap}
              disabled={tooLong}
              className={`flex-1 py-2 rounded-full text-sm font-medium disabled:opacity-30 ${
                selected ? "font-semibold" : "text-fg-faint"
              }`}
              style={selected ? { backgroundColor: color, color: onColor } : undefined}
            >
              {durationTrackLabel(d, selected)}
            </motion.button>
          );
        })}
        <motion.button
          onClick={() => {
            setCustomMode(true);
            setCustomH(String(Math.floor(duration / 60)));
            setCustomM(String(duration % 60));
          }}
          whileTap={tap}
          aria-label="Custom duration"
          className="flex-1 py-2 rounded-full flex items-center justify-center"
          style={
            customMode ? { backgroundColor: color, color: onColor } : { color: "var(--fg-faint)" }
          }
        >
          <MoreHorizontal size={18} />
        </motion.button>
      </div>

      {customMode && (
        <div className="flex items-center gap-2 mt-3 bg-surface-raised rounded-2xl px-4 py-3">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={customH}
            onChange={(e) => applyCustom(e.target.value, customM)}
            placeholder="0"
            className="w-12 bg-surface rounded-lg px-2 py-1.5 text-lg font-semibold text-center focus:outline-none"
          />
          <span className="text-fg-muted text-sm">hours</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={59}
            value={customM}
            onChange={(e) => applyCustom(customH, e.target.value)}
            placeholder="0"
            className="w-12 bg-surface rounded-lg px-2 py-1.5 text-lg font-semibold text-center focus:outline-none"
          />
          <span className="text-fg-muted text-sm">mins</span>
          <span className="ml-auto text-sm text-fg-faint tabular-nums">
            {formatDuration(duration)}
          </span>
        </div>
      )}

      <p className="text-xs text-fg-faint mt-2.5">
        Ends at <span className="tabular-nums">{endLabel}</span>
        {duration >= maxDuration && " — capped to stay on the same day"}
      </p>
    </div>
  );

  const durationBody = (
    <div>
      <label className="text-xs font-medium text-fg-muted mb-1.5 block">Duration</label>
      {durationField}
    </div>
  );

  const scheduleBody = (
    <div>
      {dateBody}
      {timeBody}
      <div className="mt-3">{durationBody}</div>
    </div>
  );

  const reminderChips = (
    <div className="wheel-col flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
      {REMINDER_OPTIONS.map((opt) => (
        <motion.button
          key={String(opt.value)}
          onClick={() => pickReminder(opt.value)}
          whileTap={tap}
          className={chipCls(reminder === opt.value)}
        >
          {opt.label}
        </motion.button>
      ))}
    </div>
  );

  const reminderBody = (
    <div>
      <label className="text-xs font-medium text-fg-muted mb-1.5 block">Reminder</label>
      {reminderChips}
    </div>
  );

  const typeCards = (
    <div>
      <label className="text-xs font-medium text-fg-muted mb-2 block">This is a…</label>
      <div className="flex flex-col gap-2">
        {(["task", "habit"] as const).map((m) => {
          const selected = mode === m;
          return (
            <motion.button
              key={m}
              onClick={() => setMode(m)}
              whileTap={tap}
              className={`w-full flex items-center gap-3 p-3 rounded-2xl border text-left ${selected ? "border-surface-inverse bg-surface-alt" : "border-border-strong"}`}
            >
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                style={{
                  backgroundColor: selected ? color : "var(--surface-raised)",
                  color: selected ? onColor : "var(--fg-muted)",
                }}
              >
                {m === "task" ? <CheckCircle2 size={18} /> : <Repeat size={18} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-fg">
                  {m === "task" ? "One-time task" : "Repeating habit"}
                </p>
                <p className="text-xs text-fg-faint">
                  {m === "task"
                    ? "Happens once on the chosen date"
                    : "Repeats on the days you pick"}
                </p>
              </div>
              {selected && <Check size={18} className="text-fg shrink-0" />}
            </motion.button>
          );
        })}
      </div>

      {isEditing && mode !== editItem!.type && (
        <p className="text-xs text-fg-faint mt-2 px-1">
          {mode === "habit"
            ? "Saving will convert this into a repeating habit."
            : "Saving will convert this into a one-time task — the repeat schedule and its history will be removed."}
        </p>
      )}
    </div>
  );

  const priorityButtons = (
    <div className="flex gap-2">
      {PRIORITIES.map((p) => {
        const meta = PRIORITY_META[p];
        const selected = priority === p;
        return (
          <motion.button
            key={p}
            onClick={() => setPriority(selected ? null : p)}
            whileTap={tap}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-2xl border text-sm font-medium"
            style={
              selected
                ? {
                    borderColor: meta.color,
                    backgroundColor: `${meta.color}1a`,
                    color: meta.color,
                  }
                : { borderColor: "var(--border-strong)", color: "var(--fg-muted)" }
            }
          >
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: meta.color }} />
            {meta.label}
          </motion.button>
        );
      })}
    </div>
  );

  const workoutLinkBody = workoutSessions.length > 0 && (
    <div>
      <label className="text-xs font-medium text-fg-muted mb-2 flex items-center gap-1.5">
        <Dumbbell size={13} />
        Link a workout (optional)
      </label>
      <div className="wheel-col flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
        <motion.button
          onClick={() => linkWorkout(undefined)}
          whileTap={tap}
          className={chipCls(!workoutSessionId)}
        >
          None
        </motion.button>
        {workoutSessions.map((s) => {
          const SIcon = WORKOUT_TYPE_META[s.type].icon;
          return (
            <motion.button
              key={s.id}
              onClick={() => linkWorkout(s.id)}
              whileTap={tap}
              className={`flex items-center gap-1.5 ${chipCls(workoutSessionId === s.id)}`}
            >
              <SIcon size={14} />
              {s.name}
            </motion.button>
          );
        })}
      </div>

      {linkedSession && (
        <div className="mt-3 rounded-2xl bg-surface-alt p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-fg-muted">What you'll do</p>
            <motion.button
              onClick={() => {
                openWorkoutSession(linkedSession.id);
                onClose();
              }}
              whileTap={tap}
              className="flex items-center gap-1 text-xs font-medium"
              style={{ color }}
            >
              Open in Workout
              <ArrowUpRight size={14} />
            </motion.button>
          </div>
          {linkedSession.exercises.length === 0 ? (
            <p className="text-sm text-fg-faint">No exercises added to this session yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {linkedSession.exercises.map((ex, i) => (
                <div key={ex.id} className="flex items-baseline gap-2">
                  <span className="text-xs text-fg-faint tabular-nums shrink-0 w-4">{i + 1}.</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-fg leading-tight">{ex.name}</p>
                    {exerciseSummary(ex, linkedSession.type) && (
                      <p className="text-xs text-fg-faint">
                        {exerciseSummary(ex, linkedSession.type)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  const recipeLinkBody = recipes.length > 0 && (
    <div>
      <label className="text-xs font-medium text-fg-muted mb-2 flex items-center gap-1.5">
        <ChefHat size={13} />
        Link a recipe (optional)
      </label>
      <div className="wheel-col flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
        <motion.button
          onClick={() => linkRecipe(undefined)}
          whileTap={tap}
          className={chipCls(!recipeId)}
        >
          None
        </motion.button>
        {recipes.map((r) => (
          <motion.button
            key={r.id}
            onClick={() => linkRecipe(r.id)}
            whileTap={tap}
            className={`flex items-center gap-1.5 ${chipCls(recipeId === r.id)}`}
          >
            <ChefHat size={14} />
            {r.name}
          </motion.button>
        ))}
      </div>

      {linkedRecipe && (
        <div className="mt-3 rounded-2xl bg-surface-alt p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-fg-muted">What to make</p>
            <motion.button
              onClick={() => {
                openRecipe(linkedRecipe.id);
                onClose();
              }}
              whileTap={tap}
              className="flex items-center gap-1 text-xs font-medium"
              style={{ color }}
            >
              Open in Recipes
              <ArrowUpRight size={14} />
            </motion.button>
          </div>

          {linkedRecipe.ingredients.length > 0 && (
            <p className="text-sm text-fg mb-2">
              {linkedRecipe.ingredients
                .map((ing) => {
                  const item = catalog[ing.itemId];
                  if (!item) return null;
                  return `${item.name} (${formatAmount(item, ing.servings)})`;
                })
                .filter(Boolean)
                .join(", ")}
            </p>
          )}

          {linkedRecipe.steps.length === 0 ? (
            <p className="text-sm text-fg-faint">No steps added to this recipe yet.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {linkedRecipe.steps.map((step, i) => (
                <div key={i} className="flex items-baseline gap-2">
                  <span className="text-xs text-fg-faint tabular-nums shrink-0 w-4">{i + 1}.</span>
                  <p className="text-sm text-fg leading-snug">{step}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  const repeatDaysBody = (
    <div className="flex gap-2">
      {DAY_OPTIONS.map(({ label, value }) => (
        <motion.button
          key={value}
          onClick={() => toggleDay(value)}
          whileTap={tap}
          className={`w-9 h-9 rounded-full text-sm font-medium ${daysOfWeek.includes(value) ? "bg-surface-inverse text-fg-inverse" : "bg-surface-raised text-fg-faint"}`}
        >
          {label}
        </motion.button>
      ))}
    </div>
  );

  // Wizard step 3 stacks the same pieces the edit sheet splits into rows.
  const typeLinksBody = (
    <div>
      {typeCards}
      {mode === "task" && (
        <div className="mt-4">
          <label className="text-xs font-medium text-fg-muted mb-2 block">Priority</label>
          {priorityButtons}
        </div>
      )}
      {workoutLinkBody && <div className="mt-4">{workoutLinkBody}</div>}
      {recipeLinkBody && <div className="mt-4">{recipeLinkBody}</div>}
      {mode === "habit" && (
        <div className="mt-4">
          <label className="text-xs font-medium text-fg-muted mb-2 block">Repeat on</label>
          {repeatDaysBody}
        </div>
      )}
    </div>
  );

  const saveDisabled =
    !title.trim() || duration < 1 || (mode === "habit" && daysOfWeek.length === 0);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <style>{".wheel-col::-webkit-scrollbar{display:none}"}</style>
          <motion.div
            className="fixed inset-0 bg-black/40 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed bottom-0 left-0 right-0 bg-surface rounded-t-2xl z-50 shadow-xl max-h-[92vh] overflow-y-auto"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={spring.snappy}
          >
            {/* Colored header — persists across steps */}
            <div className="px-4 pt-3 pb-5 rounded-t-2xl" style={{ backgroundColor: color }}>
              <div className="flex items-center justify-between">
                <motion.button
                  onClick={onClose}
                  whileTap={tap}
                  className="w-9 h-9 rounded-full flex items-center justify-center"
                  style={{
                    backgroundColor: isLightColor(color) ? "rgba(0,0,0,0.12)" : "rgba(0,0,0,0.25)",
                    color: onColor,
                  }}
                >
                  <X size={20} />
                </motion.button>
              </div>

              <div className="flex items-center gap-4 mt-3">
                {/* In edit mode the avatar becomes a tall pill (echoing the
                    timeline pills) and doubles as the way into the color/icon
                    pickers; the corner palette badge advertises it. */}
                <motion.button
                  onClick={() => isEditing && setStyleOpen((v) => !v)}
                  whileTap={isEditing ? tap : undefined}
                  className={`relative w-16 rounded-full border-[3px] border-white flex items-center justify-center shrink-0 ${isEditing ? "h-28" : "h-16"}`}
                  style={{ backgroundColor: "#2f2f33" }}
                >
                  <HeaderIcon size={28} style={{ color }} />
                  {isEditing && (
                    <span className="absolute -bottom-1 -left-1 w-7 h-7 rounded-full bg-white text-[#2f2f33] flex items-center justify-center shadow-sm">
                      {styleOpen ? <X size={14} /> : <Palette size={14} />}
                    </span>
                  )}
                </motion.button>
                <div className="flex-1 min-w-0">
                  {(isEditing || step > 1) && (
                    <p
                      className="text-sm mb-0.5 truncate"
                      style={{
                        color: isLightColor(color)
                          ? "rgba(17,24,39,0.7)"
                          : "rgba(255,255,255,0.85)",
                      }}
                    >
                      {rangeLabel(startMin, duration)} ({durationWords(duration)})
                    </p>
                  )}
                  <input
                    ref={titleRef}
                    type="text"
                    value={title}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    placeholder={mode === "task" ? "Task title" : "Habit title"}
                    className={`w-full bg-transparent text-2xl font-semibold border-b pb-1 focus:outline-none ${isLightColor(color) ? "placeholder-black/40" : "placeholder-white/50"}`}
                    style={{
                      color: onColor,
                      caretColor: onColor,
                      borderColor: isLightColor(color)
                        ? "rgba(17,24,39,0.3)"
                        : "rgba(255,255,255,0.5)",
                    }}
                  />
                  {isEditing && mode === "habit" && (
                    <Repeat
                      size={15}
                      className="mt-2"
                      style={{
                        color: isLightColor(color)
                          ? "rgba(17,24,39,0.7)"
                          : "rgba(255,255,255,0.85)",
                      }}
                    />
                  )}
                </div>
                {isEditing && (
                  <motion.button
                    onClick={toggleDone}
                    whileTap={tap}
                    aria-label={done ? "Mark as not completed" : "Mark as completed"}
                    className="w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0"
                    style={{
                      borderColor: onColor,
                      backgroundColor: done
                        ? isLightColor(color)
                          ? "rgba(0,0,0,0.12)"
                          : "rgba(0,0,0,0.25)"
                        : "transparent",
                      color: onColor,
                    }}
                  >
                    <AnimatePresence initial={false}>
                      {done && (
                        <motion.span
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          exit={{ scale: 0 }}
                          transition={spring.pop}
                          className="flex"
                        >
                          <Check size={16} />
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </motion.button>
                )}
              </div>
            </div>

            {/* Sheet body */}
            <div className="p-4 pb-6">
              {isEditing ? (
                /* ---- EDIT — value rows; tapping a row expands its editor ---- */
                <div className="flex flex-col gap-4">
                  <AnimatePresence initial={false}>
                    {styleOpen && (
                      <motion.div
                        key="style"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden -mb-4"
                      >
                        <div className="pb-4">{detailsBody}</div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* When it happens */}
                  <div className="rounded-2xl bg-surface-alt divide-y divide-border-strong overflow-hidden">
                    {mode === "task" && (
                      <FieldRow
                        icon={Calendar}
                        value={formatFullDate(date)}
                        hint={relativeDayLabel(date)}
                        onPress={() => setOpenRow("date")}
                      />
                    )}

                    <FieldRow
                      icon={Clock}
                      value={rangeLabel(startMin, duration)}
                      hint={durationWords(duration)}
                      onPress={() => setOpenRow("time")}
                    />

                    <FieldRow
                      icon={Repeat}
                      value={mode === "task" ? "One-time" : repeatSummary(daysOfWeek)}
                      onPress={() => setOpenRow("repeat")}
                    />

                    <FieldRow
                      icon={Bell}
                      value={reminder === null ? "No alert" : reminderLabel(reminder)}
                      muted={reminder === null}
                      onPress={() => setOpenRow("alert")}
                    />
                  </div>

                  {/* Extras */}
                  {(mode === "task" || workoutSessions.length > 0 || recipes.length > 0) && (
                    <div className="rounded-2xl bg-surface-alt divide-y divide-border-strong overflow-hidden">
                      {mode === "task" && (
                        <FieldRow
                          icon={Flag}
                          value={
                            priority ? `${PRIORITY_META[priority].label} priority` : "No priority"
                          }
                          muted={!priority}
                          onPress={() => setOpenRow("priority")}
                        />
                      )}
                      {(workoutSessions.length > 0 || recipes.length > 0) && (
                        <FieldRow
                          icon={Link2}
                          value={linkedSession?.name ?? linkedRecipe?.name ?? "No link"}
                          hint={linkedSession ? "Workout" : linkedRecipe ? "Recipe" : undefined}
                          muted={!linkedSession && !linkedRecipe}
                          onPress={() => setOpenRow("links")}
                        />
                      )}
                    </div>
                  )}

                  {linkSuggestion && !suggestDismissed && (
                    <div className="rounded-2xl bg-surface-alt p-3">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <p className="flex items-center gap-1.5 text-xs font-medium text-fg-muted">
                          {linkSuggestion === "workout" ? (
                            <Dumbbell size={13} />
                          ) : (
                            <ChefHat size={13} />
                          )}
                          {linkSuggestion === "workout"
                            ? "This looks like a workout — link a session?"
                            : "This looks like a meal — link a recipe?"}
                        </p>
                        <motion.button
                          onClick={() => setSuggestDismissed(true)}
                          whileTap={tap}
                          className="shrink-0 text-fg-faint"
                        >
                          <X size={15} />
                        </motion.button>
                      </div>
                      <div
                        className="wheel-col flex gap-2 overflow-x-auto"
                        style={{ scrollbarWidth: "none" }}
                      >
                        {linkSuggestion === "workout"
                          ? workoutSessions.map((s) => {
                              const SIcon = WORKOUT_TYPE_META[s.type].icon;
                              return (
                                <motion.button
                                  key={s.id}
                                  onClick={() => linkWorkout(s.id)}
                                  whileTap={tap}
                                  className={`flex items-center gap-1.5 ${chipCls(false)}`}
                                >
                                  <SIcon size={14} />
                                  {s.name}
                                </motion.button>
                              );
                            })
                          : recipes.map((r) => (
                              <motion.button
                                key={r.id}
                                onClick={() => linkRecipe(r.id)}
                                whileTap={tap}
                                className={`flex items-center gap-1.5 ${chipCls(false)}`}
                              >
                                <ChefHat size={14} />
                                {r.name}
                              </motion.button>
                            ))}
                      </div>
                    </div>
                  )}

                  <motion.button
                    onClick={handleSubmit}
                    whileTap={tap}
                    disabled={saveDisabled}
                    className="w-full rounded-full py-4 font-semibold disabled:opacity-40"
                    style={{ backgroundColor: color, color: onColor }}
                  >
                    {mode === "task" ? "Update Task" : "Update Habit"}
                  </motion.button>

                  <motion.button
                    onClick={handleDelete}
                    whileTap={tap}
                    className="mx-auto flex items-center gap-1.5 px-3 py-1 text-sm font-medium text-red-400"
                  >
                    <Trash2 size={15} />
                    Delete
                  </motion.button>
                </div>
              ) : (
                /* ---- CREATE — guided 3-step wizard ---- */
                <>
                  {/* Step dots */}
                  <div className="flex gap-1.5 justify-center mb-4">
                    {[1, 2, 3].map((s) => (
                      <span
                        key={s}
                        className={`h-1 rounded-full transition-all ${step === s ? "w-5 bg-surface-inverse" : "w-2 bg-surface-subtle"}`}
                      />
                    ))}
                  </div>

                  <AnimatePresence mode="wait" custom={dir} initial={false}>
                    {/* ---------------- STEP 1 — DETAILS ---------------- */}
                    {step === 1 && (
                      <motion.div
                        key="step1"
                        custom={dir}
                        variants={stepVariants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        transition={{ duration: 0.18 }}
                      >
                        {detailsBody}

                        <motion.button
                          onClick={() => goTo(2)}
                          whileTap={tap}
                          disabled={!title.trim()}
                          className="w-full rounded-2xl py-3.5 mt-6 font-medium disabled:opacity-40"
                          style={{ backgroundColor: color, color: onColor }}
                        >
                          Continue
                        </motion.button>
                      </motion.div>
                    )}

                    {/* ---------------- STEP 2 — SCHEDULE ---------------- */}
                    {step === 2 && (
                      <motion.div
                        key="step2"
                        custom={dir}
                        variants={stepVariants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        transition={{ duration: 0.18 }}
                      >
                        {scheduleBody}
                        <div className="mt-4">{reminderBody}</div>

                        <div className="flex gap-2 mt-6">
                          <motion.button
                            onClick={() => goTo(1)}
                            whileTap={tap}
                            className="px-5 rounded-2xl py-3.5 font-medium bg-surface-raised text-fg-muted"
                          >
                            Back
                          </motion.button>
                          <motion.button
                            onClick={() => goTo(3)}
                            whileTap={tap}
                            disabled={duration < 1 || startMin + duration > MINUTES_PER_DAY}
                            className="flex-1 rounded-2xl py-3.5 font-medium disabled:opacity-40"
                            style={{ backgroundColor: color, color: onColor }}
                          >
                            Continue
                          </motion.button>
                        </div>
                      </motion.div>
                    )}

                    {/* ---------------- STEP 3 — CONFIRM ---------------- */}
                    {step === 3 && (
                      <motion.div
                        key="step3"
                        custom={dir}
                        variants={stepVariants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        transition={{ duration: 0.18 }}
                      >
                        {/* Summary preview */}
                        <div className="flex items-center gap-3 bg-surface-alt rounded-2xl p-3 mb-5">
                          <div
                            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                            style={{ backgroundColor: color, color: onColor }}
                          >
                            <HeaderIcon size={18} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs text-fg-faint">
                              {rangeLabel(startMin, duration)} · {relativeDayLabel(date)}
                            </p>
                            <p className="font-semibold text-fg truncate">
                              {title.trim() || "Untitled"}
                            </p>
                          </div>
                        </div>

                        {typeLinksBody}

                        <div className="flex gap-2 mt-6">
                          <motion.button
                            onClick={() => goTo(2)}
                            whileTap={tap}
                            className="px-5 rounded-2xl py-3.5 font-medium bg-surface-raised text-fg-muted"
                          >
                            Back
                          </motion.button>
                          <motion.button
                            onClick={handleSubmit}
                            whileTap={tap}
                            disabled={saveDisabled}
                            className="flex-1 rounded-2xl py-3.5 font-medium disabled:opacity-40"
                            style={{ backgroundColor: color, color: onColor }}
                          >
                            {mode === "task" ? "Add task" : "Add habit"}
                          </motion.button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              )}
            </div>
          </motion.div>

          {/* Field editor panel — tapping a value row slides this up over the
              sheet; edits apply live, Done just dismisses it. */}
          <AnimatePresence>
            {isEditing && openRow && (
              <>
                <motion.div
                  className="fixed inset-0 bg-black/30 z-60"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                  onClick={() => setOpenRow(null)}
                />
                <motion.div
                  key={openRow}
                  className="fixed bottom-0 left-0 right-0 bg-surface rounded-t-2xl z-70 shadow-xl max-h-[80vh] overflow-y-auto"
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "100%" }}
                  transition={spring.gentle}
                >
                  <div className="sticky top-0 bg-surface rounded-t-2xl flex items-center justify-between px-4 pt-3 pb-2">
                    <h3 className="text-base font-semibold text-fg">
                      {FIELD_PANEL_TITLES[openRow]}
                    </h3>
                    <motion.button
                      onClick={() => setOpenRow(null)}
                      whileTap={tap}
                      className="h-8 px-3.5 rounded-full text-sm font-medium"
                      style={{ backgroundColor: color, color: onColor }}
                    >
                      Done
                    </motion.button>
                  </div>
                  <div className="px-4 pb-8 pt-1">
                    {openRow === "date" && (
                      <CalendarMonth
                        value={date}
                        color={color}
                        onChange={setDate}
                        markers={dayMarkers}
                      />
                    )}
                    {openRow === "time" && (
                      <div>
                        <TimeWheel
                          value={time}
                          durationMinutes={duration}
                          color={color}
                          onChange={handleTimeChange}
                          visibleRows={5}
                        />
                        <p className="text-base font-semibold text-fg mt-5 mb-2">Duration</p>
                        {durationField}
                      </div>
                    )}
                    {openRow === "repeat" && (
                      <div>
                        {typeCards}
                        {mode === "habit" && (
                          <div className="mt-4">
                            <label className="text-xs font-medium text-fg-muted mb-2 block">
                              Repeat on
                            </label>
                            {repeatDaysBody}
                          </div>
                        )}
                      </div>
                    )}
                    {openRow === "alert" && reminderChips}
                    {openRow === "priority" && priorityButtons}
                    {openRow === "links" && (
                      <div className="flex flex-col gap-4">
                        {workoutLinkBody}
                        {recipeLinkBody}
                      </div>
                    )}
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </>
      )}
    </AnimatePresence>
  );
}

// Month-grid date picker for the edit sheet's Date panel: month navigation,
// the selected day filled in the item's color, today tinted in it, and up to
// three dots per day marking items already scheduled there.
function CalendarMonth({
  value,
  color,
  onChange,
  markers,
}: {
  value: string;
  color: string;
  onChange: (iso: string) => void;
  markers: (iso: string) => string[];
}) {
  const selected = isoToDate(value);
  const [view, setView] = useState(() => new Date(selected.getFullYear(), selected.getMonth(), 1));
  // +1 sliding forward, -1 back — drives which side the next month enters from.
  const [dir, setDir] = useState(0);
  const todayIso = toISODate(new Date());
  const y = view.getFullYear();
  const m = view.getMonth();
  const firstWeekday = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const onSelColor = isLightColor(color) ? "#111827" : "#ffffff";

  function shiftMonth(delta: number) {
    setDir(delta);
    setView(new Date(y, m + delta, 1));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xl font-bold text-fg">
          {MONTH_NAMES[m]} <span style={{ color }}>{y}</span>
        </p>
        <div className="flex gap-2">
          <motion.button
            onClick={() => shiftMonth(-1)}
            whileTap={tap}
            aria-label="Previous month"
            className="w-9 h-9 rounded-full bg-surface-raised flex items-center justify-center text-fg-muted"
          >
            <ChevronLeft size={18} />
          </motion.button>
          <motion.button
            onClick={() => shiftMonth(1)}
            whileTap={tap}
            aria-label="Next month"
            className="w-9 h-9 rounded-full bg-surface-raised flex items-center justify-center text-fg-muted"
          >
            <ChevronRight size={18} />
          </motion.button>
        </div>
      </div>

      <div className="grid grid-cols-7 mb-1">
        {DAY_NAMES.map((d) => (
          <span key={d} className="text-center text-sm text-fg-faint">
            {d}
          </span>
        ))}
      </div>

      <div className="relative overflow-x-clip">
        <AnimatePresence mode="popLayout" custom={dir} initial={false}>
          <motion.div
            key={`${y}-${m}`}
            custom={dir}
            variants={monthVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="grid grid-cols-7 gap-y-1"
          >
            {Array.from({ length: firstWeekday }, (_, i) => (
              <span key={`pad-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const iso = toISODate(new Date(y, m, i + 1));
              const isSelected = iso === value;
              const isToday = iso === todayIso;
              const dots = markers(iso).slice(0, 3);
              return (
                <button
                  key={iso}
                  onClick={() => onChange(iso)}
                  className="flex flex-col items-center gap-1 py-0.5"
                >
                  <span
                    className="w-9 h-9 rounded-full flex items-center justify-center text-base font-semibold"
                    style={
                      isSelected
                        ? { backgroundColor: color, color: onSelColor }
                        : { color: isToday ? color : "var(--fg)" }
                    }
                  >
                    {i + 1}
                  </span>
                  <span className="flex gap-0.5 h-1.5">
                    {dots.map((c, j) => (
                      <span
                        key={j}
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </span>
                </button>
              );
            })}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

// One tappable value row of the edit sheet: icon, current value, optional
// hint on the right, and a chevron; tapping slides that field's editor panel
// up from the bottom.
function FieldRow({
  icon: IconComp,
  value,
  hint,
  muted = false,
  onPress,
}: {
  icon: typeof Calendar;
  value: string;
  hint?: string;
  muted?: boolean;
  onPress: () => void;
}) {
  return (
    <button onClick={onPress} className="w-full flex items-center gap-3 px-4 py-3.5 text-left">
      <IconComp size={18} className="text-fg-muted shrink-0" />
      <span
        className={`flex-1 min-w-0 truncate text-[15px] font-medium ${muted ? "text-fg-faint" : "text-fg"}`}
      >
        {value}
      </span>
      {hint && <span className="text-sm text-fg-faint shrink-0">{hint}</span>}
      <ChevronRight size={16} className="text-fg-faint shrink-0" />
    </button>
  );
}
