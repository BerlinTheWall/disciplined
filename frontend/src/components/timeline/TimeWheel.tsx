import { useLayoutEffect, useMemo, useRef, useState } from "react";

import { isLightColor } from "@/lib/color";
import { formatTimeLabel, timeStringToMinutes } from "@/lib/time";

const WHEEL_ITEM_H = 40;
// The minute wheel uses shorter rows than the hour wheel, so the same drag
// covers more minutes — it scrolls a little faster.
const MINUTE_ITEM_H = 30;
const WHEEL_VISIBLE = 3;

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
  itemHeight,
  align,
}: {
  labels: string[];
  selectedIndex: number;
  onSettle: (index: number) => void;
  contrast: string;
  visibleRows: number;
  itemHeight: number;
  align: "end" | "start";
}) {
  const pad = ((visibleRows - 1) / 2) * itemHeight;
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [active, setActive] = useState(selectedIndex);

  // Park on the selected index when it changes from outside (opening the sheet,
  // or the minute grid changing under a new duration). The distance guard leaves
  // a user scroll that already settled at the target alone.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = selectedIndex * itemHeight;
    if (Math.abs(el.scrollTop - target) > itemHeight / 2) el.scrollTop = target;
    setActive(selectedIndex);
  }, [selectedIndex, itemHeight]);

  function handleScroll() {
    const el = ref.current;
    if (!el) return;
    const idx = Math.max(0, Math.min(labels.length - 1, Math.round(el.scrollTop / itemHeight)));
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
      style={{ height: visibleRows * itemHeight, scrollbarWidth: "none" }}
    >
      <div style={{ height: pad }} />
      {labels.map((label, i) => (
        <div
          key={label}
          className={`flex items-center snap-center ${rowAlign}`}
          style={{ height: itemHeight }}
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
  color,
  onChange,
  visibleRows = WHEEL_VISIBLE,
}: {
  value: string;
  durationMinutes?: number; // still accepted by callers; the minute wheel is now 1-min steps
  color: string;
  onChange: (next: string) => void;
  visibleRows?: number;
}) {
  const hours = useMemo(() => Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0")), []);
  const minutes = useMemo(
    () => Array.from({ length: 60 }, (_, m) => String(m).padStart(2, "0")),
    []
  );

  const total = timeStringToMinutes(value);
  const selHour = Math.floor(total / 60);
  const selMinute = total % 60;

  function commit(hour: number, minute: number) {
    const next = formatTimeLabel(hour * 60 + minute);
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
      <div className="relative flex items-center justify-center">
        <WheelColumn
          labels={hours}
          selectedIndex={selHour}
          onSettle={(i) => commit(i, selMinute)}
          contrast={contrast}
          visibleRows={visibleRows}
          itemHeight={WHEEL_ITEM_H}
          align="end"
        />
        <div className="flex items-center px-0.5">
          <span className="text-lg font-semibold pb-0.5" style={{ color: contrast }}>
            :
          </span>
        </div>
        <WheelColumn
          labels={minutes}
          selectedIndex={selMinute}
          onSettle={(i) => commit(selHour, i)}
          contrast={contrast}
          visibleRows={visibleRows}
          itemHeight={MINUTE_ITEM_H}
          align="start"
        />
      </div>
    </div>
  );
}
