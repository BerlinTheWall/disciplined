/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-hooks/immutability */
/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  Calendar,
  Check,
  CheckCircle2,
  ChefHat,
  ChevronRight,
  Clock,
  Copy,
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

import {
  chipCls,
  COLOR_OPTIONS,
  DAY_OPTIONS,
  DURATION_OPTIONS,
  durationTrackLabel,
  MINUTES_PER_DAY,
  ordinalLabel,
  repeatSummary,
} from "./addItemOptions";
import CalendarMonth from "./CalendarMonth";
import { FieldPanel, FieldRow, type EditRowKey } from "./FieldPanel";
import { GoalLinkSection } from "./GoalLinkSection";
import { RecipeLinkSection, WorkoutLinkSection } from "./LinkSections";
import type { EditItem } from "./Timeline";
import TimeWheel from "./TimeWheel";
import NumberWheel from "@/components/NumberWheel";
import { useAutoFocus } from "@/hooks/useAutoFocus";
import { isLightColor } from "@/lib/color";
import { formatFullDate, relativeDayLabel } from "@/lib/date";
import { anchorDay } from "@/lib/habits";
import { guessIcon, guessLinkKind, ICONS } from "@/lib/icons";
import { spring, tap } from "@/lib/motion";
import { PRIORITIES, PRIORITY_META } from "@/lib/priority";
import {
  notifyPermission,
  REMINDER_OPTIONS,
  reminderLabel,
  requestNotifyPermission,
} from "@/lib/reminders";
import {
  durationWords,
  formatDuration,
  formatTimeLabel,
  rangeLabel,
  timeStringToMinutes,
} from "@/lib/time";
import { WORKOUT_TYPE_META } from "@/lib/workout";
import { useGoalFocusStore } from "@/store/goalFocusStore";
import { useGoalStore } from "@/store/goalStore";
import { useHabitStore } from "@/store/habitStore";
import { useRecipeStore } from "@/store/recipeStore";
import { useSettingsStore } from "@/store/settingsStore";
import { useTaskStore } from "@/store/taskStore";
import { useWorkoutStore } from "@/store/workoutStore";
import type { Priority } from "@/types/task";
import BottomSheet from "../BottomSheet";
import Collapse from "../Collapse";
import { useChoose, useConfirm } from "../ConfirmDialog";

/* ---- step slide animation ---------------------------------------- */

