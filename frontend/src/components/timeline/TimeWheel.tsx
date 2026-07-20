import { useLayoutEffect, useMemo, useRef, useState } from "react";

import { isLightColor } from "@/lib/color";
import { formatTimeLabel, timeStringToMinutes } from "@/lib/time";

const WHEEL_ITEM_H = 40;
const WHEEL_VISIBLE = 3;

// Divisors of 60 up to 15 — the minute grid always tiles the hour cleanly, so
// hours and minutes can live on two independent wheels.
const DIVISORS_60 = [1, 2, 3, 4, 5, 6, 10, 12, 15];

// One snap-scrolling column (hours or minutes). It parks itself on the selected
// index whenever that changes from outside, and reports the settled index back
// up once the scroll comes to rest. The centered slot's text is drawn in the
// contrast colour so it reads on the parent's coloured selection band.
function WheelColumn({
  labels,
  selectedIndex,
  onSettle,
  contrast,
  visibleRows,
  align,
}: {
  labels: string[];
  selectedIndex: number;
  onSettle: (index: number) => void;
  contrast: string;
  visibleRows: number;
  align: "end" | "start";
}) {
  const pad = ((visibleRows - 1) / 2) * WHEEL_ITEM_H;
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [active, setActive] = useState(selectedIndex);

  // Park on the selected index when it changes from outside (opening the sheet,
  // or the minute grid changing under a new duration). The distance guard leaves
  // a user scroll that already settled at the target alone.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = selectedIndex * WHEEL_ITEM_H;
    if (Math.abs(el.scrollTop - target) > WHEEL_ITEM_H / 2) el.scrollTop = target;
    setActive(selectedIndex);
  }, [selectedIndex]);

  function handleScroll() {
    const el = ref.current;
    if (!el) return;
    const idx = Math.max(0, Math.min(labels.length - 1, Math.round(el.scrollTop / WHEEL_ITEM_H)));
    setActive(idx);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onSettle(idx), 110);
  }

  const rowAlign = align === "end" ? "justify-end pr-2.5" : "justify-start pl-2.5";
  return (
    <div
      ref={ref}
      onScroll={handleScroll}
      className="wheel-col w-16 overflow-y-scroll snap-y snap-mandatory"
      style={{ height: visibleRows * WHEEL_ITEM_H, scrollbarWidth: "none" }}
    >
      <div style={{ height: pad }} />
      {labels.map((label, i) => (
        <div
          key={label}
          className={`flex items-center snap-center ${rowAlign}`}
          style={{ height: WHEEL_ITEM_H }}
        >
          <span
            className={`text-lg font-semibold tabular-nums ${i === active ? "" : "text-fg-disabled"}`}
            style={i === active ? { color: contrast } : undefined}
          >
            {label}
          </span>
        </div>
      ))}
      <div style={{ height: pad }} />
    </div>
  );
}

// Two-column snap-scrolling time picker: an hour wheel and a minute wheel side
// by side, with a centered pill in the item's colour spanning both. Far quicker
// to reach a time than dragging a single 24-hour column. Used inline in the
// create wizard and, taller, in the edit sheet's time panel.
export default function TimeWheel({
  value,
  durationMinutes,
  color,
  onChange,
  visibleRows = WHEEL_VISIBLE,
}: {
  value: string;
  durationMinutes: number;
  color: string;
  onChange: (next: string) => void;
  visibleRows?: number;
}) {
  // The minute grid steps by the duration so short tasks can start on finer
  // marks (a 5-min task offers :00/:05/…), but never coarser than 15 and always
  // on a divisor of 60 so every hour is tiled the same way.
  const cap = Math.max(1, Math.min(durationMinutes, 15));
  const minuteStep = useMemo(() => [...DIVISORS_60].reverse().find((d) => d <= cap) ?? 1, [cap]);

  const hours = useMemo(() => Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0")), []);
  const minutes = useMemo(
    () =>
      Array.from({ length: 60 / minuteStep }, (_, i) => String(i * minuteStep).padStart(2, "0")),
    [minuteStep]
  );

  // Snap the incoming value onto the minute grid (every multiple of minuteStep
  // is a valid start), then split it into hour + minute indices for the wheels.
  const snappedTotal =
    (((Math.round(timeStringToMinutes(value) / minuteStep) * minuteStep) % 1440) + 1440) % 1440;
  const selHour = Math.floor(snappedTotal / 60);
  const selMinuteIndex = (snappedTotal % 60) / minuteStep;

  const didMount = useRef(false);

  // Keep the stored start time on the grid so what's shown matches what's saved
  // when the duration (and thus the minute step) changes. Skip the first render
  // so we don't overwrite the value the sheet just loaded.
  useLayoutEffect(() => {
    if (didMount.current) {
      const aligned = formatTimeLabel(snappedTotal);
      if (aligned !== value) onChange(aligned);
    } else {
      didMount.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minuteStep]);

  function commit(hour: number, minuteIndex: number) {
    const next = formatTimeLabel(hour * 60 + minuteIndex * minuteStep);
    if (next !== value) onChange(next);
  }

  const contrast = isLightColor(color) ? "#111827" : "#fff";

  return (
    <div className="relative bg-surface-raised rounded-2xl py-2">
      {/* Centered selection band in the item's colour, spanning both wheels. */}
      <div
        className="absolute inset-x-4 rounded-full pointer-events-none"
        style={{
          top: "50%",
          transform: "translateY(-50%)",
          height: WHEEL_ITEM_H,
          backgroundColor: color,
        }}
      />
      <div className="relative flex items-stretch justify-center">
        <WheelColumn
          labels={hours}
          selectedIndex={selHour}
          onSettle={(i) => commit(i, selMinuteIndex)}
          contrast={contrast}
          visibleRows={visibleRows}
          align="end"
        />
        <div className="flex items-center px-0.5">
          <span className="text-lg font-semibold pb-0.5" style={{ color: contrast }}>
            :
          </span>
        </div>
        <WheelColumn
          labels={minutes}
          selectedIndex={selMinuteIndex}
          onSettle={(i) => commit(selHour, i)}
          contrast={contrast}
          visibleRows={visibleRows}
          align="start"
        />
      </div>
    </div>
  );
}
