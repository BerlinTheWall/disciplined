import { DndContext, type DragEndEvent } from '@dnd-kit/core'
import { useTaskStore } from '../../store/taskStore'
import { useHabitStore } from '../../store/habitStore'
import { isHabitActiveOnDate, getHabitStreak } from '../../lib/habits'
import { minutesToPx, pxToMinutes, snapToGrid, getPillHeight } from '../../lib/time'
import ScheduleRow, { MIN_ROW_HEIGHT, type ScheduleRowData } from './ScheduleRow'

const ICON_CENTER_X = 80

export default function Timeline() {
  const tasks = useTaskStore((s) => s.tasks)
  const selectedDate = useTaskStore((s) => s.selectedDate)
  const updateTaskTime = useTaskStore((s) => s.updateTaskTime)
  const updateTaskDuration = useTaskStore((s) => s.updateTaskDuration)
  const toggleTaskCompleted = useTaskStore((s) => s.toggleTaskCompleted)

  const habits = useHabitStore((s) => s.habits)
  const updateHabitTime = useHabitStore((s) => s.updateHabitTime)
  const updateHabitDuration = useHabitStore((s) => s.updateHabitDuration)
  const toggleHabitCompleted = useHabitStore((s) => s.toggleHabitCompleted)

  const selectedDateObj = new Date(selectedDate + 'T00:00:00')

  const taskItems: ScheduleRowData[] = tasks.filter((t) => t.date === selectedDate)

  const habitItems: ScheduleRowData[] = habits
    .filter((h) => isHabitActiveOnDate(h, selectedDateObj))
    .map((h) => ({
      id: h.id,
      title: h.title,
      startMinutes: h.startMinutes,
      durationMinutes: h.durationMinutes,
      color: h.color,
      icon: h.icon,
      completed: h.completedDates.includes(selectedDate),
      streak: getHabitStreak(h, selectedDateObj),
    }))

  const items = [...taskItems, ...habitItems].sort((a, b) => a.startMinutes - b.startMinutes)

  function handleToggle(id: string) {
    if (tasks.some((t) => t.id === id)) toggleTaskCompleted(id)
    else toggleHabitCompleted(id, selectedDate)
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, delta } = event
    const activeId = String(active.id)
    const deltaMinutes = snapToGrid(pxToMinutes(delta.y))
    const isResize = activeId.startsWith('resize-')
    const targetId = isResize ? activeId.replace('resize-', '') : activeId

    const task = tasks.find((t) => t.id === targetId)
    if (task) {
      isResize ? updateTaskDuration(targetId, task.durationMinutes + deltaMinutes) : updateTaskTime(targetId, task.startMinutes + deltaMinutes)
      return
    }
    const habit = habits.find((h) => h.id === targetId)
    if (habit) {
      isResize ? updateHabitDuration(targetId, habit.durationMinutes + deltaMinutes) : updateHabitTime(targetId, habit.startMinutes + deltaMinutes)
    }
  }

  const containerHeight = minutesToPx(24 * 60) + MIN_ROW_HEIGHT

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div className="relative" style={{ height: containerHeight }}>
        {items.slice(0, -1).map((item, i) => {
          const next = items[i + 1]
          const topY = minutesToPx(item.startMinutes) + getPillHeight(item.durationMinutes) / 2
          const bottomY = minutesToPx(next.startMinutes) + getPillHeight(next.durationMinutes) / 2
          return <div key={`line-${item.id}`} className="absolute bg-gray-200" style={{ left: ICON_CENTER_X - 1, top: topY, height: bottomY - topY, width: 2 }} />
        })}
        {items.map((item) => (
          <ScheduleRow key={item.id} {...item} onToggle={handleToggle} />
        ))}
      </div>
    </DndContext>
  )
}