const stepVariants = {
  enter: (d: number) => ({ x: d > 0 ? 32 : -32, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (d: number) => ({ x: d > 0 ? -32 : 32, opacity: 0 }),
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
  const workoutSessions = useWorkoutStore((s) => s.sessions);
  const recipes = useRecipeStore((s) => s.recipes);
  const confirm = useConfirm();
  const choose = useChoose();

  const isEditing = !!editItem;
  const titleRef = useRef<HTMLInputElement>(null);
  // Adding starts with typing a title, so the keyboard opens itself; editing
  // usually tweaks time/duration, so it must not (the only auto-open keyboard
  // in the app, by design).
  useAutoFocus(titleRef, isOpen && !isEditing);

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
  const [freq, setFreq] = useState<"weekly" | "monthly">("weekly");
  const [repeatInterval, setRepeatInterval] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [workoutSessionId, setWorkoutSessionId] = useState<string | undefined>(undefined);
  const [recipeId, setRecipeId] = useState<string | undefined>(undefined);
  const [priority, setPriority] = useState<Priority | null>(null);
  const [goalLink, setGoalLink] = useState<string | null>(null);
  const [goalWeight, setGoalWeight] = useState<number | null>(null);
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
      setTime(formatTimeLabel(editItem.data.startMinutes));
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
      setFreq(editItem.type === "habit" ? (editItem.data.freq ?? "weekly") : "weekly");
      setRepeatInterval(editItem.type === "habit" ? (editItem.data.interval ?? 1) : 1);
      setDayOfMonth(
        dayOfMonthOf(
          editItem.type === "habit" ? editItem.data.anchorDate : undefined,
          new Date(selectedDate + "T00:00:00").getDate()
        )
      );
      setWorkoutSessionId(editItem.data.workoutSessionId ?? undefined);
      setRecipeId(editItem.data.recipeId ?? undefined);
      setPriority(editItem.type === "task" ? (editItem.data.priority ?? null) : null);
      const linkedGoal =
        editItem.type === "task"
          ? useGoalStore.getState().goals.find((g) => g.taskIds.includes(editItem.data.id))
          : undefined;
      setGoalLink(linkedGoal?.id ?? null);
      setGoalWeight(linkedGoal?.taskWeights?.[editItem.data.id] ?? null);
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
    setFreq("weekly");
    setRepeatInterval(1);
    setWorkoutSessionId(undefined);
    setRecipeId(undefined);
    setPriority(null);
    // Pre-link when the sheet was opened from a goal's "Add task".
    setGoalLink(useGoalFocusStore.getState().consume());
    setGoalWeight(null);
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

  // Monthly is capped lower than weekly so a 7-occurrence streak/rate window
  // never spans more than ~7 years (stays inside the ~10yr day-walk guard in
  // lib/habits.ts and lib/insights.ts).
  function clampInterval(value: number, f: "weekly" | "monthly") {
    return Math.min(f === "monthly" ? 12 : 24, Math.max(1, value));
  }

  function changeFreq(next: "weekly" | "monthly") {
    // First time switching to monthly, default the day to today's — a
    // sensible starting point, same spirit as the weekday grid defaulting to
    // every day.
    if (next === "monthly" && freq !== "monthly") {
      setDayOfMonth(new Date(date + "T00:00:00").getDate());
    }
    setFreq(next);
    setRepeatInterval((v) => clampInterval(v, next));
  }

  // Day-of-month parsed from an existing habit's anchorDate, falling back
  // when there isn't one yet (a fresh habit) or it's unparseable.
  function dayOfMonthOf(anchorDate: string | null | undefined, fallback: number): number {
    return anchorDay(anchorDate) ?? fallback;
  }

  // anchorDate is a plain string with no DB date-type enforcement, so it must
  // always be a syntactically valid calendar date — "2026-04-31" would crash
  // both the frontend and backend occurrence math. Resolves the picked day to
  // the nearest month (starting from `fromDate`) that actually contains it;
  // a day 1-31 is guaranteed to exist within 12 months.
  function resolveMonthlyAnchor(day: number, fromDate: string): string {
    const base = new Date(fromDate + "T00:00:00");
    for (let i = 0; i < 12; i++) {
      const y = base.getFullYear();
      const m = base.getMonth() + i;
      const daysInThatMonth = new Date(y, m + 1, 0).getDate();
      if (day <= daysInThatMonth) {
        const wrappedMonth = ((m % 12) + 12) % 12;
        const wrappedYear = y + Math.floor(m / 12);
        return `${wrappedYear}-${String(wrappedMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      }
    }
    return fromDate; // unreachable — every day 1-31 fits within 12 months
  }

  async function handleSubmit() {
    if (!title.trim() || duration < 1) return;
    const startMinutes = timeStringToMinutes(time);
    if (startMinutes + duration > MINUTES_PER_DAY) return;

    // Only load-bearing when interval>1 or monthly; NULL for a plain weekly
    // habit, matching the backend's "no anchor = original weekday model"
    // shortcut. Preserves an existing habit's original anchor month when just
    // tweaking other fields, so an interval>1 phase or a monthly habit's
    // cycle doesn't silently reset each time it's edited.
    const needsAnchor = freq === "monthly" || repeatInterval > 1;
    const existingAnchor =
      isEditing && editItem!.type === "habit" ? editItem!.data.anchorDate : undefined;
    const anchorDate = !needsAnchor
      ? null
      : freq === "monthly"
        ? resolveMonthlyAnchor(dayOfMonth, existingAnchor ?? date)
        : existingAnchor || date;

    // Type changed while editing: create the item on the other side, then
    // remove the original. Each store syncs its own create/delete.
    if (isEditing && mode !== editItem!.type) {
      if (mode === "habit") {
        if (freq === "weekly" && daysOfWeek.length === 0) return;
        addHabit({
          title: title.trim(),
          startMinutes,
          durationMinutes: duration,
          color,
          icon,
          daysOfWeek,
          freq,
          interval: repeatInterval,
          anchorDate,
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
      if (editItem!.type === "habit" && freq === "weekly" && daysOfWeek.length === 0) return;
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
        useGoalStore.getState().linkTask(goalLink, editItem!.data.id);
        if (goalLink)
          useGoalStore.getState().setTaskWeight(goalLink, editItem!.data.id, goalWeight);
      } else {
        updateHabit(editItem!.data.id, {
          title: title.trim(),
          startMinutes,
          durationMinutes: duration,
          color,
          icon,
          daysOfWeek,
          freq,
          interval: repeatInterval,
          anchorDate,
          reminderMinutesBefore: reminder,
          workoutSessionId: workoutSessionId ?? null,
          recipeId: recipeId ?? null,
        });
      }
    } else {
      if (mode === "task") {
        const newTaskId = addTask({
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
        useGoalStore.getState().linkTask(goalLink, newTaskId);
        if (goalLink) useGoalStore.getState().setTaskWeight(goalLink, newTaskId, goalWeight);
      } else {
        if (freq === "weekly" && daysOfWeek.length === 0) return;
        addHabit({
          title: title.trim(),
          startMinutes,
          durationMinutes: duration,
          color,
          icon,
          daysOfWeek,
          freq,
          interval: repeatInterval,
          anchorDate,
          reminderMinutesBefore: reminder,
          workoutSessionId,
          recipeId,
        });
      }
    }
    onClose();
  }

  // Copies the task as currently shown in the form — including unsaved edits —
  // as a new, uncompleted task. The editor stays open (so several copies can
  // be made in a row); the original keeps its saved state (the user chose
  // Duplicate, not Update).
  function handleDuplicate() {
    if (!editItem || editItem.type !== "task" || mode !== "task") return;
    if (!title.trim() || duration < 1) return;
    const startMinutes = timeStringToMinutes(time);
    if (startMinutes + duration > MINUTES_PER_DAY) return;
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
  const endLabel = endMin >= MINUTES_PER_DAY ? "midnight" : formatTimeLabel(endMin);
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

      <Collapse open={customMode}>
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
      </Collapse>

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

      <Collapse open={isEditing && mode !== editItem?.type}>
        <p className="text-xs text-fg-faint mt-2 px-1">
          {mode === "habit"
            ? "Saving will convert this into a repeating habit."
            : "Saving will convert this into a one-time task — the repeat schedule and its history will be removed."}
        </p>
      </Collapse>
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

  const repeatBody = (
    <div>
      <div className="flex gap-2 mb-4">
        {(["weekly", "monthly"] as const).map((f) => (
          <motion.button
            key={f}
            onClick={() => changeFreq(f)}
            whileTap={tap}
            className={chipCls(freq === f)}
          >
            {f === "weekly" ? "Weekly" : "Monthly"}
          </motion.button>
        ))}
      </div>

      <label className="text-xs font-medium text-fg-muted mb-2 block">
        Every {repeatInterval} {freq === "weekly" ? "week" : "month"}
        {repeatInterval === 1 ? "" : "s"}
      </label>
      <NumberWheel
        min={1}
        max={freq === "monthly" ? 12 : 24}
        value={repeatInterval}
        onChange={(n) => setRepeatInterval(clampInterval(n, freq))}
        color={color}
        formatLabel={(n) => `${n} ${freq === "weekly" ? "week" : "month"}${n === 1 ? "" : "s"}`}
        visibleRows={3}
      />

      {freq === "weekly" && (
        <div className="flex gap-2 mt-4">
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
      )}

      {freq === "monthly" && (
        <div className="mt-4">
          <label className="text-xs font-medium text-fg-muted mb-2 block">
            On the {ordinalLabel(dayOfMonth)}
          </label>
          <NumberWheel
            min={1}
            max={31}
            value={dayOfMonth}
            onChange={setDayOfMonth}
            color={color}
            formatLabel={ordinalLabel}
            visibleRows={3}
          />
          {dayOfMonth >= 29 && (
            <p className="text-xs text-fg-faint mt-2">Falls on the last day in shorter months.</p>
          )}
        </div>
      )}
    </div>
  );

  // Wizard step 3 stacks the same pieces the edit sheet splits into rows.
  const typeLinksBody = (
    <div>
      {typeCards}
      <Collapse open={mode === "task"}>
        <div className="mt-4">
          <label className="text-xs font-medium text-fg-muted mb-2 block">Priority</label>
          {priorityButtons}
        </div>
      </Collapse>
      {workoutSessions.length > 0 && (
        <div className="mt-4">
          <WorkoutLinkSection
            workoutSessionId={workoutSessionId}
            onLink={linkWorkout}
            color={color}
            onSheetClose={onClose}
          />
        </div>
      )}
      {recipes.length > 0 && (
        <div className="mt-4">
          <RecipeLinkSection
            recipeId={recipeId}
            onLink={linkRecipe}
            color={color}
            onSheetClose={onClose}
          />
        </div>
      )}
      {mode === "task" && (
        <div className="mt-4">
          <GoalLinkSection
            goalId={goalLink}
            onLink={setGoalLink}
            weight={goalWeight}
            onWeight={setGoalWeight}
          />
        </div>
      )}
      <Collapse open={mode === "habit"}>
        <div className="mt-4">
          <label className="text-xs font-medium text-fg-muted mb-2 block">Repeat</label>
          {repeatBody}
        </div>
      </Collapse>
    </div>
  );

  const saveDisabled =
    !title.trim() ||
    duration < 1 ||
    (mode === "habit" && freq === "weekly" && daysOfWeek.length === 0);

  return (
    <>
      <BottomSheet
        isOpen={isOpen}
        onClose={onClose}
        className="bg-surface max-h-[92vh] overflow-y-auto"
      >
        <style>{".wheel-col::-webkit-scrollbar{display:none}"}</style>
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
                    color: isLightColor(color) ? "rgba(17,24,39,0.7)" : "rgba(255,255,255,0.85)",
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
                  borderColor: isLightColor(color) ? "rgba(17,24,39,0.3)" : "rgba(255,255,255,0.5)",
                }}
              />
              {isEditing && mode === "habit" && (
                <Repeat
                  size={15}
                  className="mt-2"
                  style={{
                    color: isLightColor(color) ? "rgba(17,24,39,0.7)" : "rgba(255,255,255,0.85)",
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
                  value={
                    mode === "task"
                      ? "One-time"
                      : repeatSummary(freq, repeatInterval, daysOfWeek, dayOfMonth)
                  }
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
                      value={priority ? `${PRIORITY_META[priority].label} priority` : "No priority"}
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

              {/* -mb-4/pb-4 cancel the stack's gap while collapsed so the
                      card's disappearance doesn't end with a spacing jump. */}
              <Collapse
                open={!!linkSuggestion && !suggestDismissed}
                outerClassName="-mb-4"
                className="pb-4"
              >
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
              </Collapse>

              <motion.button
                onClick={handleSubmit}
                whileTap={tap}
                disabled={saveDisabled}
                className="w-full rounded-full py-4 font-semibold disabled:opacity-40"
                style={{ backgroundColor: color, color: onColor }}
              >
                {mode === "task" ? "Update Task" : "Update Habit"}
              </motion.button>

              <div className="flex items-center justify-center gap-6">
                {editItem?.type === "task" && mode === "task" && (
                  <motion.button
                    onClick={handleDuplicate}
                    whileTap={tap}
                    disabled={saveDisabled}
                    className="flex items-center gap-1.5 px-3 py-1 text-sm font-medium text-fg-muted disabled:opacity-40"
                  >
                    <Copy size={15} />
                    Duplicate
                  </motion.button>
                )}
                <motion.button
                  onClick={handleDelete}
                  whileTap={tap}
                  className="flex items-center gap-1.5 px-3 py-1 text-sm font-medium text-red-400"
                >
                  <Trash2 size={15} />
                  Delete
                </motion.button>
              </div>
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
      </BottomSheet>

      {/* Field editor panel - tapping a value row slides this up over the
          sheet; edits apply live, Done just dismisses it. */}
      <FieldPanel
        openKey={isOpen && isEditing ? openRow : null}
        color={color}
        onColor={onColor}
        onClose={() => setOpenRow(null)}
      >
        {openRow === "date" && <CalendarMonth value={date} color={color} onChange={setDate} />}
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
            <Collapse open={mode === "habit"}>
              <div className="mt-4">
                <label className="text-xs font-medium text-fg-muted mb-2 block">Repeat</label>
                {repeatBody}
              </div>
            </Collapse>
          </div>
        )}
        {openRow === "alert" && reminderChips}
        {openRow === "priority" && priorityButtons}
        {openRow === "links" && (
          <div className="flex flex-col gap-4">
            <WorkoutLinkSection
              workoutSessionId={workoutSessionId}
              onLink={linkWorkout}
              color={color}
              onSheetClose={onClose}
            />
            <RecipeLinkSection
              recipeId={recipeId}
              onLink={linkRecipe}
              color={color}
              onSheetClose={onClose}
            />
            {mode === "task" && (
              <GoalLinkSection
                goalId={goalLink}
                onLink={setGoalLink}
                weight={goalWeight}
                onWeight={setGoalWeight}
              />
            )}
          </div>
        )}
      </FieldPanel>
    </>
  );
}
