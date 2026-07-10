import { motion } from "framer-motion";
import {
  ArrowUpRight,
  Bell,
  Calendar,
  CheckCircle2,
  ChefHat,
  Dumbbell,
  Flame,
  Pencil,
  Repeat,
  X,
} from "lucide-react";

import type { EditItem } from "./Timeline";
import { isLightColor } from "@/lib/color";
import { formatFullDate } from "@/lib/date";
import { getHabitStreak } from "@/lib/habits";
import { ICONS } from "@/lib/icons";
import { tap } from "@/lib/motion";
import { PRIORITY_META } from "@/lib/priority";
import { reminderLabel } from "@/lib/reminders";
import { durationWords, formatTimeLabel } from "@/lib/time";
import { useRecipeFocusStore } from "@/store/recipeFocusStore";
import { useRecipeStore } from "@/store/recipeStore";
import { useWorkoutFocusStore } from "@/store/workoutFocusStore";
import { useWorkoutStore } from "@/store/workoutStore";
import BottomSheet from "../BottomSheet";

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

interface TaskDetailSheetProps {
  item: EditItem | null;
  onClose: () => void;
  onEdit: (item: EditItem) => void;
}

// Read-only popup with an item's details; a tap on a schedule row (outside the
// page's editing mode) opens this instead of the editor.
export default function TaskDetailSheet({ item, onClose, onEdit }: TaskDetailSheetProps) {
  const workoutSessions = useWorkoutStore((s) => s.sessions);
  const openWorkoutSession = useWorkoutFocusStore((s) => s.openSession);
  const recipes = useRecipeStore((s) => s.recipes);
  const openRecipe = useRecipeFocusStore((s) => s.openRecipe);

  const data = item?.data;
  const color = data?.color ?? "#6366f1";
  const onColor = isLightColor(color) ? "#111827" : "#ffffff";
  const headerBtnBg = isLightColor(color) ? "rgba(0,0,0,0.12)" : "rgba(0,0,0,0.25)";
  const Icon = data ? (ICONS[data.icon] ?? ICONS.default) : ICONS.default;

  const linkedSession = workoutSessions.find((s) => s.id === data?.workoutSessionId);
  const linkedRecipe = recipes.find((r) => r.id === data?.recipeId);
  const priority = item?.type === "task" ? item.data.priority : null;
  const streak = item?.type === "habit" ? getHabitStreak(item.data, new Date()) : 0;

  return (
    <BottomSheet
      isOpen={!!(item && data)}
      onClose={onClose}
      className="bg-surface max-h-[92vh] overflow-y-auto"
    >
      {item && data && (
        <>
          {/* Colored header, matching the editor's */}
          <div className="px-4 pt-3 pb-5 rounded-t-2xl" style={{ backgroundColor: color }}>
            <div className="flex items-center justify-between">
              <motion.button
                onClick={onClose}
                whileTap={tap}
                className="w-9 h-9 rounded-full flex items-center justify-center"
                style={{ backgroundColor: headerBtnBg, color: onColor }}
              >
                <X size={20} />
              </motion.button>
              <motion.button
                onClick={() => onEdit(item)}
                whileTap={tap}
                className="flex items-center gap-1.5 h-9 px-3.5 rounded-full text-sm font-medium"
                style={{ backgroundColor: headerBtnBg, color: onColor }}
              >
                <Pencil size={15} />
                Edit
              </motion.button>
            </div>

            <div className="flex items-center gap-4 mt-3">
              <div
                className="w-16 h-16 rounded-full border-[3px] border-white flex items-center justify-center shrink-0"
                style={{ backgroundColor: "#2f2f33" }}
              >
                <Icon size={28} style={{ color }} />
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide"
                  style={{
                    color: isLightColor(color) ? "rgba(17,24,39,0.7)" : "rgba(255,255,255,0.85)",
                  }}
                >
                  {item.type === "task" ? <CheckCircle2 size={12} /> : <Repeat size={12} />}
                  {item.type === "task" ? "One-time task" : "Repeating habit"}
                </p>
                <h2
                  className="text-2xl font-bold truncate leading-tight mt-0.5"
                  style={{ color: onColor }}
                >
                  {data.title}
                </h2>
                <p
                  className="text-sm mt-0.5 tabular-nums"
                  style={{
                    color: isLightColor(color) ? "rgba(17,24,39,0.7)" : "rgba(255,255,255,0.85)",
                  }}
                >
                  {formatTimeLabel(data.startMinutes)}–
                  {formatTimeLabel(data.startMinutes + data.durationMinutes)} (
                  {durationWords(data.durationMinutes)})
                </p>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="p-4 pb-8 flex flex-col gap-2">
            {item.type === "task" && (
              <InfoRow icon={Calendar} label="Date">
                <span className="text-sm font-medium text-fg">
                  {formatFullDate(item.data.date)}
                </span>
              </InfoRow>
            )}

            {item.type === "habit" && (
              <InfoRow icon={Repeat} label="Repeats on">
                <span className="flex gap-1">
                  {DAY_LABELS.map((d, i) => (
                    <span
                      key={i}
                      className={`w-6 h-6 rounded-full text-[11px] font-medium flex items-center justify-center ${
                        item.data.daysOfWeek.includes(i)
                          ? "bg-surface-inverse text-fg-inverse"
                          : "bg-surface-raised text-fg-faint"
                      }`}
                    >
                      {d}
                    </span>
                  ))}
                </span>
              </InfoRow>
            )}

            {item.type === "habit" && streak > 0 && (
              <InfoRow icon={Flame} label="Streak">
                <span className="flex items-center gap-1 text-sm font-medium text-[#b5895f]">
                  <Flame size={14} className="fill-[#b5895f]" />
                  {streak} day{streak === 1 ? "" : "s"}
                </span>
              </InfoRow>
            )}

            {priority && (
              <InfoRow icon={PRIORITY_META[priority].icon} label="Priority">
                <span
                  className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
                  style={{
                    backgroundColor: `${PRIORITY_META[priority].color}1f`,
                    color: PRIORITY_META[priority].color,
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: PRIORITY_META[priority].color }}
                  />
                  {PRIORITY_META[priority].label}
                </span>
              </InfoRow>
            )}

            <InfoRow icon={Bell} label="Reminder">
              <span className="text-sm font-medium text-fg">
                {reminderLabel(data.reminderMinutesBefore)}
              </span>
            </InfoRow>

            {item.type === "task" && (
              <InfoRow icon={CheckCircle2} label="Status">
                <span
                  className={`text-sm font-medium ${item.data.completed ? "" : "text-fg-faint"}`}
                  style={item.data.completed ? { color: "#5f8c78" } : undefined}
                >
                  {item.data.completed ? "Completed" : "Not completed"}
                </span>
              </InfoRow>
            )}

            {linkedSession && (
              <motion.button
                onClick={() => {
                  openWorkoutSession(linkedSession.id);
                  onClose();
                }}
                whileTap={tap}
                className="flex items-center gap-3 p-3 rounded-2xl bg-surface-alt text-left"
              >
                <span
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white shrink-0"
                  style={{ backgroundColor: linkedSession.color }}
                >
                  <Dumbbell size={15} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-xs text-fg-faint">Linked workout</span>
                  <span className="block text-sm font-medium text-fg truncate">
                    {linkedSession.name}
                  </span>
                </span>
                <ArrowUpRight size={16} className="text-fg-faint shrink-0" />
              </motion.button>
            )}

            {linkedRecipe && (
              <motion.button
                onClick={() => {
                  openRecipe(linkedRecipe.id);
                  onClose();
                }}
                whileTap={tap}
                className="flex items-center gap-3 p-3 rounded-2xl bg-surface-alt text-left"
              >
                <span
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white shrink-0"
                  style={{ backgroundColor: linkedRecipe.color }}
                >
                  <ChefHat size={15} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-xs text-fg-faint">Linked recipe</span>
                  <span className="block text-sm font-medium text-fg truncate">
                    {linkedRecipe.name}
                  </span>
                </span>
                <ArrowUpRight size={16} className="text-fg-faint shrink-0" />
              </motion.button>
            )}
          </div>
        </>
      )}
    </BottomSheet>
  );
}

function InfoRow({
  icon: IconComp,
  label,
  children,
}: {
  icon: typeof Calendar;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-2xl bg-surface-alt">
      <IconComp size={16} className="text-fg-faint shrink-0" />
      <span className="flex-1 text-sm text-fg-muted">{label}</span>
      {children}
    </div>
  );
}
