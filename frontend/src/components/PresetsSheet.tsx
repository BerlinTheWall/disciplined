import { AnimatePresence, motion } from "framer-motion";
import { Star, X } from "lucide-react";
import { useShallow } from "zustand/shallow";

import BottomSheet from "./BottomSheet";
import Collapse from "./Collapse";
import { ICONS } from "@/lib/icons";
import { tap } from "@/lib/motion";
import { MAX_PRESETS, type TaskPreset } from "@/lib/presets";
import { PRIORITY_META } from "@/lib/priority";
import { formatDuration } from "@/lib/time";
import { usePresetStore } from "@/store/presetStore";

interface PresetsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  // Set when opened on top of another sheet (e.g. from a task's detail sheet
  // when the preset limit is hit), so it stacks above it.
  elevated?: boolean;
}

// "45m · Reminder 10m before · High priority" — whatever the preset carries
// beyond its title.
function presetMeta(p: TaskPreset) {
  return [
    formatDuration(p.durationMinutes),
    p.reminderMinutesBefore != null &&
      (p.reminderMinutesBefore === 0
        ? "Reminder at start"
        : `Reminder ${formatDuration(p.reminderMinutesBefore)} before`),
    p.priority && `${PRIORITY_META[p.priority].label} priority`,
  ]
    .filter(Boolean)
    .join(" · ");
}

function PresetRow({ preset, onRemove }: { preset: TaskPreset; onRemove: () => void }) {
  const Icon = ICONS[preset.icon] ?? ICONS.default;
  return (
    <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-2xl bg-surface-raised">
      <span
        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
        style={{ backgroundColor: preset.color, color: "#111827" }}
      >
        <Icon size={15} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-fg truncate">{preset.title}</p>
        <p className="text-xs text-fg-faint truncate">{presetMeta(preset)}</p>
      </div>
      <motion.button
        onClick={onRemove}
        whileTap={tap}
        aria-label={`Remove ${preset.title} preset`}
        className="w-7 h-7 rounded-full flex items-center justify-center text-fg-faint shrink-0"
      >
        <X size={14} />
      </motion.button>
    </div>
  );
}

// Browse the user's preset tasks (at most MAX_PRESETS) and remove any. Presets
// are *used* from Plan Your Day's one-tap row; this is where they're seen and
// tidied up — removing one is how to make room for a new one.
export default function PresetsSheet({ isOpen, onClose, elevated }: PresetsSheetProps) {
  const [userPresets, removePreset] = usePresetStore(
    useShallow((s) => [s.presets, s.removePreset])
  );

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      elevated={elevated}
      className="bg-surface-alt flex flex-col max-h-[85vh]"
    >
      <div className="flex items-center gap-2.5 px-5 pt-4 pb-3">
        <span className="w-8 h-8 rounded-full flex items-center justify-center bg-[#fbbf24] text-[#111827]">
          <Star size={15} />
        </span>
        <h2 className="text-base font-bold text-fg flex-1">Preset Tasks</h2>
        <motion.button
          onClick={onClose}
          whileTap={tap}
          aria-label="Close"
          className="p-2 -mr-2 text-fg-faint"
        >
          <X size={20} />
        </motion.button>
      </div>

      <div
        className="flex-1 overflow-y-auto px-5"
        style={{ paddingBottom: "calc(20px + env(safe-area-inset-bottom))" }}
      >
        <p className="text-sm text-fg-faint mb-5">
          Your go-to tasks, added in one tap from Plan Your Day. Save up to {MAX_PRESETS} by tapping
          the star when you create a task.
        </p>

        <div className="flex items-baseline justify-between mb-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
            Your presets
          </h3>
          <span className="text-xs font-medium text-fg-faint tabular-nums">
            {userPresets.length} of {MAX_PRESETS}
          </span>
        </div>
        {/* Rows are height-animated so removing one closes the gap smoothly,
            and the last removal hands over to the empty state without a jump. */}
        <div>
          <AnimatePresence initial={false}>
            {userPresets.map((preset) => (
              <motion.div
                key={preset.id}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="overflow-hidden"
              >
                <div className="pb-1.5">
                  <PresetRow preset={preset} onRemove={() => removePreset(preset.id)} />
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          <Collapse open={userPresets.length === 0}>
            <p className="text-sm text-fg-faint px-3.5 py-3 rounded-2xl border border-dashed border-border-strong">
              None yet — tap the star when creating a task to save it here.
            </p>
          </Collapse>
        </div>
      </div>
    </BottomSheet>
  );
}
