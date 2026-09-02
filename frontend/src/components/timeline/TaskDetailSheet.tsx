import { motion } from "framer-motion";
import {
  ArrowUpRight,
  Bell,
  Calendar,
  CheckCircle2,
  Flame,
  Pencil,
  Repeat,
  Target,
  X,
} from "lucide-react";

import { repeatSummary } from "./addItemOptions";
import type { EditItem } from "./Timeline";
import { isLightColor } from "@/lib/color";
import { formatFullDate } from "@/lib/date";
import { goalColor } from "@/lib/goalPriority";
import { anchorDay, getHabitStreak } from "@/lib/habits";
import { ICONS } from "@/lib/icons";
import { tap } from "@/lib/motion";
import { PRIORITY_META } from "@/lib/priority";
import { reminderLabel } from "@/lib/reminders";
import { durationWords, formatTimeLabel } from "@/lib/time";
import { useGoalFocusStore } from "@/store/goalFocusStore";
import { useGoalStore } from "@/store/goalStore";
import BottomSheet from "../BottomSheet";
import { AppleLogo, GoogleLogo, MicrosoftLogo } from "../icons/ProviderLogos";

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

interface TaskDetailSheetProps {
  item: EditItem | null;
  onClose: () => void;
  // Omitted where there's no full editor to hand off to (e.g. opened from
  // the goal detail sheet) — the Edit button just doesn't render then.
  onEdit?: (item: EditItem) => void;
  // Jumps to the item's day on the schedule and closes this sheet — offered
  // when the sheet was opened from somewhere other than the schedule itself
  // (e.g. a linked task inside a goal), where the item isn't already visible.
  onShowOnCalendar?: () => void;
}

// Read-only popup with an item's details; a tap on a schedule row (outside the
// page's editing mode) opens this instead of the editor.
export default function TaskDetailSheet({
  item,
  onClose,
  onEdit,
  onShowOnCalendar,
}: TaskDetailSheetProps) {
  const goals = useGoalStore((s) => s.goals);
  const openGoal = useGoalFocusStore((s) => s.openGoal);

  const data = item?.data;
  const color = data?.color ?? "#6366f1";
  const onColor = isLightColor(color) ? "#111827" : "#ffffff";
  const headerBtnBg = isLightColor(color) ? "rgba(0,0,0,0.12)" : "rgba(0,0,0,0.25)";
  const Icon = data ? (ICONS[data.icon] ?? ICONS.default) : ICONS.default;

  const linkedGoal =
    item?.type === "task"
      ? goals.find(
          (g) =>
            g.linkedTaskIds.includes(item.data.id) ||
            g.milestones.some((m) => m.linkedTaskIds?.includes(item.data.id))
        )
      : undefined;
  const priority = item?.type === "task" ? item.data.priority : null;
  const streak = item?.type === "habit" ? getHabitStreak(item.data, new Date()) : 0;

  // A task is ever linked to at most one connected-calendar provider — see
  // frontend/src/lib/deviceCalendarSync.ts and backend outlook_graph.py/
  // google_calendar.py's reconcile_* for how these fields get set.
  const syncedProvider =
    item?.type !== "task"
      ? null
      : item.data.googleEventId
        ? { name: "Google Calendar", Logo: GoogleLogo }
        : item.data.outlookEventId
          ? { name: "Outlook", Logo: MicrosoftLogo }
          : item.data.appleLinked
            ? { name: "Apple Calendar", Logo: AppleLogo }
            : null;

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
              {onEdit && (
                <motion.button
                  onClick={() => onEdit(item)}
                  whileTap={tap}
                  className="flex items-center gap-1.5 h-9 px-3.5 rounded-full text-sm font-medium"
                  style={{ backgroundColor: headerBtnBg, color: onColor }}
                >
                  <Pencil size={15} />
                  Edit
                </motion.button>
              )}
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
            {onShowOnCalendar && (
              <motion.button
                onClick={() => {
                  onShowOnCalendar();
                  onClose();
                }}
                whileTap={tap}
                className="flex items-center gap-3 p-3 rounded-2xl bg-surface-alt text-left"
              >
                <span
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white shrink-0"
                  style={{ backgroundColor: color }}
                >
                  <Calendar size={15} />
                </span>
                <span className="flex-1 min-w-0 text-sm font-medium text-fg">Show on calendar</span>
                <ArrowUpRight size={16} className="text-fg-faint shrink-0" />
              </motion.button>
            )}

            {item.type === "task" && (
              <InfoRow icon={Calendar} label="Date">
                <span className="text-sm font-medium text-fg">
                  {formatFullDate(item.data.date)}
                </span>
              </InfoRow>
            )}

            {item.type === "habit" && (item.data.freq ?? "weekly") === "monthly" && (
              <InfoRow icon={Repeat} label="Repeats">
                <span className="text-sm font-medium text-fg">
                  {repeatSummary(
                    "monthly",
                    item.data.interval ?? 1,
                    item.data.daysOfWeek,
                    anchorDay(item.data.anchorDate)
                  )}
                </span>
              </InfoRow>
            )}

            {item.type === "habit" && (item.data.freq ?? "weekly") === "weekly" && (
              <InfoRow
                icon={Repeat}
                label={(item.data.interval ?? 1) > 1 ? "Repeats" : "Repeats on"}
              >
                <span className="flex items-center gap-2">
                  {(item.data.interval ?? 1) > 1 && (
                    <span className="text-sm font-medium text-fg">
                      Every {item.data.interval} weeks
                    </span>
                  )}
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
                </span>
              </InfoRow>
            )}

            {item.type === "habit" && item.data.endDate && (
              <InfoRow icon={Calendar} label="Ends">
                <span className="text-sm font-medium text-fg">
                  {formatFullDate(item.data.endDate)}
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
                  style={item.data.completed ? { color: "#7c7fd1" } : undefined}
                >
                  {item.data.completed ? "Completed" : "Not completed"}
                </span>
              </InfoRow>
            )}

            {syncedProvider && (
              <div className="flex items-center gap-3 p-3 rounded-2xl bg-surface-alt">
                <syncedProvider.Logo size={16} className="text-fg-faint shrink-0" />
                <span className="flex-1 text-sm text-fg-muted">Synced with</span>
                <span className="text-sm font-medium text-fg">{syncedProvider.name}</span>
              </div>
            )}

            {linkedGoal && (
              <motion.button
                onClick={() => {
                  openGoal(linkedGoal.id);
                  onClose();
                }}
                whileTap={tap}
                className="flex items-center gap-3 p-3 rounded-2xl bg-surface-alt text-left"
              >
                <span
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white shrink-0"
                  style={{ backgroundColor: goalColor(linkedGoal.priority) }}
                >
                  <Target size={15} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-xs text-fg-faint">Linked goal</span>
                  <span className="block text-sm font-medium text-fg truncate">
                    {linkedGoal.title}
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
