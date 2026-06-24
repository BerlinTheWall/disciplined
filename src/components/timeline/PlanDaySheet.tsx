/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Clock, Plus } from "lucide-react";
import { useTaskStore } from "../../store/taskStore";
import { ICONS, guessIcon } from "../../lib/icons";
import { spring, tap } from "../../lib/motion";
import { useScrollLock } from "../../hooks/useScrollLock";

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

/* ---- helpers ----------------------------------------------------- */

function isLightColor(hex: string) {
  const c = hex.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62;
}
function minutesToTimeString(min: number) {
  const m = ((min % 1440) + 1440) % 1440;
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
function rangeLabel(start: number, dur: number) {
  return `${label24(start)}–${label24(start + dur)}`;
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
function relativeDayLabel(iso: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = isoToDate(iso);
  d.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long" });
}

interface PlanDaySheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function PlanDaySheet({ isOpen, onClose }: PlanDaySheetProps) {
  const tasks = useTaskStore((s) => s.tasks);
  const addTask = useTaskStore((s) => s.addTask);
  const deleteTask = useTaskStore((s) => s.deleteTask);
  const selectedDate = useTaskStore((s) => s.selectedDate);
  useScrollLock(isOpen);

  const [title, setTitle] = useState("");
  const [time, setTime] = useState(minutesToTimeString(DEFAULT_START));
  const [duration, setDuration] = useState(30);
  const [colorIndex, setColorIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Tasks already on this day, sorted — the live plan.
  const dayTasks = tasks
    .filter((t) => t.date === selectedDate)
    .sort((a, b) => a.startMinutes - b.startMinutes);

  // Next free start = end of the latest task on this day (rounded), else default.
  function nextStartMinutes() {
    if (dayTasks.length === 0) return DEFAULT_START;
    const end = Math.max(...dayTasks.map((t) => t.startMinutes + t.durationMinutes));
    return Math.min(end, MINUTES_PER_DAY - 15);
  }

  // When the sheet opens, seed the start time from the day's current end.
  useEffect(() => {
    if (!isOpen) return;
    setTitle("");
    setDuration(30);
    setColorIndex(0);
    setTime(minutesToTimeString(nextStartMinutes()));
    requestAnimationFrame(() => inputRef.current?.focus());
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
    setTime(minutesToTimeString(nextStart));
    setColorIndex((i) => i + 1);
    setTitle("");
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/40 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed bottom-0 left-0 right-0 bg-surface rounded-t-2xl z-50 shadow-xl max-h-[92vh] flex flex-col"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={spring.snappy}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-4 pb-3">
              <div>
                <h2 className="text-xl font-bold text-fg">Plan your day</h2>
                <p className="text-sm text-fg-faint capitalize">
                  {relativeDayLabel(selectedDate)} · {dayTasks.length}{" "}
                  {dayTasks.length === 1 ? "task" : "tasks"}
                </p>
              </div>
              <motion.button
                onClick={onClose}
                whileTap={tap}
                className="w-9 h-9 rounded-full bg-surface-raised text-fg-muted flex items-center justify-center"
              >
                <X size={20} />
              </motion.button>
            </div>

            {/* Running plan list */}
            <div className="flex-1 overflow-y-auto px-4 min-h-[80px]">
              {dayTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <p className="text-sm text-fg-faint">
                    Type a task below and hit{" "}
                    <span className="font-semibold text-fg-muted">Enter</span> to
                    stack your day.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2 py-1">
                  <AnimatePresence initial={false}>
                    {dayTasks.map((t) => {
                      const Icon = ICONS[t.icon] ?? ICONS.default;
                      return (
                        <motion.div
                          key={t.id}
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
                            <p className="text-xs text-fg-faint tabular-nums">
                              {rangeLabel(t.startMinutes, t.durationMinutes)}
                            </p>
                          </div>
                          <motion.button
                            onClick={() => deleteTask(t.id)}
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
              <div className="flex items-center gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
                <label className="relative flex items-center gap-1.5 bg-surface-raised rounded-full pl-3 pr-2 py-2 shrink-0">
                  <Clock size={15} className="text-fg-faint" />
                  <span className="text-sm font-medium text-fg tabular-nums">{label24(startMin)}</span>
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
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
