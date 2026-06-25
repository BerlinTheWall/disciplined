import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, Check } from "lucide-react";
import { ICONS } from "../../lib/icons";
import { formatTimeLabel } from "../../lib/time";
import { spring, tap } from "../../lib/motion";
import type { ScheduleRowData } from "./ScheduleRow";

interface DoneTrayProps {
  items: ScheduleRowData[];
  onToggle: (id: string) => void;
  onEdit: (id: string) => void;
}

// A collapsed shelf at the bottom of the day. Completed tasks leave the timeline
// and land here as a compact list, so the schedule above only shows what's left
// to do. Tapping a row's check sends it back up to the timeline (un-completes).
export default function DoneTray({ items, onToggle, onEdit }: DoneTrayProps) {
  const [open, setOpen] = useState(false);

  if (items.length === 0) return null;

  const sorted = [...items].sort((a, b) => a.startMinutes - b.startMinutes);

  return (
    <div className="mt-3 border-t border-border-strong">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 py-3 select-none"
      >
        <motion.span
          className="text-fg-faint flex"
          animate={{ rotate: open ? 90 : 0 }}
          transition={spring.snappy}
        >
          <ChevronRight size={18} />
        </motion.span>
        <span className="text-sm font-medium text-fg-muted">
          Completed ({items.length})
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={spring.gentle}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-1 pb-3">
              {sorted.map((item) => {
                const IconComponent = ICONS[item.icon] ?? ICONS.default;
                return (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={spring.snappy}
                    className="flex items-center gap-3 py-1"
                  >
                    <div
                      onClick={() => onEdit(item.id)}
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white shrink-0 cursor-pointer opacity-70"
                      style={{ backgroundColor: item.color }}
                    >
                      <IconComponent size={16} />
                    </div>

                    <div
                      onClick={() => onEdit(item.id)}
                      className="flex-1 min-w-0 cursor-pointer"
                    >
                      <span className="block truncate text-base text-fg-faint line-through">
                        {item.title}
                      </span>
                    </div>

                    <span className="text-xs text-fg-faint tabular-nums shrink-0">
                      {formatTimeLabel(item.startMinutes)}
                    </span>

                    <motion.button
                      onClick={() => onToggle(item.id)}
                      whileTap={tap}
                      className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-white"
                      style={{ backgroundColor: item.color }}
                      aria-label="Mark as not done"
                    >
                      <Check size={13} strokeWidth={3.5} />
                    </motion.button>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
