/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-hooks/immutability */
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useTaskStore } from "../../store/taskStore";
import { useHabitStore } from "../../store/habitStore";
import { ICONS } from "../../lib/icons";
import type { EditItem } from "./Timeline";
import { spring, tap } from "../../lib/motion";

const COLOR_OPTIONS = [
  "#34d399",
  "#60a5fa",
  "#fbbf24",
  "#fb7185",
  "#a78bfa",
  "#fb923c",
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

function minutesToTimeString(minutes: number) {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

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

  const [mode, setMode] = useState<"task" | "habit">("task");
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("09:00");
  const [duration, setDuration] = useState(30);
  const [color, setColor] = useState(COLOR_OPTIONS[0]);
  const [icon, setIcon] = useState<keyof typeof ICONS>("alarm");
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);

  // When opening in edit mode, populate fields from the existing item
  useEffect(() => {
    if (editItem) {
      setMode(editItem.type);
      setTitle(editItem.data.title);
      setTime(minutesToTimeString(editItem.data.startMinutes));
      setDuration(editItem.data.durationMinutes);
      setColor(editItem.data.color);
      setIcon(editItem.data.icon);
      setDaysOfWeek(
        editItem.type === "habit"
          ? editItem.data.daysOfWeek
          : [0, 1, 2, 3, 4, 5, 6],
      );
    } else {
      resetForm();
    }
  }, [editItem]);

  function resetForm() {
    setMode("task");
    setTitle("");
    setTime("09:00");
    setDuration(30);
    setColor(COLOR_OPTIONS[0]);
    setIcon("alarm");
    setDaysOfWeek([0, 1, 2, 3, 4, 5, 6]);
  }

  function toggleDay(value: number) {
    setDaysOfWeek((prev) =>
      prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value],
    );
  }

  function handleSubmit() {
    if (!title.trim()) return;
    const [hours, minutes] = time.split(":").map(Number);
    const startMinutes = hours * 60 + minutes;

    if (isEditing) {
      if (editItem!.type === "task") {
        updateTask(editItem!.data.id, {
          title: title.trim(),
          startMinutes,
          durationMinutes: duration,
          color,
          icon,
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
          date: selectedDate,
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
            className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl z-50 p-5 pb-8 shadow-xl max-h-[85vh] overflow-y-auto"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={spring.snappy}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">
                {isEditing
                  ? `Edit ${editItem!.type}`
                  : `New ${mode === "task" ? "task" : "habit"}`}
              </h2>
              <motion.button
                onClick={onClose}
                whileTap={tap}
                className="p-2 -m-2 text-gray-400"
              >
                <X size={22} />
              </motion.button>
            </div>

            {/* Mode toggle — only shown when adding, locked in edit mode */}
            {!isEditing && (
              <div className="flex bg-gray-100 rounded-xl p-1 mb-4">
                {(["task", "habit"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className="relative flex-1 py-2 rounded-lg text-sm font-medium"
                  >
                    {mode === m && (
                      <motion.div
                        layoutId="sheetMode"
                        transition={spring.snappy}
                        className="absolute inset-0 bg-white rounded-lg shadow-sm"
                      />
                    )}
                    <span
                      className={`relative z-10 ${mode === m ? "text-gray-900" : "text-gray-500"}`}
                    >
                      {m === "task" ? "One-time task" : "Repeating habit"}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={mode === "task" ? "Task title" : "Habit title"}
              autoFocus
              className="w-full text-base border border-gray-200 rounded-xl px-4 py-3 mb-4 focus:outline-none focus:border-gray-400"
            />

            <label className="text-sm text-gray-500 mb-1 block">
              Start time
            </label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full text-base border border-gray-200 rounded-xl px-4 py-3 mb-4 focus:outline-none focus:border-gray-400"
            />

            <label className="text-sm text-gray-500 mb-2 block">Duration</label>
            <div className="flex gap-2 flex-wrap mb-4">
              {DURATION_OPTIONS.map((d) => (
                <motion.button
                  key={d}
                  onClick={() => setDuration(d)}
                  whileTap={tap}
                  className={`px-3 py-2 rounded-full text-sm font-medium ${duration === d ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600"}`}
                >
                  {d < 60
                    ? `${d}m`
                    : `${d / 60}h${d % 60 ? ` ${d % 60}m` : ""}`}
                </motion.button>
              ))}
            </div>

            {/* Days of week — shown for habits only */}
            {(mode === "habit" ||
              (isEditing && editItem!.type === "habit")) && (
              <>
                <label className="text-sm text-gray-500 mb-2 block">
                  Repeat on
                </label>
                <div className="flex gap-2 mb-4">
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

            <label className="text-sm text-gray-500 mb-2 block">Icon</label>
            <div className="flex gap-2 flex-wrap mb-4">
              {(Object.keys(ICONS) as Array<keyof typeof ICONS>)
                .filter((key) => key !== "default")
                .map((key) => {
                  const IconComp = ICONS[key];
                  return (
                    <motion.button
                      key={key}
                      onClick={() => setIcon(key)}
                      whileTap={tap}
                      className={`w-10 h-10 rounded-full flex items-center justify-center ${icon === key ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500"}`}
                    >
                      <IconComp size={18} />
                    </motion.button>
                  );
                })}
            </div>

            <label className="text-sm text-gray-500 mb-2 block">Color</label>
            <div className="flex gap-3 mb-6">
              {COLOR_OPTIONS.map((c) => (
                <motion.button
                  key={c}
                  onClick={() => setColor(c)}
                  whileTap={tap}
                  className="w-9 h-9 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: c }}
                >
                  <AnimatePresence>
                    {color === c && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        exit={{ scale: 0 }}
                        transition={spring.pop}
                        className="w-3 h-3 rounded-full bg-white"
                      />
                    )}
                  </AnimatePresence>
                </motion.button>
              ))}
            </div>

            <motion.button
              onClick={handleSubmit}
              whileTap={tap}
              disabled={
                !title.trim() || (mode === "habit" && daysOfWeek.length === 0)
              }
              className="w-full bg-gray-900 text-white rounded-xl py-3.5 font-medium disabled:opacity-40"
            >
              {isEditing
                ? "Save changes"
                : mode === "task"
                  ? "Add task"
                  : "Add habit"}
            </motion.button>

            {isEditing && (
              <motion.button
                onClick={handleDelete}
                whileTap={tap}
                className="w-full mt-3 py-3.5 rounded-xl text-red-500 font-medium bg-red-50"
              >
                Delete {editItem!.type}
              </motion.button>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}