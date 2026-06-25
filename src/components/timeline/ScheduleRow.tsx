/* eslint-disable react-hooks/refs */
import { Flame } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useDraggable } from "@dnd-kit/core";
import { ICONS } from "../../lib/icons";
import {
  minutesToPx,
  pxToMinutes,
  snapToGrid,
  formatTimeLabel,
  formatTimeRange,
  getPillHeight,
  PILL_BASE_SIZE,
} from "../../lib/time";
import { spring, tap } from "../../lib/motion";
import { useThemeStore } from "../../store/themeStore";
import { themeColors } from "../../lib/theme";

export const MIN_ROW_HEIGHT = 84;

// hex (#rrggbb) → rgba string at the given alpha. Used to tint the current
// task's highlight card with a faint wash of its own color.
function hexToRgba(hex: string, alpha: number) {
  const c = hex.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export interface ScheduleRowData {
  id: string;
  title: string;
  startMinutes: number;
  durationMinutes: number;
  color: string;
  icon: keyof typeof ICONS;
  completed: boolean;
  streak?: number;
  startOffset?: number;
}

interface ScheduleRowProps extends ScheduleRowData {
  onToggle: (id: string) => void;
  onEdit: (id: string) => void;
  virtualTop?: number; // compressed-layout position; falls back to real-time position when omitted
  overlapping?: boolean; // item shares time with another — tints its time labels
  isCurrent?: boolean; // task happening right now — gets a pulsing border
}

export default function ScheduleRow({
  id,
  title,
  startMinutes,
  durationMinutes,
  color,
  icon,
  completed,
  streak,
  startOffset = 0,
  virtualTop,
  overlapping = false,
  isCurrent = false,
  onToggle,
  onEdit,
}: ScheduleRowProps) {
  const move = useDraggable({ id });
  const resize = useDraggable({ id: `resize-${id}` });

  const theme = useThemeStore((s) => s.theme);
  const colors = themeColors[theme];

  const liveOffsetMinutes = move.transform
    ? snapToGrid(pxToMinutes(move.transform.y))
    : 0;
  const liveDurationDelta = resize.transform
    ? snapToGrid(pxToMinutes(resize.transform.y))
    : 0;
  const isActive = move.isDragging || resize.isDragging;

  const liveDuration = durationMinutes + liveDurationDelta;
  const rowHeight = Math.max(minutesToPx(liveDuration), MIN_ROW_HEIGHT);
  const pillHeight = getPillHeight(liveDuration);
  const IconComponent = ICONS[icon] ?? ICONS.default;

  const endMinutes = startMinutes + liveOffsetMinutes + liveDuration;

  const targetTop = isActive
    ? minutesToPx(startMinutes + liveOffsetMinutes - startOffset)
    : virtualTop ?? minutesToPx(startMinutes + liveOffsetMinutes - startOffset);

  return (
    <motion.div
      data-item-id={id}
      initial={{ opacity: 0, scale: 0.92 }}
      // top/height are animated so that when an item is checked off and leaves,
      // the rows below glide up to fill the gap instead of snapping.
      animate={{
        opacity: completed ? 0.5 : isActive ? 0.9 : 1,
        scale: 1,
        top: targetTop,
        height: rowHeight,
      }}
      // On check, the row leaves the timeline by smoothly shrinking and fading
      // out (no overshoot) on its way to the Done tray.
      exit={{
        opacity: 0,
        scale: 0.8,
        transition: { duration: 0.25, ease: "easeOut" },
      }}
      transition={{
        default: spring.pop,
        // Follow the finger instantly while dragging; glide smoothly otherwise.
        top: isActive ? { duration: 0 } : { duration: 0.3, ease: "easeOut" },
        height: isActive ? { duration: 0 } : { duration: 0.3, ease: "easeOut" },
      }}
      className="absolute left-0 right-0 flex items-start gap-3 pr-2"
      style={{ zIndex: isActive ? 10 : 1 }}
    >
      {/* "Happening now" cue: a fill in the task's color behind the whole row
          that gently breathes (pulsing opacity). Sits behind the content but
          above the connector lines. */}
      {isCurrent && (
        <motion.div
          className="absolute -z-10 rounded-2xl"
          // Height tracks the pill (which scales with duration) so the highlight
          // grows with the task block instead of the fixed-slot row height.
          style={{ backgroundColor: color, top: -10, height: pillHeight + 26, left: -10, right: -10 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0.1, 0.2, 0.1] }}
          exit={{ opacity: 0 }}
          transition={{ duration: 3, ease: "easeInOut", repeat: Infinity }}
        />
      )}

      {/* Time column: start at top, end at bottom — sized to pill height only */}
      <div
        className="w-8 flex flex-col justify-between py-1 shrink-0"
        style={{ height: pillHeight }}
      >
        <span
          className={`leading-none text-sm text-right whitespace-nowrap tabular-nums ${
            overlapping ? "text-amber-500" : "text-fg-faint"
          }`}
        >
          {formatTimeLabel(startMinutes + liveOffsetMinutes)}
        </span>
        <span
          className={`leading-none text-sm text-right whitespace-nowrap tabular-nums ${
            overlapping ? "text-amber-500" : "text-fg-faint"
          }`}
        >
          {formatTimeLabel(endMinutes)}
        </span>
      </div>

      <div className="flex-1 flex items-center gap-3">
        <motion.div
          ref={move.setNodeRef}
          {...move.listeners}
          {...move.attributes}
          onClick={() => onEdit(id)}
          className="rounded-full flex items-center justify-center text-white shrink-0 cursor-pointer shadow-sm transition-[height] duration-150"
          style={{
            width: PILL_BASE_SIZE,
            height: pillHeight,
            backgroundColor: color,
          }}
          animate={{
            opacity: completed ? 0.9 : 1,
            scale: completed ? 0.9 : 1,
            // "Happening now" cue: an expanding ring of the task's color that
            // radiates out of the pill and fades, pulsing gently.
            boxShadow: isCurrent
              ? [
                  `0 1px 2px 0 rgba(0,0,0,0.05), 0 0 0 0 ${hexToRgba(color, 0.5)}`,
                  `0 1px 2px 0 rgba(0,0,0,0.05), 0 0 0 12px ${hexToRgba(color, 0)}`,
                ]
              : "0 1px 2px 0 rgba(0,0,0,0.05)",
          }}
          transition={{
            default: spring.snappy,
            boxShadow: isCurrent
              ? { duration: 1.8, ease: "easeOut", repeat: Infinity }
              : { duration: 0.3 },
          }}
        >
          <IconComponent size={22} />
        </motion.div>

        {/* Tap zone: the text content area opens edit/delete */}
        <div
          onClick={() => onEdit(id)}
          className="flex-1 pt-1 min-w-0 select-none cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <span className="relative block min-w-0 overflow-hidden leading-tight max-w-44">
              <motion.span
                className="font-semibold text-lg block truncate"
                initial={false}
                animate={{ color: completed ? colors.fgFaint : colors.fg }}
                transition={{ duration: 0.25 }}
              >
                {title}
              </motion.span>
              <motion.span
                className="pointer-events-none absolute left-0 h-0.5 w-full rounded-full bg-fg-faint"
                style={{ top: "50%", marginTop: -1, originX: 0 }}
                initial={false}
                animate={{ scaleX: completed ? 1 : 0 }}
                transition={spring.snappy}
              />
            </span>
            {streak !== undefined && streak > 0 && (
              <span className="flex items-center gap-0.5 text-xs font-medium text-orange-500 shrink-0">
                <Flame size={12} className="fill-orange-500" />
                {streak}
              </span>
            )}
          </div>
          <p className="text-sm text-fg-faint mt-0.5">
            {formatTimeRange(startMinutes, durationMinutes)}
          </p>
        </div>

        <motion.button
          onClick={() => onToggle(id)}
          whileTap={tap}
          initial={false}
          animate={{
            backgroundColor: completed ? color : "rgba(255,255,255,0)",
            scale: completed ? [1, 1.15, 1] : 1,
          }}
          transition={{
            backgroundColor: spring.snappy,
            scale: { duration: 0.3, times: [0, 0.45, 1], ease: "easeOut" },
          }}
          className="w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0"
          style={{ borderColor: color }}
        >
          <AnimatePresence initial={false}>
            {completed && (
              <motion.svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth={3.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={spring.pop}
              >
                <motion.path
                  d="M5 13l4 4L19 7"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  exit={{ pathLength: 0 }}
                  transition={{ duration: 0.2, ease: "easeOut", delay: 0.05 }}
                />
              </motion.svg>
            )}
          </AnimatePresence>
        </motion.button>
      </div>
    </motion.div>
  );
}
