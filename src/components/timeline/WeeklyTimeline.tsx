import { useState } from 'react'
import { useTaskStore } from '../../store/taskStore'
import { useHabitStore } from '../../store/habitStore'
import { isHabitActiveOnDate } from '../../lib/habits'
import { getWeekDates, toISODate } from '../../lib/date'
import { minutesToPx, getPillHeight } from '../../lib/time'
import { ICONS } from '../../lib/icons'
import AddItemSheet from './AddItemSheet'
import type { EditItem } from './Timeline'
import type { Task } from '../../types/task'
import type { Habit } from '../../types/habits'

const DEFAULT_START_MINUTES = 6 * 60
const MIN_COL_HEIGHT = 400
const WEEKLY_PILL_WIDTH = 34

interface WeeklyPillProps {
  startMinutes: number
  durationMinutes: number
  color: string
  icon: keyof typeof ICONS
  completed: boolean
  startOffset: number
  onLongPress: () => void
  onToggle: () => void
}

function WeeklyPill({
  startMinutes,
  durationMinutes,
  color,
  icon,
  completed,
  startOffset,
  onLongPress,
  onToggle,
}: WeeklyPillProps) {
  const IconComponent = ICONS[icon] ?? ICONS.default
  const pillHeight = getPillHeight(durationMinutes)
  const top = minutesToPx(startMinutes - startOffset)

  return (
    <div
      className="absolute"
      style={{ top, left: '50%', transform: 'translateX(-50%)' }}
    >
      <button
        onContextMenu={(e) => { e.preventDefault(); onLongPress() }}
        onPointerDown={(e) => {
          const timer = setTimeout(() => onLongPress(), 500)
          const cancel = () => clearTimeout(timer)
          e.currentTarget.addEventListener('pointerup', cancel, { once: true })
          e.currentTarget.addEventListener('pointerleave', cancel, { once: true })
        }}
        onClick={onToggle}
        className="rounded-full flex items-center justify-center text-white shadow-sm active:scale-95 transition-transform"
        style={{
          width: WEEKLY_PILL_WIDTH,
          height: pillHeight,
          backgroundColor: color,
          opacity: completed ? 0.45 : 1,
        }}
      >
        <IconComponent size={13} />
      </button>
    </div>
  )
}

