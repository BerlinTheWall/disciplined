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
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3 px-1">
        <button onClick={() => setSelectedDate(toISODate(addDays(selectedDateObj, -7)))} className="p-2 -m-2 text-fg-faint">
          <ChevronLeft size={20} />
        </button>
        <h2 className="text-base font-semibold text-fg">{formatMonthYear(selectedDateObj)}</h2>
        <button onClick={() => setSelectedDate(toISODate(addDays(selectedDateObj, 7)))} className="p-2 -m-2 text-fg-faint">
          <ChevronRight size={20} />
        </button>
      </div>

      <div className="flex justify-between gap-1">
        {/* Spacer to align day columns with the time axis gutter */}
        {leftGutter > 0 && <div style={{ width: leftGutter, flexShrink: 0 }} />}

        {weekDates.map((date) => {
          const iso = toISODate(date)
          const isSelected = iso === selectedDate
          const isToday = isSameDay(date, today)
          return (
            <button
              key={iso}
              onClick={() => setSelectedDate(iso)}
              className="flex flex-col items-center gap-1 flex-1 py-2 rounded-2xl"
              style={{ backgroundColor: isSelected ? 'var(--surface-inverse)' : 'transparent' }}
            >
              <span className={`text-[10px] uppercase ${isSelected ? 'text-fg-muted-inverse' : 'text-fg-faint'}`}>
                {getDayLabel(date)}
              </span>
              <span
                className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-medium ${
                  isSelected ? 'bg-surface text-fg' : isToday ? 'bg-rose-100 text-rose-600' : 'text-fg'
                }`}
              >
                {date.getDate()}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
