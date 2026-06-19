/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-hooks/immutability */
/* eslint-disable react-hooks/exhaustive-deps */
import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Trash2, Calendar, ChevronRight, Repeat, CheckCircle2, Check } from "lucide-react";
import { useTaskStore } from "../../store/taskStore";
import { useHabitStore } from "../../store/habitStore";
import { ICONS } from "../../lib/icons";
import type { EditItem } from "./Timeline";
import { spring, tap } from "../../lib/motion";

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
const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];
const DAY_OPTIONS = [
  { label: "S", value: 0 },
  { label: "M", value: 1 },
  { label: "T", value: 2 },
  { label: "W", value: 3 },
  { label: "T", value: 4 },
  { label: "F", value: 5 },
  { label: "S", value: 6 },
];

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
function snap15(min: number) {
  return Math.round(min / 15) * 15;
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

const STEP = 15;
const TIME_STEPS = Array.from({ length: 1440 / STEP }, (_, i) => i * STEP);
const WHEEL_ITEM_H = 44;
const WHEEL_VISIBLE = 5;
const WHEEL_PAD = ((WHEEL_VISIBLE - 1) / 2) * WHEEL_ITEM_H;

function TimeWheel({
  value,
  durationMinutes,
  color,
  onChange,
}: {
  value: string;
  durationMinutes: number;
  color: string;
  onChange: (next: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedIndex = Math.max(
    0,
    Math.min(TIME_STEPS.length - 1, snap15(timeStringToMinutes(value)) / STEP),
  );
  const [active, setActive] = useState(selectedIndex);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = selectedIndex * WHEEL_ITEM_H;
    setActive(selectedIndex);
  }, []);

  function handleScroll() {
    const el = ref.current;
    if (!el) return;
    const idx = Math.max(
      0,
      Math.min(TIME_STEPS.length - 1, Math.round(el.scrollTop / WHEEL_ITEM_H)),
    );
    setActive(idx);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (idx !== selectedIndex) onChange(minutesToTimeString(TIME_STEPS[idx]));
    }, 110);
  }

  return (
    <div className="bg-gray-100 rounded-2xl py-2">
      <div
        ref={ref}
        onScroll={handleScroll}
        className="wheel-col overflow-y-scroll snap-y snap-mandatory"
        style={{ height: WHEEL_VISIBLE * WHEEL_ITEM_H, scrollbarWidth: "none" }}
      >
        <div style={{ height: WHEEL_PAD }} />
        {TIME_STEPS.map((min, i) => (
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
              <span className="text-base tabular-nums text-gray-300">
                {label24(min)}
              </span>
            )}
          </div>
        ))}
        <div style={{ height: WHEEL_PAD }} />
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

interface AddItemSheetProps {
  isOpen: boolean;
  onClose: () => void;
  editItem?: EditItem | null;
}

