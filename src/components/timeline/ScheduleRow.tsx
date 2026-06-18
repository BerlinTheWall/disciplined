/* eslint-disable react-hooks/refs */
import { Check, Flame } from "lucide-react";
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
  onToggle,
  onLongPress,
}: ScheduleRowProps) {
  const move = useDraggable({ id });
  const resize = useDraggable({ id: `resize-${id}` });

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
    <div
      className="absolute left-0 right-0 flex items-start gap-3 pr-2"
      style={{
        top: minutesToPx(startMinutes + liveOffsetMinutes - startOffset),
        height: rowHeight,
        opacity: isActive ? 0.9 : 1,
        zIndex: isActive ? 10 : 1,
      }}
    >
      {/* Time column: start at top, end at bottom — sized to pill height only */}
      <div
        className="w-12 flex flex-col justify-between py-1 shrink-0"
        style={{ height: pillHeight }}
      >
        <span className="leading-none text-xs text-gray-400 text-right whitespace-nowrap">
          {formatTimeLabel(startMinutes + liveOffsetMinutes)}
        </span>
        <span className="leading-none text-xs text-gray-400 text-right whitespace-nowrap">
          {formatTimeLabel(endMinutes)}
        </span>
      </div>

      <div className="flex-1 flex items-center gap-3">
        <div
          ref={move.setNodeRef}
          {...move.listeners}
          {...move.attributes}
          className="rounded-full flex items-center justify-center text-white shrink-0 cursor-grab active:cursor-grabbing touch-none shadow-sm transition-[height] duration-150"
          style={{
            width: PILL_BASE_SIZE,
            height: pillHeight,
            backgroundColor: color,
          }}
        >
          <IconComponent size={18} />
        </div>

        {/* Long-press zone: the text content area */}
        <div
          {...longPressHandlers}
          className="flex-1 pt-1 min-w-0 select-none"
          style={{ touchAction: "none" }}
        >
          <div className="flex items-center gap-2">
            <p
              className={`font-semibold text-gray-900 leading-tight ${completed ? "line-through text-gray-400" : ""}`}
            >
              {title}
            </p>
            {streak !== undefined && streak > 0 && (
              <span className="flex items-center gap-0.5 text-xs font-medium text-orange-500 shrink-0">
                <Flame size={12} className="fill-orange-500" />
                {streak}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            {formatTimeRange(startMinutes, durationMinutes)}
          </p>

          <div
            ref={resize.setNodeRef}
            {...resize.attributes}
            onPointerDown={(e) => {
              e.stopPropagation();
              resize.listeners?.onPointerDown?.(e);
            }}
            className="h-5 w-16 flex items-center cursor-ns-resize touch-none mt-1"
          >
            <div className="w-8 h-1 rounded-full bg-gray-200" />
          </div>
        </div>
      </div>
      <button
        onClick={() => onToggle(id)}
        className="w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 mt-1"
        style={{
          borderColor: color,
          backgroundColor: completed ? color : "transparent",
        }}
      >
        {completed && <Check size={14} className="text-white" />}
      </button>
    </div>
  );
}