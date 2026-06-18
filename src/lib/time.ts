export const HOUR_HEIGHT = 64
export const SNAP_MINUTES = 15
const PX_PER_MINUTE = HOUR_HEIGHT / 60


export const PILL_BASE_SIZE = 40

const PILL_MAX_HEIGHT = 300
const PILL_GROWTH_THRESHOLD = 30 // minutes — pill stays a perfect circle up to this duration
const PILL_GROWTH_RATE = 0.3 // px added per minute beyond the threshold

export function getPillHeight(durationMinutes: number) {
  if (durationMinutes <= PILL_GROWTH_THRESHOLD) return PILL_BASE_SIZE
  const extra = (durationMinutes - PILL_GROWTH_THRESHOLD) * PILL_GROWTH_RATE
  return Math.min(PILL_MAX_HEIGHT, PILL_BASE_SIZE + extra)
}

export function minutesToPx(minutes: number) {
  return minutes * PX_PER_MINUTE
}

export function pxToMinutes(px: number) {
  return px / PX_PER_MINUTE
}

export function snapToGrid(minutes: number) {
  return Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES
}

export function formatTimeLabel(totalMinutes: number) {
  const h = Math.floor(totalMinutes / 60) % 24
  const m = totalMinutes % 60
  const period = h < 12 ? 'AM' : 'PM'
  const displayHour = h % 12 === 0 ? 12 : h % 12
  return `${displayHour}:${String(m).padStart(2, '0')} ${period}`
}

export function formatTimeRange(startMinutes: number, durationMinutes: number) {
  const endMinutes = startMinutes + durationMinutes
  const durationLabel =
    durationMinutes < 60
      ? `${durationMinutes} min`
      : `${Math.floor(durationMinutes / 60)}h${durationMinutes % 60 ? ` ${durationMinutes % 60}m` : ''}`
  return `${formatTimeLabel(startMinutes)} – ${formatTimeLabel(endMinutes)} · ${durationLabel}`
}

