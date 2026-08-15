// A single flowing line of stops — evenly spaced left to right, drifting
// gently up and down instead of snapping to a multi-row grid. Earlier
// versions arranged stops in a serpentine grid with rounded corners, which
// needed the corner's raw vertex "de-aliased" against the actually-rendered
// curve (a rounded bezier corner curves *near* its vertex, not *through*
// it). A single-row wave sidesteps that class of bug entirely: every stop
// is a cubic bezier's start/end anchor, and a bezier always passes exactly
// through its own anchors — so no post-hoc measurement or snapping is
// needed, and a truncated prefix of the same points reproduces the exact
// same curve for the travelled-trail overlay.

export interface WavePoint {
  x: number;
  y: number;
}

export function waveLayout(
  count: number,
  spacing = 60,
  baseY = 62,
  amplitude = 18,
  margin = 34
): WavePoint[] {
  return Array.from({ length: count }, (_, i) => ({
    x: margin + i * spacing,
    y: baseY + amplitude * Math.sin(i * 1.05),
  }));
}

// Smooth cubic-bezier curve through every point: each segment's control
// points sit at the same y as their own endpoint, offset horizontally
// toward the other end — the standard "smoothed line" construction, so the
// curve never breaks stride or turns a hard corner.
export function smoothPathD(points: WavePoint[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M${points[0].x},${points[0].y}`;

  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const curr = points[i];
    const next = points[i + 1];
    const dx = (next.x - curr.x) / 2;
    d += ` C${curr.x + dx},${curr.y} ${next.x - dx},${next.y} ${next.x},${next.y}`;
  }
  return d;
}

// Same wave, running top-to-bottom instead of left-to-right — stops drift
// gently side to side as they descend. Not a transposed reuse of
// waveLayout: the linear/wiggle axes are swapped at the point-generation
// level so the caller never has to remember which field means what.
export function waveLayoutVertical(
  count: number,
  spacing = 60,
  baseX = 62,
  amplitude = 18,
  margin = 34
): WavePoint[] {
  return Array.from({ length: count }, (_, i) => ({
    x: baseX + amplitude * Math.sin(i * 1.05),
    y: margin + i * spacing,
  }));
}

// waveLayoutVertical's counterpart for stops that don't all deserve the same
// amount of vertical room — each stop claims its own slice of height
// (`heights[i]`, e.g. sized by how much content it actually has) instead of
// a uniform spacing, and sits at the vertical center of that slice.
export function verticalPointsForHeights(
  heights: number[],
  baseX = 62,
  amplitude = 18
): WavePoint[] {
  let y = 0;
  return heights.map((h, i) => {
    const point = { x: baseX + amplitude * Math.sin(i * 1.05), y: y + h / 2 };
    y += h;
    return point;
  });
}

// smoothPathD's counterpart for a vertical wave: control points offset
// *vertically* toward the other end instead of horizontally, since the
// large delta between consecutive stops is now in y, not x.
export function smoothPathDVertical(points: WavePoint[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M${points[0].x},${points[0].y}`;

  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const curr = points[i];
    const next = points[i + 1];
    const dy = (next.y - curr.y) / 2;
    d += ` C${curr.x},${curr.y + dy} ${next.x},${next.y - dy} ${next.x},${next.y}`;
  }
  return d;
}
