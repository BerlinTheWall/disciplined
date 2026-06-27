import { useState } from 'react'
import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTaskStore } from '../../store/taskStore'
import { getWeekDates, addDays, formatMonthYear, getDayLabel, toISODate, isSameDay } from '../../lib/date'
import { spring, tap } from '../../lib/motion'
import MonthYearPicker from './MonthYearPicker'

interface WeekHeaderProps {
  leftGutter?: number
}

// Slide direction: +1 moves forward in time (new week enters from the right),
// -1 backward.
const weekVariants = {
  enter: (d: number) => ({ x: d > 0 ? '100%' : '-100%', opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (d: number) => ({ x: d > 0 ? '-100%' : '100%', opacity: 0 }),
}

const STRIP_HEIGHT = 60
const SWIPE_DISTANCE = 50 // px dragged to commit a week change
const SWIPE_VELOCITY = 400 // …or a fast flick

export default function WeekHeader({ leftGutter = 0 }: WeekHeaderProps) {
  const selectedDate = useTaskStore((s) => s.selectedDate)
  const setSelectedDate = useTaskStore((s) => s.setSelectedDate)
  // Slide direction, set by whichever navigation moved the date (header here or
  // a swipe on the timeline content), so the strip always slides the right way.
  const dir = useTaskStore((s) => s.navDir)

  const [pickerOpen, setPickerOpen] = useState(false)

  const selectedDateObj = new Date(selectedDate + 'T00:00:00')
  const weekDates = getWeekDates(selectedDateObj)
  const today = new Date()
  // Keying the strip on its Monday drives the slide animation when the week changes.
  const weekKey = toISODate(weekDates[0])

  function shiftWeek(delta: number) {
    setSelectedDate(toISODate(addDays(selectedDateObj, delta * 7)), delta)
  }

  function jumpTo(date: Date) {
    setSelectedDate(toISODate(date), date.getTime() >= selectedDateObj.getTime() ? 1 : -1)
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
          <ChevronLeft size={16} />
        </motion.button>
        <motion.button
          onClick={() => setPickerOpen(true)}
          whileTap={tap}
          className="flex items-center gap-1 text-[11px] font-medium text-fg-faint uppercase tracking-widest"
        >
          {formatMonthYear(selectedDateObj)}
          <ChevronDown size={13} />
        </motion.button>
        <motion.button
          onClick={() => shiftWeek(1)}
          whileTap={tap}
          className="p-2 -m-2 text-fg-faint"
        >
          <ChevronRight size={16} />
        </motion.button>
      </div>

      {/* Swipeable week strip: drag horizontally to change weeks; the strip
          slides in the swipe direction. Fixed-height clip box with absolutely
          positioned strips so the entering/exiting weeks overlap cleanly. */}
      <div className="overflow-hidden relative" style={{ height: STRIP_HEIGHT }}>
        <motion.div
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.25}
          onDragEnd={(_, info) => {
            if (info.offset.x <= -SWIPE_DISTANCE || info.velocity.x <= -SWIPE_VELOCITY) shiftWeek(1)
            else if (info.offset.x >= SWIPE_DISTANCE || info.velocity.x >= SWIPE_VELOCITY) shiftWeek(-1)
          }}
          className="absolute inset-0 touch-pan-y"
        >
          <AnimatePresence custom={dir} initial={false}>
            <motion.div
              key={weekKey}
              custom={dir}
              variants={weekVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={spring.gentle}
              className="absolute inset-0 flex justify-between gap-1"
            >
              {leftGutter > 0 && <div style={{ width: leftGutter, flexShrink: 0 }} />}

              {weekDates.map((date) => {
                const iso = toISODate(date)
                const isSelected = iso === selectedDate
                const isToday = isSameDay(date, today)

                return (
                  <button
                    key={iso}
                    onClick={() => setSelectedDate(iso)}
                    className="flex flex-col items-center gap-1 flex-1 py-1"
                  >
                    <span className={`text-[9px] font-medium uppercase tracking-wide ${
                      isSelected ? 'text-fg' : 'text-fg-faint'
                    }`}>
                      {getDayLabel(date)}
                    </span>

                    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-medium ${
                      isSelected
                        ? 'bg-fg text-fg-inverse'
                        : isToday
                          ? 'text-fg'
                          : 'text-fg-faint'
                    }`}>
                      {date.getDate()}
                    </span>

                    {/* Tiny dot marks today — always reserves space for alignment */}
                    <span className={`w-1 h-1 rounded-full ${isToday ? 'bg-rose-400' : 'invisible'}`} />
                  </button>
                )
              })}
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </div>

      <MonthYearPicker
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        value={selectedDateObj}
        onSelect={jumpTo}
      />
    </div>
  )
}
