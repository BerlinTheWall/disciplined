export const HOUR_HEIGHT = 64
export const SNAP_MINUTES = 15
const PX_PER_MINUTE = HOUR_HEIGHT / 60


export const PILL_BASE_SIZE = 48

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
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function formatTimeRange(startMinutes: number, durationMinutes: number) {
  const endMinutes = startMinutes + durationMinutes
  const durationLabel =
    durationMinutes < 60
      ? `${durationMinutes} min`
      : `${Math.floor(durationMinutes / 60)}h${durationMinutes % 60 ? ` ${durationMinutes % 60}m` : ''}`
  return `${formatTimeLabel(startMinutes)} – ${formatTimeLabel(endMinutes)} · ${durationLabel}`
}

export const GAP_COMPRESS_THRESHOLD_MIN = 89 // 1.5 hours
export const COMPRESSED_GAP_PX = 24

export interface LayoutItem {
  id: string
  startMinutes: number
  durationMinutes: number
}

export interface GapInfo {
  afterId: string
  beforeId: string
  realMinutes: number
  topY: number // px, top of the compressed gap segment
  heightPx: number // always COMPRESSED_GAP_PX when compressed
}

export interface ComputedLayout {
  topYById: Record<string, number> // virtual top position per item, in px
  gaps: GapInfo[] // only the gaps that were compressed
}

// Walks items in start-time order and builds virtual top positions.
// Any gap between one item's bottom and the next item's top that exceeds
// GAP_COMPRESS_THRESHOLD_MIN is rendered as a fixed COMPRESSED_GAP_PX gap
// instead of its real (proportional) pixel height.
export function computeCompressedLayout(
  items: LayoutItem[],
  getBottomPadding: (item: LayoutItem) => number, // extra px below pill (e.g. row height vs pill height)
): ComputedLayout {
  const topYById: Record<string, number> = {}
  const gaps: GapInfo[] = []

  let cursorY = 0
  let prev: LayoutItem | null = null

  for (const item of items) {
    if (prev) {
      const prevEndMinutes = prev.startMinutes + prev.durationMinutes
      const realGapMinutes = item.startMinutes - prevEndMinutes
      const realGapPx = minutesToPx(Math.max(0, realGapMinutes))
      const prevBottomY = cursorY // cursorY already sits at prev's bottom (set below)

      if (realGapMinutes > GAP_COMPRESS_THRESHOLD_MIN) {
        gaps.push({
          afterId: prev.id,
          beforeId: item.id,
          realMinutes: realGapMinutes,
          topY: prevBottomY,
          heightPx: COMPRESSED_GAP_PX,
        })
        cursorY = prevBottomY + COMPRESSED_GAP_PX
      } else {
        cursorY = prevBottomY + realGapPx
      }
    }

    topYById[item.id] = cursorY
    cursorY += Math.max(minutesToPx(item.durationMinutes), getBottomPadding(item))
    prev = item
  }

  return { topYById, gaps }
}