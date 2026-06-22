import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTaskStore } from '../../store/taskStore'
import { getWeekDates, addDays, formatMonthYear, getDayLabel, toISODate, isSameDay } from '../../lib/date'

interface WeekHeaderProps {
  leftGutter?: number
}

export default function WeekHeader({ leftGutter = 0 }: WeekHeaderProps) {
  const selectedDate = useTaskStore((s) => s.selectedDate)
  const setSelectedDate = useTaskStore((s) => s.setSelectedDate)

  const selectedDateObj = new Date(selectedDate + 'T00:00:00')
  const weekDates = getWeekDates(selectedDateObj)
  const today = new Date()

  return (
    <div className="mb-5">
      {/* Month row — very understated */}
      <div className="flex items-center justify-between mb-3 px-1">
        <button
          onClick={() => setSelectedDate(toISODate(addDays(selectedDateObj, -7)))}
          className="p-2 -m-2 text-fg-faint"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="text-[11px] font-medium text-fg-faint uppercase tracking-widest">
          {formatMonthYear(selectedDateObj)}
        </span>
        <button
          onClick={() => setSelectedDate(toISODate(addDays(selectedDateObj, 7)))}
          className="p-2 -m-2 text-fg-faint"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="flex justify-between gap-1">
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
      </div>
    </div>
  )
}
