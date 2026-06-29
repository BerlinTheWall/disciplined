import { useContext, useState } from "react";
import { motion } from "framer-motion";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

import MonthYearPicker from "./MonthYearPicker";
import { WeekSwipeContext } from "./swipeController";
import SwipePager from "./SwipePager";
import {
  addDays,
  formatMonthYear,
  getDayLabel,
  getWeekDates,
  isSameDay,
  toISODate,
} from "@/lib/date";
import { tap } from "@/lib/motion";
import { useTaskStore } from "@/store/taskStore";

interface WeekHeaderProps {
  leftGutter?: number;
}

export default function WeekHeader({ leftGutter = 0 }: WeekHeaderProps) {
  const selectedDate = useTaskStore((s) => s.selectedDate);
  const setSelectedDate = useTaskStore((s) => s.setSelectedDate);
  // In weekly view, share the drag with the grid below so they move together.
  const sharedController = useContext(WeekSwipeContext);

  const [pickerOpen, setPickerOpen] = useState(false);

  const selectedDateObj = new Date(selectedDate + "T00:00:00");
  const today = new Date();

  function shiftWeek(delta: number) {
    setSelectedDate(toISODate(addDays(selectedDateObj, delta * 7)));
  }

  function jumpTo(date: Date) {
    setSelectedDate(toISODate(date));
  }

  // One week's row of day buttons, for the week containing `anchor`.
  function renderWeek(offset: -1 | 0 | 1) {
    const anchor = addDays(selectedDateObj, offset * 7);
    return (
      <div className="flex justify-between gap-1">
        {leftGutter > 0 && <div style={{ width: leftGutter, flexShrink: 0 }} />}

        {getWeekDates(anchor).map((date) => {
          const iso = toISODate(date);
          const isSelected = iso === selectedDate;
          const isToday = isSameDay(date, today);

          return (
            <button
              key={iso}
              onClick={() => setSelectedDate(iso)}
              className="flex flex-col items-center gap-1 flex-1 py-1"
            >
              <span
                className={`text-[11px] font-medium uppercase tracking-wide ${
                  isSelected ? "text-fg" : "text-fg-faint"
                }`}
              >
                {getDayLabel(date)}
              </span>

              <span
                className={`w-9 h-9 rounded-full flex items-center justify-center text-base font-medium ${
                  isSelected ? "bg-fg text-fg-inverse" : isToday ? "text-fg" : "text-fg-faint"
                }`}
              >
                {date.getDate()}
              </span>

              {/* Tiny dot marks today — always reserves space for alignment */}
              <span className={`w-1 h-1 rounded-full ${isToday ? "bg-rose-400" : "invisible"}`} />
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="mb-5">
      {/* Month row — tap the title to jump to any month/year */}
      <div className="flex items-center justify-between mb-3 px-1">
        <motion.button
          onClick={() => shiftWeek(-1)}
          whileTap={tap}
          className="p-2 -m-2 text-fg-faint"
        >
          <ChevronLeft size={18} />
        </motion.button>
        <motion.button
          onClick={() => setPickerOpen(true)}
          whileTap={tap}
          className="flex items-center gap-1 text-sm font-medium text-fg-faint uppercase tracking-widest"
        >
          {formatMonthYear(selectedDateObj)}
          <ChevronDown size={15} />
        </motion.button>
        <motion.button
          onClick={() => shiftWeek(1)}
          whileTap={tap}
          className="p-2 -m-2 text-fg-faint"
        >
          <ChevronRight size={18} />
        </motion.button>
      </div>

      {/* Swipe the strip to change weeks — reveals the neighbouring week as you
          drag. In weekly view it shares a controller with the grid so both move. */}
      <SwipePager
        controller={sharedController}
        onPrev={() => shiftWeek(-1)}
        onNext={() => shiftWeek(1)}
        pageKey={(offset) => toISODate(getWeekDates(addDays(selectedDateObj, offset * 7))[0])}
        renderPage={renderWeek}
      />

      <MonthYearPicker
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        value={selectedDateObj}
        onSelect={jumpTo}
      />
    </div>
  );
}
