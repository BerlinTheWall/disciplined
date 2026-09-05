/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Clock, Loader2, Plus, Repeat, Square, Volume2, X } from "lucide-react";
import { useShallow } from "zustand/shallow";

import { useReadAloud } from "@/hooks/useReadAloud";
import { prefetchAssistantVoice } from "@/hooks/useSpeech";
import { assistantDayBriefing } from "@/lib/assistantSpeech";
import { fetchBriefingScript } from "@/lib/briefing";
import { deleteSyncWarning } from "@/lib/calendarSync";
import { isLightColor } from "@/lib/color";
import { parseISODate, relativeDayLabel, todayISODate } from "@/lib/date";
import { isHabitActiveOnDate } from "@/lib/habits";
import { guessIcon, ICONS } from "@/lib/icons";
import { spring, tap } from "@/lib/motion";
import { BUILTIN_PRESETS, type TaskPreset } from "@/lib/presets";
import { formatDuration, formatTimeLabel, rangeLabel, timeStringToMinutes } from "@/lib/time";
import { useHabitStore } from "@/store/habitStore";
import { usePresetStore } from "@/store/presetStore";
import { useTaskStore } from "@/store/taskStore";
import BottomSheet from "../BottomSheet";
import { useConfirm } from "../ConfirmDialog";

const COLOR_OPTIONS = [
  "#34d399",
  "#60a5fa",
  "#fb923c",
  "#a78bfa",
  "#fbbf24",
  "#f472b6",
  "#22d3ee",
  "#a3e635",
  "#fb7185",
  "#f87171",
];
const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];
const MINUTES_PER_DAY = 1440;
const DEFAULT_START = 8 * 60;

interface PlanDaySheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function PlanDaySheet({ isOpen, onClose }: PlanDaySheetProps) {
  const [tasks, selectedDate, addTask, deleteTask] = useTaskStore(
    useShallow((state) => [state.tasks, state.selectedDate, state.addTask, state.deleteTask])
  );

  const confirm = useConfirm();
  const [userPresets, removePreset] = usePresetStore(
    useShallow((state) => [state.presets, state.removePreset])
  );
  const presets = [...BUILTIN_PRESETS, ...userPresets];
  const [habits, skipHabitOccurrence] = useHabitStore(
    useShallow((state) => [state.habits, state.skipHabitOccurrence])
  );

  const [title, setTitle] = useState("");
  const [time, setTime] = useState(formatTimeLabel(DEFAULT_START));
  const [duration, setDuration] = useState(30);
  const [colorIndex, setColorIndex] = useState(0);
  const { reading, loading, toggle } = useReadAloud();
  const inputRef = useRef<HTMLInputElement>(null);

  // Tasks already on this day, sorted — the live plan.
  const dayTasks = tasks
    .filter((t) => t.date === selectedDate)
    .sort((a, b) => a.startMinutes - b.startMinutes);

  // Habits landing on a given day: weekly recurrence minus explicitly skipped
  // occurrences.
  const habitsOn = (iso: string) =>
    habits.filter(
      (h) => isHabitActiveOnDate(h, parseISODate(iso)) && !h.skippedDates?.includes(iso)
    );
  const dayHabits = habitsOn(selectedDate).sort((a, b) => a.startMinutes - b.startMinutes);

  // The full plan the sheet shows: tasks and habit occurrences in time order.
  const dayItems = [
    ...dayTasks.map((t) => ({ kind: "task" as const, item: t })),
    ...dayHabits.map((h) => ({ kind: "habit" as const, item: h })),
  ].sort((a, b) => a.item.startMinutes - b.item.startMinutes);

  // Read the whole day out loud, assistant-style; tap again to stop. Also
  // stops when the sheet closes. While the sheet is open, an LLM-written
  // script (and its audio) is prepared in the background; the local template
  // stays as the fallback when the backend can't deliver.
  // The summary covers the whole day, not just the task list shown here:
  // habits active on this day ride along, and when the day is today the
  // current time (15-minute buckets, for caching) lets the script call out
  // passed-but-undone items.
  const briefingItems = [
    ...dayTasks.map((t) => ({
      title: t.title,
      startMinutes: t.startMinutes,
      durationMinutes: t.durationMinutes,
      completed: t.completed,
      kind: "task" as const,
    })),
    ...dayHabits.map((h) => ({
      title: h.title,
      startMinutes: h.startMinutes,
      durationMinutes: h.durationMinutes,
      completed: h.completedDates.includes(selectedDate),
      kind: "habit" as const,
    })),
  ].sort((a, b) => a.startMinutes - b.startMinutes);
  const briefNow =
    selectedDate === todayISODate()
      ? Math.floor((new Date().getHours() * 60 + new Date().getMinutes()) / 15) * 15
      : undefined;
  const briefing = assistantDayBriefing(briefingItems, relativeDayLabel(selectedDate), briefNow);
  const [script, setScript] = useState<string | null>(null);

