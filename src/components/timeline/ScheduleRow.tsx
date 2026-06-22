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
import { useLongPress } from "../../hooks/useLongPress";
import { spring, tap } from "../../lib/motion";
import { useThemeStore } from "../../store/themeStore";
import { themeColors } from "../../lib/theme";

export const MIN_ROW_HEIGHT = 72;

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
  onLongPress: (id: string) => void;
  virtualTop?: number; // compressed-layout position; falls back to real-time position when omitted
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
  onToggle,
  onLongPress,
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

  const longPressHandlers = useLongPress(() => onLongPress(id));

  const endMinutes = startMinutes + liveOffsetMinutes + liveDuration;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: isActive ? 0.9 : 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92 }}
      transition={spring.pop}
      className="absolute left-0 right-0 flex items-start gap-3 pr-2"
       style={{
        top: isActive
          ? minutesToPx(startMinutes + liveOffsetMinutes - startOffset)
          : virtualTop ?? minutesToPx(startMinutes + liveOffsetMinutes - startOffset),
        height: rowHeight,
        zIndex: isActive ? 10 : 1,
      }}
    >
      {/* Time column: start at top, end at bottom — sized to pill height only */}
      <div
        className="w-12 flex flex-col justify-between py-1 shrink-0"
        style={{ height: pillHeight }}
      >
        <span className="leading-none text-xs text-fg-faint text-right whitespace-nowrap">
          {formatTimeLabel(startMinutes + liveOffsetMinutes)}
        </span>
        <span className="leading-none text-xs text-fg-faint text-right whitespace-nowrap">
          {formatTimeLabel(endMinutes)}
        </span>
      </div>

      <div className="flex-1 flex items-center gap-3">
        <motion.div
          ref={move.setNodeRef}
          {...move.listeners}
          {...move.attributes}
          className="rounded-full flex items-center justify-center text-white shrink-0 cursor-grab active:cursor-grabbing touch-none shadow-sm transition-[height] duration-150"
          style={{
            width: PILL_BASE_SIZE,
            height: pillHeight,
            backgroundColor: color,
          }}
          animate={{ opacity: completed ? 0.9 : 1, scale: completed ? 0.9 : 1 }}
          transition={spring.snappy}
        >
          <IconComponent size={18} />
        </motion.div>

        {/* Long-press zone: the text content area */}
        <div
          {...longPressHandlers}
          className="flex-1 pt-1 min-w-0 select-none"
          style={{ touchAction: "none" }}
        >
          <div className="flex items-center gap-2">
            <span className="relative block min-w-0 overflow-hidden leading-tight max-w-44">
              <motion.span
                className="font-semibold block truncate"
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
          <p className="text-xs text-fg-faint mt-0.5">
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