export default function AddItemSheet({
  isOpen,
  onClose,
  editItem,
}: AddItemSheetProps) {
  const addTask = useTaskStore((s) => s.addTask);
  const updateTask = useTaskStore((s) => s.updateTask);
  const deleteTask = useTaskStore((s) => s.deleteTask);
  const selectedDate = useTaskStore((s) => s.selectedDate);
  const addHabit = useHabitStore((s) => s.addHabit);
  const updateHabit = useHabitStore((s) => s.updateHabit);
  const deleteHabit = useHabitStore((s) => s.deleteHabit);

  const isEditing = !!editItem;

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
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);

  useEffect(() => {
    if (!isOpen) return;
    setStep(1);
    setDir(1);
    if (editItem) {
      setMode(editItem.type);
      setTitle(editItem.data.title);
      setDate(editItem.type === "task" ? editItem.data.date : selectedDate);
      setTime(minutesToTimeString(editItem.data.startMinutes));
      setDuration(editItem.data.durationMinutes);
      const custom = !DURATION_OPTIONS.includes(editItem.data.durationMinutes);
      setCustomMode(custom);
      setCustomH(String(Math.floor(editItem.data.durationMinutes / 60)));
      setCustomM(String(editItem.data.durationMinutes % 60));
      setColor(editItem.data.color);
      setIcon(editItem.data.icon);
      setDaysOfWeek(
        editItem.type === "habit" ? editItem.data.daysOfWeek : [0, 1, 2, 3, 4, 5, 6],
      );
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
    setDaysOfWeek([0, 1, 2, 3, 4, 5, 6]);
  }

  function applyCustom(hStr: string, mStr: string) {
    const cleanH = hStr.replace(/\D/g, "").slice(0, 2);
    const cleanM = mStr.replace(/\D/g, "").slice(0, 2);
    setCustomH(cleanH);
    setCustomM(cleanM);
    const h = Math.min(23, Number(cleanH || 0));
    const m = Math.min(59, Number(cleanM || 0));
    setDuration(h * 60 + m);
  }

  function toggleDay(value: number) {
    setDaysOfWeek((prev) =>
      prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value],
    );
  }

  function handleSubmit() {
    if (!title.trim() || duration < 5) return;
    const startMinutes = timeStringToMinutes(time);

    if (isEditing) {
      if (editItem!.type === "task") {
        updateTask(editItem!.data.id, {
          title: title.trim(),
          startMinutes,
          durationMinutes: duration,
          color,
          icon,
          date,
        });
      } else {
        if (daysOfWeek.length === 0) return;
        updateHabit(editItem!.data.id, {
          title: title.trim(),
          startMinutes,
          durationMinutes: duration,
          color,
          icon,
          daysOfWeek,
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
        });
      }
    }
    onClose();
  }

  function handleDelete() {
    if (!editItem) return;
    if (editItem.type === "task") deleteTask(editItem.data.id);
    else deleteHabit(editItem.data.id);
    onClose();
  }

  function goTo(next: number) {
    setDir(next > step ? 1 : -1);
    setStep(next);
  }

  const startMin = timeStringToMinutes(time);
  const onColor = isLightColor(color) ? "#111827" : "#ffffff";
  const HeaderIcon = ICONS[icon] ?? ICONS.default;
  const chipCls = (selected: boolean) =>
    `px-3.5 py-2 rounded-full text-sm font-medium shrink-0 ${selected ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600"}`;

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
            className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl z-50 shadow-xl max-h-[92vh] overflow-y-auto"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={spring.snappy}
          >
            {/* Colored header — persists across steps */}
            <div
              className="px-4 pt-3 pb-5 rounded-t-2xl"
              style={{ backgroundColor: color }}
            >
              <div className="flex items-center justify-between">
                <motion.button
                  onClick={onClose}
                  whileTap={tap}
                  className="w-9 h-9 rounded-full flex items-center justify-center"
                  style={{
                    backgroundColor: isLightColor(color)
                      ? "rgba(0,0,0,0.12)"
                      : "rgba(0,0,0,0.25)",
                    color: onColor,
                  }}
                >
                  <X size={20} />
                </motion.button>
                {isEditing && (
                  <motion.button
                    onClick={handleDelete}
                    whileTap={tap}
                    className="w-9 h-9 rounded-full flex items-center justify-center"
                    style={{
                      backgroundColor: isLightColor(color)
                        ? "rgba(0,0,0,0.12)"
                        : "rgba(0,0,0,0.25)",
                      color: onColor,
                    }}
                  >
                    <Trash2 size={18} />
                  </motion.button>
                )}
              </div>

              <div className="flex items-center gap-4 mt-3">
                <div
                  className="w-16 h-16 rounded-full border-[3px] border-white flex items-center justify-center shrink-0"
                  style={{ backgroundColor: "#2f2f33" }}
                >
                  <HeaderIcon size={28} style={{ color }} />
                </div>
                <div className="flex-1 min-w-0">
                  {step > 1 && (
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
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={mode === "task" ? "Task title" : "Habit title"}
                    autoFocus
                    className={`w-full bg-transparent text-2xl font-semibold border-b pb-1 focus:outline-none ${isLightColor(color) ? "placeholder-black/40" : "placeholder-white/50"}`}
                    style={{
                      color: onColor,
                      caretColor: onColor,
                      borderColor: isLightColor(color)
                        ? "rgba(17,24,39,0.3)"
                        : "rgba(255,255,255,0.5)",
                    }}
                  />
                </div>
              </div>
            </div>

            {/* White body */}
            <div className="p-4 pb-6">
              {/* Step dots */}
              <div className="flex gap-1.5 justify-center mb-4">
                {[1, 2, 3].map((s) => (
                  <span
                    key={s}
                    className={`h-1 rounded-full transition-all ${step === s ? "w-5 bg-gray-900" : "w-2 bg-gray-300"}`}
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
                    <label className="text-xs font-medium text-gray-500 mb-2 block">
                      Color
                    </label>
                    <div
                      className="wheel-col flex gap-3 overflow-x-auto bg-gray-100 rounded-full p-1.5 mb-5"
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
                            outline: color === c ? "2px solid #111827" : "none",
                            outlineOffset: 2,
                          }}
                        />
                      ))}
                    </div>

                    <label className="text-xs font-medium text-gray-500 mb-2 block">
                      Icon
                    </label>
                    <div
                      className="wheel-col flex gap-2 overflow-x-auto pb-1 mb-6"
                      style={{ scrollbarWidth: "none" }}
                    >
                      {(Object.keys(ICONS) as Array<keyof typeof ICONS>)
                        .filter((key) => key !== "default")
                        .map((key) => {
                          const IconComp = ICONS[key];
                          const selected = icon === key;
                          return (
                            <motion.button
                              key={key}
                              onClick={() => setIcon(key)}
                              whileTap={tap}
                              className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                              style={{
                                backgroundColor: selected ? color : "#f3f4f6",
                                color: selected ? onColor : "#6b7280",
                              }}
                            >
                              <IconComp size={18} />
                            </motion.button>
                          );
                        })}
                    </div>

                    <motion.button
                      onClick={() => goTo(2)}
                      whileTap={tap}
                      disabled={!title.trim()}
                      className="w-full rounded-2xl py-3.5 font-medium disabled:opacity-40"
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
                    {/* Date pill — native picker underneath */}
                    <label className="text-xs font-medium text-gray-500 mb-2 block">
                      Date
                    </label>
                    <div className="relative mb-5">
                      <div className="flex items-center justify-between bg-gray-100 rounded-2xl px-4 py-3">
                        <span className="flex items-center gap-2 text-gray-900 font-medium">
                          <Calendar size={18} className="text-gray-400" />
                          {formatFullDate(date)}
                        </span>
                        <span className="flex items-center gap-1 text-gray-400 text-sm">
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

                    {/* Time wheel */}
                    <label className="text-xs font-medium text-gray-500 mb-2 block">
                      Start time
                    </label>
                    <div className="mb-5">
                      <TimeWheel
                        value={time}
                        durationMinutes={duration}
                        color={color}
                        onChange={setTime}
                      />
                    </div>

                    {/* Duration */}
                    <label className="text-xs font-medium text-gray-500 mb-2 block">
                      Duration
                    </label>
                    <div
                      className="wheel-col flex gap-2 overflow-x-auto pb-1"
                      style={{ scrollbarWidth: "none" }}
                    >
                      {DURATION_OPTIONS.map((d) => (
                        <motion.button
                          key={d}
                          onClick={() => {
                            setCustomMode(false);
                            setDuration(d);
                          }}
                          whileTap={tap}
                          className={chipCls(!customMode && duration === d)}
                        >
                          {formatDuration(d)}
                        </motion.button>
                      ))}
                      <motion.button
                        onClick={() => {
                          setCustomMode(true);
                          setCustomH(String(Math.floor(duration / 60)));
                          setCustomM(String(duration % 60));
                        }}
                        whileTap={tap}
                        className={chipCls(customMode)}
                      >
                        Custom
                      </motion.button>
                    </div>

                    {customMode && (
                      <div className="flex items-center gap-2 mt-3 bg-gray-100 rounded-2xl px-4 py-3">
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          value={customH}
                          onChange={(e) => applyCustom(e.target.value, customM)}
                          placeholder="0"
                          className="w-12 bg-white rounded-lg px-2 py-1.5 text-lg font-semibold text-center focus:outline-none"
                        />
                        <span className="text-gray-500 text-sm">hours</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={59}
                          value={customM}
                          onChange={(e) => applyCustom(customH, e.target.value)}
                          placeholder="0"
                          className="w-12 bg-white rounded-lg px-2 py-1.5 text-lg font-semibold text-center focus:outline-none"
                        />
                        <span className="text-gray-500 text-sm">mins</span>
                        <span className="ml-auto text-sm text-gray-400 tabular-nums">
                          {formatDuration(duration)}
                        </span>
                      </div>
                    )}

                    <div className="flex gap-2 mt-6">
                      <motion.button
                        onClick={() => goTo(1)}
                        whileTap={tap}
                        className="px-5 rounded-2xl py-3.5 font-medium bg-gray-100 text-gray-700"
                      >
                        Back
                      </motion.button>
                      <motion.button
                        onClick={() => goTo(3)}
                        whileTap={tap}
                        disabled={duration < 5}
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
                    <div className="flex items-center gap-3 bg-gray-50 rounded-2xl p-3 mb-5">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                        style={{ backgroundColor: color, color: onColor }}
                      >
                        <HeaderIcon size={18} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-gray-400">
                          {rangeLabel(startMin, duration)} · {relativeDayLabel(date)}
                        </p>
                        <p className="font-semibold text-gray-900 truncate">
                          {title.trim() || "Untitled"}
                        </p>
                      </div>
                    </div>

                    <label className="text-xs font-medium text-gray-500 mb-2 block">
                      This is a…
                    </label>
                    <div className="flex flex-col gap-2">
                      {(["task", "habit"] as const).map((m) => {
                        const selected = mode === m;
                        const locked = isEditing && editItem!.type !== m;
                        return (
                          <motion.button
                            key={m}
                            onClick={() => !isEditing && setMode(m)}
                            whileTap={isEditing ? undefined : tap}
                            disabled={locked}
                            className={`w-full flex items-center gap-3 p-3 rounded-2xl border text-left ${selected ? "border-gray-900 bg-gray-50" : "border-gray-200"} ${locked ? "opacity-40" : ""}`}
                          >
                            <div
                              className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                              style={{
                                backgroundColor: selected ? color : "#f3f4f6",
                                color: selected ? onColor : "#6b7280",
                              }}
                            >
                              {m === "task" ? (
                                <CheckCircle2 size={18} />
                              ) : (
                                <Repeat size={18} />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-gray-900">
                                {m === "task" ? "One-time task" : "Repeating habit"}
                              </p>
                              <p className="text-xs text-gray-400">
                                {m === "task"
                                  ? "Happens once on the chosen date"
                                  : "Repeats on the days you pick"}
                              </p>
                            </div>
                            {selected && (
                              <Check size={18} className="text-gray-900 shrink-0" />
                            )}
                          </motion.button>
                        );
                      })}
                    </div>

                    {mode === "habit" && (
                      <>
                        <label className="text-xs font-medium text-gray-500 mb-2 block mt-4">
                          Repeat on
                        </label>
                        <div className="flex gap-2">
                          {DAY_OPTIONS.map(({ label, value }) => (
                            <motion.button
                              key={value}
                              onClick={() => toggleDay(value)}
                              whileTap={tap}
                              className={`w-9 h-9 rounded-full text-sm font-medium ${daysOfWeek.includes(value) ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500"}`}
                            >
                              {label}
                            </motion.button>
                          ))}
                        </div>
                      </>
                    )}

                    <div className="flex gap-2 mt-6">
                      <motion.button
                        onClick={() => goTo(2)}
                        whileTap={tap}
                        className="px-5 rounded-2xl py-3.5 font-medium bg-gray-100 text-gray-700"
                      >
                        Back
                      </motion.button>
                      <motion.button
                        onClick={handleSubmit}
                        whileTap={tap}
                        disabled={
                          !title.trim() ||
                          duration < 5 ||
                          (mode === "habit" && daysOfWeek.length === 0)
                        }
                        className="flex-1 rounded-2xl py-3.5 font-medium disabled:opacity-40"
                        style={{ backgroundColor: color, color: onColor }}
                      >
                        {isEditing
                          ? "Save changes"
                          : mode === "task"
                            ? "Add task"
                            : "Add habit"}
                      </motion.button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}