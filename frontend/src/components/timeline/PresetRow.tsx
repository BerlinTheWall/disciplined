import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Pencil, X } from "lucide-react";
import { useShallow } from "zustand/shallow";

import type { EditItem } from "./Timeline";
import { todayISODate } from "@/lib/date";
import { ICONS, type IconKey } from "@/lib/icons";
import { tap } from "@/lib/motion";
import { BUILTIN_PRESETS, type TaskPreset } from "@/lib/presets";
import { formatTimeRange, nextFreeSlot } from "@/lib/time";
import { usePresetStore } from "@/store/presetStore";
import { useTaskStore } from "@/store/taskStore";

interface Confirmation {
  icon: IconKey;
  color: string;
  title: string;
  context: string;
  item: EditItem;
}

interface PresetRowProps {
  onEditDetails: (item: EditItem) => void;
}

// One-tap versions of tasks people add over and over — see
// C:\Users\Hooman\.claude\plans\glowing-noodling-blossom.md. Tapping a chip
// skips the wizard entirely: it drops a fully-configured task into the next
// free slot on the day currently being viewed, then offers a quick "Edit
// details" escape hatch (same shape as QuickAddBar's confirmation) in case the
// guessed slot is wrong.
export default function PresetRow({ onEditDetails }: PresetRowProps) {
  const [selectedDate, tasks, addTask] = useTaskStore(
    useShallow((state) => [state.selectedDate, state.tasks, state.addTask])
  );
  const [userPresets, removePreset] = usePresetStore(
    useShallow((state) => [state.presets, state.removePreset])
  );

  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const presets = [...BUILTIN_PRESETS, ...userPresets];
  if (presets.length === 0) return null;

  function addPresetTask(preset: TaskPreset) {
    const dayTasks = tasks.filter((t) => t.date === selectedDate);
    const now = new Date();
    const notBefore =
      selectedDate === todayISODate() ? now.getHours() * 60 + now.getMinutes() : 8 * 60;
    const startMinutes = nextFreeSlot(dayTasks, preset.durationMinutes, notBefore);

    const id = addTask({
      title: preset.title,
      startMinutes,
      durationMinutes: preset.durationMinutes,
      color: preset.color,
      icon: preset.icon,
      date: selectedDate,
      priority: preset.priority,
      reminderMinutesBefore: preset.reminderMinutesBefore,
    });

    if (hideTimer.current) clearTimeout(hideTimer.current);
    setConfirmation({
      icon: preset.icon,
      color: preset.color,
      title: `Added ${preset.title}`,
      context: formatTimeRange(startMinutes, preset.durationMinutes),
      item: {
        type: "task",
        data: {
          id,
          title: preset.title,
          startMinutes,
          durationMinutes: preset.durationMinutes,
          color: preset.color,
          icon: preset.icon,
          completed: false,
          date: selectedDate,
          priority: preset.priority,
          reminderMinutesBefore: preset.reminderMinutesBefore,
        },
      },
    });
    hideTimer.current = setTimeout(() => setConfirmation(null), 4000);
  }

  function handleEditDetails() {
    if (!confirmation) return;
    if (hideTimer.current) clearTimeout(hideTimer.current);
    const item = confirmation.item;
    setConfirmation(null);
    onEditDetails(item);
  }

  const ConfirmIcon = confirmation ? (ICONS[confirmation.icon] ?? ICONS.default) : null;

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1">
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
              <span className="text-sm font-medium text-fg whitespace-nowrap">{preset.title}</span>
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

      <AnimatePresence>
        {confirmation && ConfirmIcon && (
          <motion.div
            initial={{ opacity: 0, y: -6, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -6, height: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-3 bg-surface-alt rounded-2xl p-2.5 mt-2">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                style={{ backgroundColor: confirmation.color, color: "#111827" }}
              >
                <ConfirmIcon size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-fg truncate">{confirmation.title}</p>
                <p className="text-xs text-fg-faint truncate">{confirmation.context}</p>
              </div>
              <motion.button
                onClick={handleEditDetails}
                whileTap={tap}
                className="flex items-center gap-1 text-xs font-medium text-fg-muted shrink-0 px-2 py-1"
              >
                <Pencil size={13} />
                Edit details
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
