import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, Circle, Pencil, X, Flame } from 'lucide-react'
import { useTaskStore } from '../../store/taskStore'
import { useHabitStore } from '../../store/habitStore'
import { isHabitActiveOnDate, getHabitStreak } from '../../lib/habits'
import { getWeekDates, toISODate } from '../../lib/date'
import { minutesToPx, pxToMinutes, formatTimeRange } from '../../lib/time'
import { ICONS } from '../../lib/icons'
import { useScrollLock } from '../../hooks/useScrollLock'
import { spring, tap } from '../../lib/motion'
import AddItemSheet from './AddItemSheet'
import type { EditItem } from './Timeline'
import type { Task } from '../../types/task'
import type { Habit } from '../../types/habits'

const DEFAULT_START_MINUTES = 6 * 60
const MIN_COL_HEIGHT = 400
const WEEKLY_PILL_WIDTH = 34

function isLightColor(hex: string) {
  const c = hex.replace('#', '')
  const r = parseInt(c.slice(0, 2), 16)
  const g = parseInt(c.slice(2, 4), 16)
  const b = parseInt(c.slice(4, 6), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62
}

function formatDateLabel(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

// Empty stretches (no event on ANY day of the week) longer than this collapse to
// a small fixed band, so the timeline doesn't waste space on dead time. Only
// week-wide empty time can collapse — the axis is shared, so every column must
// agree on where each minute sits.
const COLLAPSE_GAP_THRESHOLD_MIN = 75
const COLLAPSED_GAP_PX = 26
// Weekly pills are sized by real duration (so they line up with the hour grid:
// 30 min = half an hour's height), with a floor so very short tasks stay
// tappable.
const MIN_WEEKLY_PILL_PX = 22
function weeklyPillHeight(durationMinutes: number) {
  return Math.max(minutesToPx(durationMinutes), MIN_WEEKLY_PILL_PX)
}

interface ScaleBlock {
  startMin: number
  endMin: number
  topY: number
}
interface ScaleGap {
  topY: number
  height: number
  minutes: number
}
interface TimeScale {
  mapMinutes: (min: number) => number
  height: number
  blocks: ScaleBlock[]
  gaps: ScaleGap[]
}

// A piecewise-linear minute→pixel scale shared by the axis and all day columns.
// Occupied stretches keep the real time scale; long week-wide empty stretches
// collapse to COLLAPSED_GAP_PX.
function buildTimeScale(
  intervals: { start: number; end: number }[],
  domainStart: number,
  domainEnd: number,
): TimeScale {
  if (intervals.length === 0) {
    return {
      mapMinutes: (m) => minutesToPx(Math.max(0, m - domainStart)),
      height: minutesToPx(Math.max(0, domainEnd - domainStart)),
      blocks: [{ startMin: domainStart, endMin: domainEnd, topY: 0 }],
      gaps: [],
    }
  }

  // Merge intervals that overlap or sit within the threshold of each other —
  // small in-between gaps stay at real scale; only wider ones collapse.
  const sorted = [...intervals].sort((a, b) => a.start - b.start)
  const merged: { start: number; end: number }[] = []
  for (const iv of sorted) {
    const last = merged[merged.length - 1]
    if (last && iv.start - last.end < COLLAPSE_GAP_THRESHOLD_MIN) {
      last.end = Math.max(last.end, iv.end)
    } else {
      merged.push({ start: iv.start, end: iv.end })
    }
  }
  merged[0].start = Math.min(merged[0].start, domainStart)
  merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, domainEnd)

  const blocks: ScaleBlock[] = []
  const gaps: ScaleGap[] = []
  let cursorY = 0
  for (let i = 0; i < merged.length; i++) {
    const m = merged[i]
    blocks.push({ startMin: m.start, endMin: m.end, topY: cursorY })
    cursorY += minutesToPx(m.end - m.start)
    const next = merged[i + 1]
    if (next) {
      gaps.push({ topY: cursorY, height: COLLAPSED_GAP_PX, minutes: next.start - m.end })
      cursorY += COLLAPSED_GAP_PX
    }
  }

  const mapMinutes = (min: number) => {
    if (min <= blocks[0].startMin) return blocks[0].topY
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i]
      if (min <= b.endMin) return b.topY + minutesToPx(min - b.startMin)
      const next = blocks[i + 1]
      if (next && min < next.startMin) {
        // Inside a collapsed gap: interpolate across the fixed band so a
        // connector passing through still lands proportionally.
        const gapTopY = b.topY + minutesToPx(b.endMin - b.startMin)
        const frac = (min - b.endMin) / (next.startMin - b.endMin)
        return gapTopY + frac * COLLAPSED_GAP_PX
      }
    }
    const last = blocks[blocks.length - 1]
    return last.topY + minutesToPx(last.endMin - last.startMin)
  }

  return { mapMinutes, height: cursorY, blocks, gaps }
}

