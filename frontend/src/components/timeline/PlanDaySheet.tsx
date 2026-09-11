/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Clock, Info, Loader2, Lock, Plus, Repeat, Square, Star, Volume2, X } from "lucide-react";
import { createPortal } from "react-dom";
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
import {
  MAX_PRESETS,
  PRESETS_LOCKED_DIALOG,
  PRESETS_MIN_TIER,
  type TaskPreset,
} from "@/lib/presets";
import { useHasTier } from "@/lib/tiers";
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

// A small ⓘ that opens a short explanation in a floating popup. The popup is
// portalled to <body> and positioned from the icon's screen rect: the sheet
// panel is transformed (it springs up), which would otherwise make `fixed`
// relative to the panel and let its scroll areas clip the popup. It opens
// below the icon, flipping above when there's no room, and closes on any tap
// outside or Escape.
function InfoPopover({
  open,
  onOpenChange,
  title,
  size = 16,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  size?: number;
  children: React.ReactNode;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; above: boolean } | null>(null);
  const width = Math.min(280, window.innerWidth - 32);

  // Measure before paint, so the popup never flashes at a stale position.
  useLayoutEffect(() => {
    if (!open || !btnRef.current || !popRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const h = popRef.current.offsetHeight;
    const left = Math.min(Math.max(16, r.left - 8), window.innerWidth - 16 - width);
    const above = r.bottom + 8 + h > window.innerHeight - 16;
    setPos({ top: above ? r.top - 8 - h : r.bottom + 8, left, above });
  }, [open, width]);

  useEffect(() => {
    if (!open) return;
    const close = () => onOpenChange(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <>
      <motion.button
        ref={btnRef}
        type="button"
        onClick={() => onOpenChange(!open)}
        whileTap={tap}
        aria-label={`About ${title}`}
        aria-expanded={open}
        className={`w-7 h-7 -my-1 rounded-full flex items-center justify-center shrink-0 transition-colors ${
          open ? "text-fg" : "text-fg-faint"
        }`}
      >
        <Info size={size} />
      </motion.button>
      {createPortal(
        <AnimatePresence>
          {open && (
            // Transparent catcher: a tap anywhere outside closes the popup.
            <motion.div className="fixed inset-0 z-60" onClick={() => onOpenChange(false)}>
              <motion.div
                ref={popRef}
                role="dialog"
                aria-label={title}
                onClick={(e) => e.stopPropagation()}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className="fixed rounded-2xl bg-surface-card border border-border-strong shadow-card px-4 py-3"
                style={{
                  top: pos?.top ?? 0,
                  left: pos?.left ?? 0,
                  width,
                  visibility: pos ? "visible" : "hidden",
                  transformOrigin: pos?.above ? "bottom left" : "top left",
                }}
              >
                <p className="text-sm font-semibold text-fg mb-1">{title}</p>
                <p className="text-sm text-fg-muted leading-snug">{children}</p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}

export default function PlanDaySheet({ isOpen, onClose }: PlanDaySheetProps) {
  const [tasks, selectedDate, addTask, deleteTask] = useTaskStore(
    useShallow((state) => [state.tasks, state.selectedDate, state.addTask, state.deleteTask])
  );

  const confirm = useConfirm();
  const [presets, removePreset] = usePresetStore(
    useShallow((state) => [state.presets, state.removePreset])
  );
  const canUsePresets = useHasTier(PRESETS_MIN_TIER);
  const [habits, skipHabitOccurrence] = useHabitStore(
    useShallow((state) => [state.habits, state.skipHabitOccurrence])
  );

  const [title, setTitle] = useState("");
  const [time, setTime] = useState(formatTimeLabel(DEFAULT_START));
  const [duration, setDuration] = useState(30);
  const [colorIndex, setColorIndex] = useState(0);
  const [planInfo, setPlanInfo] = useState(false);
  const [presetInfo, setPresetInfo] = useState(false);
  const { reading, loading, toggle } = useReadAloud();
  const inputRef = useRef<HTMLInputElement>(null);
  const timeInputRef = useRef<HTMLInputElement>(null);

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
    setPlanInfo(false);
    setPresetInfo(false);
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

  // showPicker() is missing or throws on older WebViews — there, focusing the
  // input is what opens the native picker (e.g. the iOS time wheel).
  function openTimePicker(e: React.MouseEvent) {
    e.preventDefault();
    const input = timeInputRef.current;
    if (!input) return;
    try {
      input.showPicker();
    } catch {
      input.focus();
    }
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
          <div className="flex items-center gap-1">
            <h2 className="text-xl font-bold text-fg">Plan Your Day</h2>
            {/* Gated on isOpen too, so a popup left open can't outlive the sheet. */}
            <InfoPopover open={planInfo && isOpen} onOpenChange={setPlanInfo} title="Plan Your Day">
              Line up the whole day in one go. Type a task and hit Enter, or tap a preset — each new
              item starts where the last one ended. This day's habits show up in the list too.
            </InfoPopover>
          </div>
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

      {/* Composer — its own tinted panel, so it reads as the place to add
          things rather than a continuation of the plan list above. */}
      <div
        className="mt-2 rounded-t-3xl border-t border-border-strong bg-surface-alt px-4 pt-4"
        style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }}
      >
        {/* One-tap presets — added straight to the running list above, at the
            time and duration picked in the row below (hence the hint). The
            section stays even with no presets, so it's discoverable. */}
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-0.5 shrink-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Presets</p>
            <InfoPopover
              open={presetInfo && isOpen}
              onOpenChange={setPresetInfo}
              title="Presets"
              size={14}
            >
              Your go-to tasks, one tap away. Tap one to add it at the time and duration set below.
              Save up to {MAX_PRESETS} by tapping the star when you create a task; remove one with
              its ×.
            </InfoPopover>
          </div>
          {canUsePresets && presets.length > 0 && (
            <p className="text-xs text-fg-faint truncate">
              Tap to add at <span className="tabular-nums">{formatTimeLabel(startMin)}</span> for{" "}
              {formatDuration(duration)}
            </p>
          )}
        </div>
        {!canUsePresets ? (
          // Plus/Pro only: below that the section stays (so it's known to
          // exist) but its row is a padlocked pill explaining the plan. Same
          // 40px height as a chip, so the composer doesn't shift either way.
          <div className="pb-2">
            <motion.button
              type="button"
              onClick={() => void confirm(PRESETS_LOCKED_DIALOG)}
              whileTap={tap}
              className="w-full h-10 flex items-center gap-2 px-3.5 rounded-full border border-dashed border-border-strong text-fg-faint text-left"
            >
              <Lock size={14} className="shrink-0" />
              <span className="text-sm truncate">Available on the Plus and Pro plans</span>
            </motion.button>
          </div>
        ) : presets.length === 0 ? (
          // Same 40px height as a preset chip, so saving the first one
          // doesn't shift the composer.
          <div className="pb-2">
            <div className="h-10 flex items-center gap-2 px-3.5 rounded-full border border-dashed border-border-strong text-fg-faint">
              <Star size={14} className="shrink-0" />
              <span className="text-sm truncate">No presets yet — star a task to save one</span>
            </div>
          </div>
        ) : (
          <div
            className="flex items-center gap-2 overflow-x-auto pb-2 -mx-1 px-1"
            style={{ scrollbarWidth: "none" }}
          >
            {/* Each control type in the composer reads differently: presets are
                content, tinted with their own task colour; the title field and
                time picker are inputs (solid field + border); durations are
                options (outline, filled when selected). */}
            {presets.map((preset) => {
              const Icon = ICONS[preset.icon] ?? ICONS.default;
              return (
                <motion.button
                  key={preset.id}
                  type="button"
                  onClick={() => addPresetTask(preset)}
                  whileTap={tap}
                  className="relative flex items-center gap-2 pl-2 pr-3.5 py-2 rounded-full shrink-0"
                  style={{ backgroundColor: `${preset.color}2e` }}
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
            className="flex-1 min-w-0 h-12 bg-surface border border-transparent rounded-full px-5 text-base text-fg placeholder-fg-faint focus:outline-none focus:border-border-focus transition-colors"
          />
          <motion.button
            onClick={handleAdd}
            whileTap={canAdd ? tap : undefined}
            disabled={!canAdd}
            className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 disabled:opacity-40 bg-surface-inverse text-fg-inverse"
          >
            <Plus size={24} strokeWidth={2.5} />
          </motion.button>
        </div>

        {/* Quick time + duration */}
        <div
          className="flex items-center gap-2 overflow-x-auto pb-1"
          style={{ scrollbarWidth: "none" }}
        >
          {/* The whole pill opens the time picker. The native input stays
              hidden and click-through: tapped directly, Chromium only focuses
              an hour/minute segment (the picker opens from its own tiny clock
              glyph), so the pill opens it explicitly via showPicker(). */}
          <motion.label
            onClick={openTimePicker}
            whileTap={tap}
            className="relative flex items-center gap-1.5 bg-surface border border-transparent rounded-full pl-3 pr-2.5 py-2 shrink-0 cursor-pointer"
          >
            <Clock size={15} className="text-fg-faint" />
            <span className="text-sm font-medium text-fg tabular-nums">
              {formatTimeLabel(startMin)}
            </span>
            <input
              ref={timeInputRef}
              type="time"
              value={time}
              onChange={(e) => e.target.value && setTime(e.target.value)}
              aria-label="Start time"
              className="absolute inset-0 opacity-0 w-full h-full pointer-events-none"
            />
          </motion.label>
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
                className={`px-3.5 py-2 rounded-full border text-sm font-medium shrink-0 disabled:opacity-30 transition-colors ${
                  selected
                    ? "bg-surface-inverse border-transparent text-fg-inverse"
                    : "border-border-strong text-fg-muted"
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
