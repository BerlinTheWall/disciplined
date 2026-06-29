export const HOUR_HEIGHT = 64;
export const SNAP_MINUTES = 15;
const PX_PER_MINUTE = HOUR_HEIGHT / 60;

export const PILL_BASE_SIZE = 48;

const PILL_MAX_HEIGHT = 300;
const PILL_GROWTH_THRESHOLD = 30; // minutes — pill stays a perfect circle up to this duration
const PILL_GROWTH_RATE = 0.3; // px added per minute beyond the threshold

export function getPillHeight(durationMinutes: number) {
  if (durationMinutes <= PILL_GROWTH_THRESHOLD) return PILL_BASE_SIZE;
  const extra = (durationMinutes - PILL_GROWTH_THRESHOLD) * PILL_GROWTH_RATE;
  return Math.min(PILL_MAX_HEIGHT, PILL_BASE_SIZE + extra);
}

export function minutesToPx(minutes: number) {
  return minutes * PX_PER_MINUTE;
}

export function pxToMinutes(px: number) {
  return px / PX_PER_MINUTE;
}

export function snapToGrid(minutes: number) {
  return Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES;
}

export function formatTimeLabel(totalMinutes: number) {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function formatTimeRange(startMinutes: number, durationMinutes: number) {
  const endMinutes = startMinutes + durationMinutes;
  const durationLabel =
    durationMinutes < 60
      ? `${durationMinutes} min`
      : `${Math.floor(durationMinutes / 60)}h${durationMinutes % 60 ? ` ${durationMinutes % 60}m` : ""}`;
  return `${formatTimeLabel(startMinutes)} – ${formatTimeLabel(endMinutes)} · ${durationLabel}`;
}

export const GAP_COMPRESS_THRESHOLD_MIN = 89; // 1.5 hours

// Gaps no longer scale with their real duration — every gap snaps to one of
// three fixed heights based on which bucket its minutes fall in.
export const GAP_SHORT_PX = 0; // gaps under 30 min
export const GAP_MEDIUM_PX = 0; // gaps from 30 up to 60 min
export const GAP_LONG_PX = 30; // gaps of 60 min and up

export function gapHeightPx(gapMinutes: number) {
  if (gapMinutes < 30) return GAP_SHORT_PX;
  if (gapMinutes < 60) return GAP_MEDIUM_PX;
  return GAP_LONG_PX;
}

// Reserved vertical space inserted at a junction where two items overlap in
// time. Like the gap heights, it's fixed: it gives the overlap marker room and
// stops the two pills from sitting flush against each other.
export const OVERLAP_ZONE_PX = 60;

// Extra slack allowed past the cluster bottom when stacking *chained* overlaps
// (a contained item, then another contained item). Those get capped at the
// cluster bottom, which squeezes them together; this lets them spread out a bit
// without affecting the first, uncapped overlap gap (governed by OVERLAP_ZONE_PX).
export const OVERLAP_STACK_SLACK_PX = 20;

export interface LayoutItem {
  id: string;
  startMinutes: number;
  durationMinutes: number;
}

export interface GapInfo {
  afterId: string;
  beforeId: string;
  realMinutes: number;
  topY: number; // px, top of the gap segment
  heightPx: number; // the bucketed fixed height (see gapHeightPx)
}

export interface OverlapInfo {
  afterId: string;
  beforeId: string;
  overlapMinutes: number;
  topY: number; // px, top of the reserved overlap zone
  heightPx: number; // always OVERLAP_ZONE_PX
  // 'contained' = the later item fits entirely inside what's already scheduled
  // (often intentional); 'partial' = it spills past, the clearer mistake signal.
  kind: "partial" | "contained";
}

export interface ComputedLayout {
  topYById: Record<string, number>; // virtual top position per item, in px
  gaps: GapInfo[]; // only the gaps that were compressed
  overlaps: OverlapInfo[]; // junctions where an item overlaps what came before
}

// Walks items in start-time order and builds virtual top positions.
// Gaps between items don't scale with their duration: each gap snaps to one of
// three fixed heights (see gapHeightPx). Gaps longer than
// GAP_COMPRESS_THRESHOLD_MIN are additionally annotated with a break label.
export function computeCompressedLayout(
  items: LayoutItem[],
  getBottomPadding: (item: LayoutItem) => number // extra px below pill (e.g. row height vs pill height)
): ComputedLayout {
  const topYById: Record<string, number> = {};
  const gaps: GapInfo[] = [];
  const overlaps: OverlapInfo[] = [];

  let cursorY = 0;
  let prev: LayoutItem | null = null;
  // Furthest end time reached so far. We measure each gap/overlap against this
  // rather than just prev.end so a long task spanning several short ones is
  // flagged as overlapping at every junction (item i+2 can overlap i, not i+1).
  let clusterEndMinutes = -Infinity;

  for (const item of items) {
    const itemBlock = Math.max(minutesToPx(item.durationMinutes), getBottomPadding(item));
    let topY = cursorY;

    if (prev) {
      const realGapMinutes = item.startMinutes - clusterEndMinutes;
      const prevBottomY = cursorY; // cursorY already sits at prev's bottom

      if (realGapMinutes < 0) {
        const itemEndMinutes = item.startMinutes + item.durationMinutes;
        // Place the overlapping item just below the previous item's PILL, not
        // below its full reserved block. A long task reserves vertical space
        // proportional to its duration, so a short task contained inside it
        // would otherwise be stacked far below, opening a huge connector. Capped
        // at prevBottomY so it never lands past its normal stacked position.
        topY = Math.min(
          topYById[prev.id] + getPillHeight(prev.durationMinutes) + OVERLAP_ZONE_PX,
          prevBottomY + OVERLAP_STACK_SLACK_PX - 5
        );
        overlaps.push({
          afterId: prev.id,
          beforeId: item.id,
          overlapMinutes: -realGapMinutes,
          topY,
          heightPx: OVERLAP_ZONE_PX,
          // start-sorted, so item.start >= prev.start always; the only question
          // is whether it also ends within what's already scheduled.
          kind: itemEndMinutes <= clusterEndMinutes ? "contained" : "partial",
        });
        // Keep the cursor at the furthest bottom so later items clear both.
        cursorY = Math.max(prevBottomY, topY + itemBlock);
      } else {
        const gapPx = gapHeightPx(realGapMinutes);
        if (realGapMinutes > GAP_COMPRESS_THRESHOLD_MIN) {
          gaps.push({
            afterId: prev.id,
            beforeId: item.id,
            realMinutes: realGapMinutes,
            topY: prevBottomY,
            heightPx: gapPx,
          });
        }
        topY = prevBottomY + gapPx;
        cursorY = topY + itemBlock;
      }
    } else {
      cursorY = topY + itemBlock;
    }

    topYById[item.id] = topY;
    clusterEndMinutes = Math.max(clusterEndMinutes, item.startMinutes + item.durationMinutes);
    prev = item;
  }

  return { topYById, gaps, overlaps };
}
