import { Check } from "lucide-react";

import { isLightColor } from "@/lib/color";
import { ICONS, type IconKey } from "@/lib/icons";
import { formatTimeLabel, rangeLabel } from "@/lib/time";

// The plan-preview row shared by OnboardingWizard (building the user's real
// first day) and FakeWeekPreview (the sandbox week demo) — same visual
// language for "here's a thing on your day" in both places.
export default function PlanRow({
  icon,
  color,
  title,
  startMinutes,
  durationMinutes,
  done,
  accent,
}: {
  icon: IconKey;
  color: string;
  title: string;
  startMinutes?: number;
  durationMinutes?: number;
  done?: boolean;
  accent: string;
}) {
  const Icon = ICONS[icon] ?? ICONS.default;
  return (
    <div
      className="flex items-center gap-3 rounded-2xl border px-3 py-3 bg-surface-alt"
      style={{ borderColor: `${accent}55` }}
    >
      <span
        className="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
        style={{ backgroundColor: color, color: isLightColor(color) ? "#111827" : "#fff" }}
      >
        <Icon size={19} />
      </span>
      <div className="flex-1 min-w-0">
        {startMinutes !== undefined && (
          <p className="text-xs text-fg-faint tabular-nums">
            {durationMinutes
              ? `${rangeLabel(startMinutes, durationMinutes)} (${durationMinutes} mins)`
              : formatTimeLabel(startMinutes)}
          </p>
        )}
        <p className={`font-semibold truncate ${done ? "line-through text-fg-faint" : "text-fg"}`}>
          {title}
        </p>
      </div>
      <span
        className={`w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 ${
          done ? "text-fg-inverse" : "border-border-strong text-transparent"
        }`}
        style={done ? { backgroundColor: accent, borderColor: accent } : undefined}
      >
        <Check size={14} strokeWidth={3} />
      </span>
    </div>
  );
}