  function toggleRead() {
    toggle(script ?? briefing, "briefing");
  }

  // Note: closing the sheet does NOT stop an in-progress reading — the
  // summary keeps talking while the user moves on; any speaker button (here
  // or on Home) stops it, since the read-aloud state is global.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const id = window.setTimeout(async () => {
      const s = await fetchBriefingScript(
        relativeDayLabel(selectedDate),
        briefingItems,
        [],
        briefNow
      );
      if (cancelled) return;
      setScript(s);
      prefetchAssistantVoice(s ?? briefing, 30_000, "briefing");
    }, 500);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [isOpen, briefing]);

  // Now, rounded up to the next 5-minute mark — the default start time.
  function roundedNowMinutes() {
    const now = new Date();
    const rounded = Math.ceil((now.getHours() * 60 + now.getMinutes()) / 5) * 5;
    return Math.min(rounded, MINUTES_PER_DAY - 15);
  }

  // When the sheet opens, seed the start time from the current time.
  useEffect(() => {
    if (!isOpen) return;
    setTitle("");
    setDuration(30);
    setColorIndex(0);
    setTime(formatTimeLabel(roundedNowMinutes()));
  }, [isOpen, selectedDate]);

  const startMin = timeStringToMinutes(time);
  const maxDuration = MINUTES_PER_DAY - startMin;
  const canAdd = !!title.trim() && duration >= 5 && startMin + duration <= MINUTES_PER_DAY;
  const color = COLOR_OPTIONS[colorIndex % COLOR_OPTIONS.length];

  function handleAdd() {
    if (!canAdd) return;
    addTask({
      title: title.trim(),
      startMinutes: startMin,
      durationMinutes: duration,
      color,
      icon: guessIcon(title) ?? "alarm",
      date: selectedDate,
    });
    // Chain the next task right after this one, but the user can still retime it.
    const nextStart = Math.min(startMin + duration, MINUTES_PER_DAY - 15);
    setTime(formatTimeLabel(nextStart));
    setColorIndex((i) => i + 1);
    setTitle("");
    inputRef.current?.focus();
  }

  // One-tap add for a preset — title/color/icon come from the preset, but
  // start time and duration come from the composer row below (same as a
  // manually typed task), so the user dials those in once and every preset
  // tap respects them.
  function addPresetTask(preset: TaskPreset) {
    addTask({
      title: preset.title,
      startMinutes: startMin,
      durationMinutes: duration,
      color: preset.color,
      icon: preset.icon,
      date: selectedDate,
      priority: preset.priority,
      reminderMinutesBefore: preset.reminderMinutesBefore,
    });
    // Chain the next task right after this one, same as handleAdd.
    setTime(formatTimeLabel(Math.min(startMin + duration, MINUTES_PER_DAY - 15)));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  }

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      className="bg-surface max-h-[92vh] flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-fg">Plan Your Day</h2>
          <p className="text-sm text-fg-faint">
            <span className="capitalize">{relativeDayLabel(selectedDate)}</span> · {dayItems.length}{" "}
            {dayItems.length === 1 ? "item" : "items"}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Hear the whole plan — compact speaker in the header; spins while
              the summary is prepared, becomes a stop square while reading. */}
          <motion.button
            onClick={toggleRead}
            whileTap={tap}
            aria-label={
              loading ? "Preparing summary" : reading ? "Stop reading" : "Read day summary"
            }
            className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
              reading || loading
                ? "bg-surface-inverse text-fg-inverse"
                : "bg-surface-raised text-fg-muted"
            }`}
          >
            {loading ? (
              <motion.span
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="flex"
              >
                <Loader2 size={16} />
              </motion.span>
            ) : reading ? (
              <Square size={13} />
            ) : (
              <Volume2 size={17} />
            )}
          </motion.button>
          <motion.button
            onClick={onClose}
            whileTap={tap}
            className="w-9 h-9 rounded-full bg-surface-raised text-fg-muted flex items-center justify-center"
          >
            <X size={20} />
          </motion.button>
        </div>
      </div>

      {/* Running plan list — tasks and this day's habit occurrences */}
      <div className="flex-1 overflow-y-auto px-4 min-h-[80px]">
        {dayItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-sm text-fg-faint">
              Type a task below and hit <span className="font-semibold text-fg-muted">Enter</span>{" "}
              to stack your day.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2 py-1">
            <AnimatePresence initial={false}>
              {dayItems.map(({ kind, item: t }) => {
                const Icon = ICONS[t.icon] ?? ICONS.default;
                return (
                  <motion.div
                    key={`${kind}:${t.id}`}
                    layout
                    initial={{ opacity: 0, y: -6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={spring.pop}
                    className="flex items-center gap-3 bg-surface-raised rounded-2xl px-3 py-2.5"
                  >
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                      style={{
                        backgroundColor: t.color,
                        color: isLightColor(t.color) ? "#111827" : "#fff",
                      }}
                    >
                      <Icon size={17} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-fg truncate">{t.title}</p>
                      <p className="flex items-center gap-1 text-xs text-fg-faint tabular-nums">
                        {kind === "habit" && <Repeat size={11} aria-label="Repeats weekly" />}
                        {rangeLabel(t.startMinutes, t.durationMinutes)}
                      </p>
                    </div>
                    <motion.button
                      onClick={async () => {
                        if (kind === "habit") {
                          const ok = await confirm({
                            title: "Remove from this day?",
                            message: `"${t.title}" repeats weekly — only this day's occurrence will be removed.`,
                            confirmLabel: "Remove",
                            destructive: true,
                          });
                          if (ok) skipHabitOccurrence(t.id, selectedDate);
                          return;
                        }
                        const ok = await confirm({
                          title: "Delete task?",
                          message: `"${t.title}" will be permanently removed.${kind === "task" ? deleteSyncWarning(t) : ""}`,
                          confirmLabel: "Delete",
                          destructive: true,
                        });
                        if (ok) deleteTask(t.id);
                      }}
                      whileTap={tap}
                      className="w-7 h-7 rounded-full text-fg-faint hover:text-fg flex items-center justify-center shrink-0"
                      aria-label="Remove task"
                    >
                      <X size={16} />
                    </motion.button>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Composer */}
      <div
        className="border-t border-border-strong bg-surface px-4 pt-3"
        style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }}
      >
        {/* One-tap presets — added straight to the running list above */}
        {presets.length > 0 && (
          <div
            className="flex items-center gap-2 overflow-x-auto pb-2 -mx-1 px-1"
            style={{ scrollbarWidth: "none" }}
          >
            {presets.map((preset) => {
              const Icon = ICONS[preset.icon] ?? ICONS.default;
              const isCustom = !preset.id.startsWith("builtin-");
              return (
                <motion.button
                  key={preset.id}
                  type="button"
                  onClick={() => addPresetTask(preset)}
                  whileTap={tap}
                  className="relative flex items-center gap-2 pl-2 pr-3.5 py-2 rounded-full bg-surface-raised shrink-0"
                >
                  <span
                    className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                    style={{ backgroundColor: preset.color, color: "#111827" }}
                  >
                    <Icon size={13} />
                  </span>
                  <span className="text-sm font-medium text-fg whitespace-nowrap">
                    {preset.title}
                  </span>
                  {isCustom && (
                    <motion.span
                      role="button"
                      aria-label={`Remove ${preset.title} preset`}
                      onClick={(e) => {
                        e.stopPropagation();
                        removePreset(preset.id);
                      }}
                      whileTap={tap}
                      className="ml-0.5 w-4 h-4 rounded-full bg-fg/10 flex items-center justify-center shrink-0 text-fg-faint"
                    >
                      <X size={10} />
                    </motion.span>
                  )}
                </motion.button>
              );
            })}
          </div>
        )}

        {/* Title + add */}
        <div className="flex items-center gap-2 mb-3">
          <input
            ref={inputRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add a task…"
            className="flex-1 bg-surface-raised rounded-2xl px-4 py-3 text-base text-fg placeholder-fg-faint focus:outline-none"
          />
          <motion.button
            onClick={handleAdd}
            whileTap={canAdd ? tap : undefined}
            disabled={!canAdd}
            className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 disabled:opacity-40"
            style={{
              backgroundColor: color,
              color: isLightColor(color) ? "#111827" : "#fff",
            }}
          >
            <Plus size={24} strokeWidth={2.5} />
          </motion.button>
        </div>

        {/* Quick time + duration */}
        <div
          className="flex items-center gap-2 overflow-x-auto pb-1"
          style={{ scrollbarWidth: "none" }}
        >
          <label className="relative flex items-center gap-1.5 bg-surface-raised rounded-full pl-3 pr-2 py-2 shrink-0">
            <Clock size={15} className="text-fg-faint" />
            <span className="text-sm font-medium text-fg tabular-nums">
              {formatTimeLabel(startMin)}
            </span>
            <input
              type="time"
              value={time}
              onChange={(e) => e.target.value && setTime(e.target.value)}
              className="absolute inset-0 opacity-0 w-full h-full"
            />
          </label>
          <span className="text-fg-faint shrink-0">·</span>
          {DURATION_OPTIONS.map((d) => {
            const tooLong = d > maxDuration;
            const selected = duration === d;
            return (
              <motion.button
                key={d}
                onClick={() => !tooLong && setDuration(d)}
                whileTap={tooLong ? undefined : tap}
                disabled={tooLong}
                className={`px-3.5 py-2 rounded-full text-sm font-medium shrink-0 disabled:opacity-30 ${
                  selected
                    ? "bg-surface-inverse text-fg-inverse"
                    : "bg-surface-raised text-fg-muted"
                }`}
              >
                {formatDuration(d)}
              </motion.button>
            );
          })}
        </div>
      </div>
    </BottomSheet>
  );
}