interface WeeklyPillProps {
  top: number
  durationMinutes: number
  color: string
  icon: keyof typeof ICONS
  completed: boolean
  onOpen: () => void
}

function WeeklyPill({
  top,
  durationMinutes,
  color,
  icon,
  completed,
  onOpen,
}: WeeklyPillProps) {
  const IconComponent = ICONS[icon] ?? ICONS.default
  const pillHeight = weeklyPillHeight(durationMinutes)

  return (
    <div
      className="absolute"
      style={{ top, left: '50%', transform: 'translateX(-50%)' }}
    >
      <button
        onClick={onOpen}
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
    title: string
    startMinutes: number
    durationMinutes: number
    color: string
    icon: keyof typeof ICONS
    completed: boolean
    type: 'task' | 'habit'
  }

  // The popup snapshots the tapped item plus the day it was opened from and (for
  // habits) the running streak.
  type DetailItem = DayItem & { iso: string; streak?: number }

  const [detail, setDetail] = useState<DetailItem | null>(null)
  useScrollLock(!!detail)

  const dayItems: DayItem[][] = weekDates.map((date) => {
    const iso = toISODate(date)
    const taskItems = tasks
      .filter((t) => t.date === iso)
      .map((t) => ({ id: t.id, title: t.title, startMinutes: t.startMinutes, durationMinutes: t.durationMinutes, color: t.color, icon: t.icon, completed: t.completed, type: 'task' as const }))

    const habitItems = habits
      .filter((h) => isHabitActiveOnDate(h, date))
      .map((h) => ({
        id: h.id,
        title: h.title,
        startMinutes: h.startMinutes,
        durationMinutes: h.durationMinutes,
        color: h.color,
        icon: h.icon,
        completed: h.completedDates.includes(iso),
        type: 'habit' as const,
      }))

    return [...taskItems, ...habitItems].sort((a, b) => a.startMinutes - b.startMinutes)
  })

  const flatItems = dayItems.flat()
  const allStartMinutes = flatItems.map((i) => i.startMinutes)
  // Anchor the grid to the whole hour at or before the earliest item, so the
  // first hour label sits exactly at the top of the column.
  const earliestStart =
    allStartMinutes.length > 0 ? Math.min(...allStartMinutes) : DEFAULT_START_MINUTES
  const startOffset = Math.floor(earliestStart / 60) * 60

  const latestEnd = flatItems.reduce((max, item) => {
    return Math.max(max, item.startMinutes + item.durationMinutes)
  }, startOffset + 60 * 4)

  // Occupied time across the whole week (each event reserves at least the
  // minimum pill's worth of room). The scale keeps these stretches at real scale
  // and collapses the long empty stretches between them.
  const minPillMinutes = pxToMinutes(MIN_WEEKLY_PILL_PX)
  const occupied = flatItems.map((i) => ({
    start: i.startMinutes,
    end: i.startMinutes + Math.max(i.durationMinutes, minPillMinutes),
  }))
  const scale = buildTimeScale(occupied, startOffset, latestEnd)
  const containerHeight = Math.max(scale.height + 40, MIN_COL_HEIGHT)

  // Hour labels, but only those landing inside an occupied (real-scale) block —
  // hours buried in a collapsed gap are skipped.
  const firstHour = Math.floor(startOffset / 60)
  const lastHour = Math.ceil(latestEnd / 60)
  const timeLabels: number[] = []
  for (let h = firstHour; h <= lastHour; h++) {
    const mins = h * 60
    if (scale.blocks.some((b) => mins >= b.startMin && mins <= b.endMin)) {
      timeLabels.push(mins)
    }
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

  // Tapping a pill opens a detail popup (instead of toggling directly).
  function handleOpen(item: DayItem, iso: string) {
    let streak: number | undefined
    if (item.type === 'habit') {
      const habit = habits.find((h) => h.id === item.id)
      if (habit) streak = getHabitStreak(habit, new Date(iso + 'T00:00:00'))
    }
    setDetail({ ...item, iso, streak })
  }

  function toggleDetail() {
    if (!detail) return
    handleToggle(detail, detail.iso)
    // Flip the popup to its new (completed) state so the user sees the change,
    // then close it a beat later.
    setDetail({ ...detail, completed: !detail.completed })
  }

  function openEditFromDetail() {
    if (!detail) return
    handleLongPress(detail)
    setDetail(null)
  }

  return (
    <>
      {/* gap-1 + a 32px axis match the WeekHeader's gutter and column gaps, so
          each day column lines up under its weekday label. pt-2 gives the top
          hour label room (it's nudged up to center on the hour line). */}
      <div className="flex overflow-x-hidden gap-1 pt-2">
        {/* Time axis — labels only, no lines */}
        <div className="w-8 shrink-0 relative" style={{ height: containerHeight }}>
          {timeLabels.map((mins) => (
            <div
              key={mins}
              className="absolute right-0 text-[9px] text-fg-faint leading-none font-semibold"
              style={{ top: scale.mapMinutes(mins) - 4 }}
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

              {/* Collapsed-gap markers: a faint dashed divider where week-wide
                  empty time was squeezed out. */}
              {scale.gaps.map((g, gi) => (
                <div
                  key={`gap-${gi}`}
                  className="absolute left-1 right-1 border-t border-dashed border-border pointer-events-none"
                  style={{ top: g.topY + g.height / 2 }}
                />
              ))}

              {/* Gradient connector lines between pills */}
              {items.slice(0, -1).map((item, i) => {
                const next = items[i + 1]
                const topY = scale.mapMinutes(item.startMinutes) + weeklyPillHeight(item.durationMinutes)
                const bottomY = scale.mapMinutes(next.startMinutes)
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
                  top={scale.mapMinutes(item.startMinutes)}
                  durationMinutes={item.durationMinutes}
                  color={item.color}
                  icon={item.icon}
                  completed={item.completed}
                  onOpen={() => handleOpen(item, iso)}
                />
              ))}
            </div>
          )
        })}
      </div>

      {/* Task detail popup — opened by tapping a pill */}
      <AnimatePresence>
        {detail && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/40 z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDetail(null)}
            />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-6 pointer-events-none">
              {(() => {
                const Icon = ICONS[detail.icon] ?? ICONS.default
                const light = isLightColor(detail.color)
                const onColor = light ? '#111827' : '#ffffff'
                const faded = light ? 'rgba(17,24,39,0.7)' : 'rgba(255,255,255,0.85)'
                const closeBg = light ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.25)'
                return (
                  <motion.div
                    className="w-full max-w-xs bg-surface rounded-3xl overflow-hidden shadow-xl pointer-events-auto"
                    initial={{ opacity: 0, scale: 0.9, y: 12 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 12 }}
                    transition={spring.snappy}
                  >
                    {/* Colored header */}
                    <div
                      className="px-5 pt-5 pb-4 relative"
                      style={{ backgroundColor: detail.color }}
                    >
                      <motion.button
                        onClick={() => setDetail(null)}
                        whileTap={tap}
                        className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: closeBg, color: onColor }}
                      >
                        <X size={16} />
                      </motion.button>
                      <div className="flex items-center gap-3 pr-8">
                        <div
                          className="w-12 h-12 rounded-full border-2 border-white/70 flex items-center justify-center shrink-0"
                          style={{ backgroundColor: '#2f2f33' }}
                        >
                          <Icon size={22} style={{ color: detail.color }} />
                        </div>
                        <div className="min-w-0">
                          <p
                            className="text-lg font-bold leading-tight truncate"
                            style={{ color: onColor }}
                          >
                            {detail.title || 'Untitled'}
                          </p>
                          <p className="text-sm" style={{ color: faded }}>
                            {formatTimeRange(detail.startMinutes, detail.durationMinutes)}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Body */}
                    <div className="p-4 flex flex-col gap-3">
                      <div className="flex items-center gap-2 text-sm text-fg-faint">
                        <span>{detail.type === 'task' ? 'Task' : 'Habit'}</span>
                        <span>·</span>
                        <span>{formatDateLabel(detail.iso)}</span>
                        {detail.streak ? (
                          <span className="flex items-center gap-1 text-orange-500 ml-auto font-medium">
                            <Flame size={13} className="fill-orange-500" />
                            {detail.streak}
                          </span>
                        ) : null}
                      </div>

                      <div className="flex gap-2">
                        <motion.button
                          onClick={toggleDetail}
                          whileTap={tap}
                          className="flex-1 rounded-xl py-2.5 text-sm font-medium flex items-center justify-center gap-1.5"
                          style={{
                            backgroundColor: detail.completed ? 'var(--surface-raised)' : detail.color,
                            color: detail.completed ? 'var(--fg-muted)' : onColor,
                          }}
                        >
                          {detail.completed ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                          {detail.completed ? 'Done' : 'Complete'}
                        </motion.button>

                        <motion.button
                          onClick={openEditFromDetail}
                          whileTap={tap}
                          className="flex-1 rounded-xl py-2.5 text-sm font-medium bg-surface-raised text-fg flex items-center justify-center gap-1.5"
                        >
                          <Pencil size={15} />
                          Edit
                        </motion.button>
                      </div>
                    </div>
                  </motion.div>
                )
              })()}
            </div>
          </>
        )}
      </AnimatePresence>

      <AddItemSheet
        isOpen={!!editItem}
        onClose={() => setEditItem(null)}
        editItem={editItem}
      />
    </>
  )
}