export default function WeeklyTimeline() {
  const tasks = useTaskStore((s) => s.tasks)
  const selectedDate = useTaskStore((s) => s.selectedDate)
  const setSelectedDate = useTaskStore((s) => s.setSelectedDate)
  const toggleTaskCompleted = useTaskStore((s) => s.toggleTaskCompleted)

  const habits = useHabitStore((s) => s.habits)
  const toggleHabitCompleted = useHabitStore((s) => s.toggleHabitCompleted)

  const [editItem, setEditItem] = useState<EditItem | null>(null)

  const selectedDateObj = new Date(selectedDate + 'T00:00:00')
  const weekDates = getWeekDates(selectedDateObj)

  type DayItem = {
    id: string
    startMinutes: number
    durationMinutes: number
    color: string
    icon: keyof typeof ICONS
    completed: boolean
    type: 'task' | 'habit'
  }

  const dayItems: DayItem[][] = weekDates.map((date) => {
    const iso = toISODate(date)
    const taskItems = tasks
      .filter((t) => t.date === iso)
      .map((t) => ({ id: t.id, startMinutes: t.startMinutes, durationMinutes: t.durationMinutes, color: t.color, icon: t.icon, completed: t.completed, type: 'task' as const }))

    const habitItems = habits
      .filter((h) => isHabitActiveOnDate(h, date))
      .map((h) => ({
        id: h.id,
        startMinutes: h.startMinutes,
        durationMinutes: h.durationMinutes,
        color: h.color,
        icon: h.icon,
        completed: h.completedDates.includes(iso),
        type: 'habit' as const,
      }))

    return [...taskItems, ...habitItems].sort((a, b) => a.startMinutes - b.startMinutes)
  })

  const allStartMinutes = dayItems.flat().map((i) => i.startMinutes)
  const startOffset =
    allStartMinutes.length > 0 ? Math.min(...allStartMinutes) : DEFAULT_START_MINUTES

  const latestEnd = dayItems.flat().reduce((max, item) => {
    return Math.max(max, item.startMinutes + item.durationMinutes)
  }, startOffset + 60 * 4)
  const containerHeight = Math.max(minutesToPx(latestEnd - startOffset) + 60, MIN_COL_HEIGHT)

  const firstHour = Math.floor(startOffset / 60)
  const lastHour = Math.ceil((latestEnd) / 60)
  const timeLabels: number[] = []
  for (let h = firstHour; h <= lastHour; h++) {
    timeLabels.push(h * 60)
  }

  function formatHourLabel(totalMinutes: number) {
    const h = Math.floor(totalMinutes / 60) % 24
    const period = h < 12 ? ' am' : ' pm'
    const display = h % 12 === 0 ? 12 : h % 12
    return `${display}${period}`
  }

  function handleToggle(item: DayItem, iso: string) {
    if (item.type === 'task') toggleTaskCompleted(item.id)
    else toggleHabitCompleted(item.id, iso)
  }

  function handleLongPress(item: DayItem) {
    if (item.type === 'task') {
      const task = tasks.find((t) => t.id === item.id)
      if (task) setEditItem({ type: 'task', data: task as Task })
    } else {
      const habit = habits.find((h) => h.id === item.id)
      if (habit) setEditItem({ type: 'habit', data: habit as Habit })
    }
  }

  return (
    <>
      <div className="flex overflow-x-hidden">
        {/* Time axis — labels only, no lines */}
        <div className="w-8 shrink-0 relative mt-5" style={{ height: containerHeight }}>
          {timeLabels.map((mins) => (
            <div
              key={mins}
              className="absolute right-0 text-[9px] text-fg-faint leading-none font-semibold"
              style={{ top: minutesToPx(mins - startOffset) - 4 }}
            >
              {formatHourLabel(mins)}
            </div>
          ))}
        </div>

        {/* Day columns */}
        {weekDates.map((date, di) => {
          const iso = toISODate(date)
          const isSelected = iso === selectedDate
          const items = dayItems[di]

          return (
            <div
              key={iso}
              className="flex-1 relative"
              style={{ height: containerHeight }}
              onClick={() => setSelectedDate(iso)}
            >
              {/* Selected day highlight */}
              {isSelected && (
                <div className="absolute inset-x-0.5 inset-y-0 rounded-xl bg-surface-alt pointer-events-none" />
              )}

              {/* Gradient connector lines between pills */}
              {items.slice(0, -1).map((item, i) => {
                const next = items[i + 1]
                const topY = minutesToPx(item.startMinutes - startOffset) + getPillHeight(item.durationMinutes)
                const bottomY = minutesToPx(next.startMinutes - startOffset)
                if (bottomY <= topY) return null
                const gradientId = `wgrad-${iso}-${item.id}-${next.id}`
                return (
                  <svg
                    key={`wline-${item.id}`}
                    className="absolute pointer-events-none"
                    style={{
                      left: '50%',
                      transform: 'translateX(-50%)',
                      top: topY,
                      width: 2,
                      height: bottomY - topY,
                      overflow: 'visible',
                    }}
                  >
                    <defs>
                      <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={item.color} />
                        <stop offset="100%" stopColor={next.color} />
                      </linearGradient>
                    </defs>
                    <rect x="0" y="0" width="2" height={bottomY - topY} fill={`url(#${gradientId})`} />
                  </svg>
                )
              })}

              {/* Pills */}
              {items.map((item) => (
                <WeeklyPill
                  key={item.id}
                  startMinutes={item.startMinutes}
                  durationMinutes={item.durationMinutes}
                  color={item.color}
                  icon={item.icon}
                  completed={item.completed}
                  startOffset={startOffset}
                  onToggle={() => handleToggle(item, iso)}
                  onLongPress={() => handleLongPress(item)}
                />
              ))}
            </div>
          )
        })}
      </div>

      <AddItemSheet
        isOpen={!!editItem}
        onClose={() => setEditItem(null)}
        editItem={editItem}
      />
    </>
  )
}
