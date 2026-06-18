import { Flame, Repeat } from 'lucide-react'
import { useHabitStore } from '../store/habitStore'
import { ICONS } from '../lib/icons'
import { todayISODate } from '../lib/date'
import { getHabitStreak, isHabitActiveOnDate } from '../lib/habits'

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

export default function HabitsPage() {
  const habits = useHabitStore((s) => s.habits)
  const today = new Date()
  const todayISO = todayISODate()

  if (habits.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center">
          <Repeat size={24} className="text-gray-400" />
        </div>
        <p className="text-base font-medium text-gray-900">No habits yet</p>
        <p className="text-sm text-gray-400 text-center">
          Go to the Schedule tab and tap + to add a repeating habit.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {habits.map((habit) => {
        const IconComponent = ICONS[habit.icon] ?? ICONS.default
        const streak = getHabitStreak(habit, today)
        const isActiveToday = isHabitActiveOnDate(habit, today)
        const completedToday = habit.completedDates.includes(todayISO)

        return (
          <div
            key={habit.id}
            className="flex items-center gap-4 p-4 rounded-2xl bg-gray-50"
          >
            {/* Colored icon pill */}
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
              style={{ backgroundColor: habit.color }}
            >
              <IconComponent size={18} className="text-white" />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 leading-tight">{habit.title}</p>

              {/* Active days dots */}
              <div className="flex gap-1 mt-1.5">
                {DAY_LABELS.map((label, i) => (
                  <span
                    key={i}
                    className={`w-5 h-5 rounded-full text-[9px] font-medium flex items-center justify-center ${
                      habit.daysOfWeek.includes(i)
                        ? 'bg-gray-900 text-white'
                        : 'bg-gray-200 text-gray-400'
                    }`}
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>

            {/* Streak + today status */}
            <div className="flex flex-col items-end gap-1 shrink-0">
              {streak > 0 && (
                <span className="flex items-center gap-0.5 text-sm font-semibold text-orange-500">
                  <Flame size={14} className="fill-orange-500" />
                  {streak}
                </span>
              )}
              {isActiveToday && (
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  completedToday
                    ? 'bg-green-100 text-green-600'
                    : 'bg-gray-100 text-gray-400'
                }`}>
                  {completedToday ? 'Done' : 'Pending'}
                </span>
              )}
              {!isActiveToday && (
                <span className="text-xs text-gray-300">Off today</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}