/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { useScrollLock } from "@/hooks/useScrollLock";
import { spring, tap } from "@/lib/motion";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface MonthYearPickerProps {
  isOpen: boolean;
  onClose: () => void;
  value: Date; // currently selected date
  onSelect: (date: Date) => void;
}

export default function MonthYearPicker({
  isOpen,
  onClose,
  value,
  onSelect,
}: MonthYearPickerProps) {
  useScrollLock(isOpen);
  const [year, setYear] = useState(value.getFullYear());

  // Re-sync the displayed year to the selection each time the picker opens.
  useEffect(() => {
    if (isOpen) setYear(value.getFullYear());
  }, [isOpen]);

  const today = new Date();

  function pick(monthIndex: number) {
    // Picking the current month lands on today; any other month lands on its 1st.
    const landing =
      year === today.getFullYear() && monthIndex === today.getMonth()
        ? new Date(today.getFullYear(), today.getMonth(), today.getDate())
        : new Date(year, monthIndex, 1);
    onSelect(landing);
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 pointer-events-none">
            <motion.div
              className="w-full max-w-xs bg-surface rounded-3xl shadow-xl p-4 pointer-events-auto"
              initial={{ opacity: 0, scale: 0.9, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 12 }}
              transition={spring.snappy}
            >
              {/* Year row */}
              <div className="flex items-center justify-between mb-4">
                <motion.button
                  onClick={() => setYear((y) => y - 1)}
                  whileTap={tap}
                  className="w-9 h-9 rounded-full bg-surface-raised flex items-center justify-center text-fg-muted"
                >
                  <ChevronLeft size={18} />
                </motion.button>
                <span className="text-lg font-bold text-fg tabular-nums">{year}</span>
                <motion.button
                  onClick={() => setYear((y) => y + 1)}
                  whileTap={tap}
                  className="w-9 h-9 rounded-full bg-surface-raised flex items-center justify-center text-fg-muted"
                >
                  <ChevronRight size={18} />
                </motion.button>
              </div>

              {/* Month grid */}
              <div className="grid grid-cols-3 gap-2">
                {MONTHS.map((label, i) => {
                  const isSelected = year === value.getFullYear() && i === value.getMonth();
                  const isThisMonth = year === today.getFullYear() && i === today.getMonth();
                  return (
                    <motion.button
                      key={label}
                      onClick={() => pick(i)}
                      whileTap={tap}
                      className={`py-2.5 rounded-xl text-sm font-medium transition-colors ${
                        isSelected
                          ? "bg-surface-inverse text-fg-inverse"
                          : isThisMonth
                            ? "bg-surface-alt text-fg"
                            : "bg-surface-raised text-fg-muted"
                      }`}
                    >
                      {label}
                    </motion.button>
                  );
                })}
              </div>

              {/* Today shortcut */}
              <motion.button
                onClick={() => {
                  onSelect(new Date(today.getFullYear(), today.getMonth(), today.getDate()));
                  onClose();
                }}
                whileTap={tap}
                className="w-full mt-4 py-2.5 rounded-xl text-sm font-medium bg-surface-raised text-fg"
              >
                Jump to today
              </motion.button>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
