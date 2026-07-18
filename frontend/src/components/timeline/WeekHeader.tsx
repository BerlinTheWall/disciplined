import { useContext, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useShallow } from "zustand/shallow";

import CalendarMonth from "./CalendarMonth";
import { useSwipeController, WeekSwipeContext } from "./swipeController";
import SwipePager from "./SwipePager";
import { useScrollLock } from "@/hooks/useScrollLock";
import {
  addDays,
  formatMonthYear,
  getDayLabel,
  getWeekDates,
  isSameDay,
  todayISODate,
  toISODate,
} from "@/lib/date";
import { spring, tap } from "@/lib/motion";
import { useTaskStore } from "@/store/taskStore";

interface WeekHeaderProps {
  leftGutter?: number;
}

export default function WeekHeader({ leftGutter = 0 }: WeekHeaderProps) {
  const [selectedDate, setSelectedDate] = useTaskStore(
    useShallow((state) => [state.selectedDate, state.setSelectedDate])
  );
  // In weekly view, share the drag with the grid below so they move together.
  const sharedController = useContext(WeekSwipeContext);

  const [pickerOpen, setPickerOpen] = useState(false);
  useScrollLock(pickerOpen);

  const selectedDateObj = new Date(selectedDate + "T00:00:00");
  const today = new Date();

  function shiftWeek(delta: number) {
    setSelectedDate(toISODate(addDays(selectedDateObj, delta * 7)));
  }

  // The arrows drive the same slide a swipe produces: settle the pager's
  // motion value one page-width over, committing the week change on arrival.
  // In weekly view the shared controller moves the grid below in sync; in
  // daily view WeekHeader owns the controller so the arrows can reach it.
  const internalController = useSwipeController(
    () => shiftWeek(-1),
    () => shiftWeek(1)
  );
  const controller = sharedController ?? internalController;
  const stripRef = useRef<HTMLDivElement>(null);

  function arrowShift(delta: -1 | 1) {
    const width = stripRef.current?.offsetWidth ?? 0;
    if (width === 0) {
      shiftWeek(delta); // measurement failed — change the week without the slide
      return;
    }
    if (delta === 1) controller.settle(-width, controller.onNext);
    else controller.settle(width, controller.onPrev);
  }

  function jumpTo(iso: string) {
    setSelectedDate(iso);
    setPickerOpen(false);
  }

  // One week's row of day buttons, for the week containing `anchor`.
  function renderWeek(offset: -1 | 0 | 1) {
    const anchor = addDays(selectedDateObj, offset * 7);
    return (
      <div className="flex gap-2">
        {leftGutter > 0 && <div style={{ width: leftGutter, flexShrink: 0 }} />}

        {getWeekDates(anchor).map((date, i, week) => {
          const iso = toISODate(date);
          const isSelected = iso === selectedDate;
          const isToday = isSameDay(date, today);

          // The pages are clipped horizontally (so neighbouring weeks don't bleed
          // across the swipe seam), so the edge pills scale from their inner edge
          // — first grows rightward, last grows leftward — keeping the outer edge
          // flush with the boundary instead of being cut off.
          const scaleOrigin =
            i === 0 ? "left center" : i === week.length - 1 ? "right center" : "center";

          // Each day is its own floating pill (a slightly raised surface so it
          // reads against the gradient). Selecting one springs the whole pill;
          // today is marked by a red dot below the pill (outside it, so the
          // pill's height never changes).
          return (
            <div key={iso} className="flex-1 flex flex-col items-center gap-1.5">
              <motion.button
                onClick={() => setSelectedDate(iso)}
                whileTap={tap}
                animate={{ scale: isSelected ? 1.05 : 1 }}
                transition={spring.snappy}
                style={{ transformOrigin: scaleOrigin }}
                className="w-full flex flex-col items-center gap-2.5 rounded-full bg-surface-raised shadow-card py-1.5"
              >
                <span
                  className={`text-xs pt-2 ${isSelected ? "font-bold text-fg" : "font-medium text-fg-muted"}`}
                >
                  {getDayLabel(date)}
                </span>
                <span
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-base font-semibold ${
                    isSelected ? "bg-fg text-fg-inverse" : "text-fg"
                  }`}
                >
                  {date.getDate()}
                </span>
              </motion.button>

              {/* Red dot marks today, outside the pill so its height is unchanged */}
              <span
                className={`w-1.5 h-1.5 rounded-full ${isToday ? "bg-rose-400" : "invisible"}`}
              />
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="mb-2">
      {/* Month row — tap the title to jump to any month/year */}
      <div className="flex items-center justify-between mb-3 px-1">
        <motion.button
          onClick={() => arrowShift(-1)}
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
          onClick={() => arrowShift(1)}
          whileTap={tap}
          className="p-2 -m-2 text-fg-faint"
        >
          <ChevronRight size={18} />
        </motion.button>
      </div>

      {/* Swipe the strip to change weeks — reveals the neighbouring week as you
          drag. In weekly view it shares a controller with the grid so both move.
          The controller is always supplied from here so the arrows above can
          drive the same slide. */}
      <div ref={stripRef}>
        <SwipePager
          controller={controller}
          pageKey={(offset) => toISODate(getWeekDates(addDays(selectedDateObj, offset * 7))[0])}
          renderPage={renderWeek}
        />
      </div>

      {/* Tap the month title → the same month calendar the edit sheet uses;
          picking a day jumps straight to it. */}
      <AnimatePresence>
        {pickerOpen && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/40 z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPickerOpen(false)}
            />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
              <motion.div
                className="w-full max-w-sm bg-surface rounded-3xl shadow-xl p-4 pointer-events-auto"
                initial={{ opacity: 0, scale: 0.9, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 12 }}
                transition={spring.snappy}
              >
                <CalendarMonth value={selectedDate} color="#fb7185" onChange={jumpTo} />

                <motion.button
                  onClick={() => jumpTo(todayISODate())}
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
    </div>
  );
}
