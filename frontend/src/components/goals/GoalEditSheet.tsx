import { useState } from "react";
import { motion } from "framer-motion";
import { Calendar, ChevronRight, Target, X } from "lucide-react";

import BottomSheet from "@/components/BottomSheet";
import CalendarMonth from "@/components/timeline/CalendarMonth";
import { FieldPanel, FieldRow } from "@/components/timeline/FieldPanel";
import { isLightColor } from "@/lib/color";
import { formatFullDate, parseISODate, relativeDayLabel } from "@/lib/date";
import {
  durationCountFromEndDate,
  goalEndDate,
  periodKeyFor,
  periodStartDate,
} from "@/lib/goalPeriods";
import { goalColor } from "@/lib/goalPriority";
import { tap } from "@/lib/motion";
import { useGoalStore } from "@/store/goalStore";
import type { Goal } from "@/types/goals";
import type { Priority } from "@/types/task";

const PRIORITY_LEVELS: { key: Priority; label: string }[] = [
  { key: "low", label: "Low" },
  { key: "medium", label: "Medium" },
  { key: "high", label: "High" },
];

// Full edit of the fields set once at creation (GoalsPage's add-goal sheet)
// but never revisited since: title, description, priority, start/end date.
// Same colored-header-plus-tappable-rows language as that sheet (and the
// task editor) — see the Structured design-reference memory — rather than
// a plain form, so it reads as the same sheet family. Milestones/links/
// category stay editable inline on the detail screen itself; this is only
// for the fields that screen shows read-only in its hero.
export default function GoalEditSheet({ goal, onClose }: { goal: Goal | null; onClose: () => void }) {
  return (
    <BottomSheet
      isOpen={!!goal}
      onClose={onClose}
      className="bg-surface overflow-hidden max-h-[92vh] flex flex-col"
    >
      {goal && <GoalEditForm goal={goal} onClose={onClose} />}
    </BottomSheet>
  );
}

function GoalEditForm({ goal, onClose }: { goal: Goal; onClose: () => void }) {
  // Lazily seeded once per mount (the sheet fully unmounts on close, since
  // its parent gates `goal` to null — see GoalDetailScreen's own comment on
  // the same pattern), so reopening always starts from the goal's current
  // committed values rather than a stale draft.
  const [title, setTitle] = useState(goal.title);
  const [description, setDescription] = useState(goal.description ?? "");
  const [priority, setPriority] = useState<Priority | null>(goal.priority);
  const [startDate, setStartDate] = useState(
    goal.startDate ?? periodStartDate(goal.period, goal.periodKey)
  );
  const [endDate, setEndDate] = useState(
    goalEndDate(goal.period, goal.periodKey, goal.startDate, goal.durationCount)
  );
  const [dateOpen, setDateOpen] = useState(false);
  const [endDateOpen, setEndDateOpen] = useState(false);

  const accent = goalColor(priority);
  const onAccent = isLightColor(accent) ? "#111827" : "#ffffff";

  function save() {
    const trimmed = title.trim();
    if (!trimmed) return;
    const effectiveEnd = endDate < startDate ? startDate : endDate;
    useGoalStore.getState().updateGoal(goal.id, {
      title: trimmed,
      description: description.trim() || null,
      startDate,
      durationCount: durationCountFromEndDate(goal.period, startDate, effectiveEnd),
      periodKey: periodKeyFor(goal.period, parseISODate(startDate)),
    });
    if (priority !== goal.priority) useGoalStore.getState().setPriority(goal.id, priority);
    onClose();
  }

  return (
    <>
      <div className="overflow-y-auto">
        <div style={{ backgroundColor: accent }} className="px-5 pt-[calc(20px+env(safe-area-inset-top))] pb-6">
          <div className="flex items-center mb-4">
            <motion.button
              onClick={onClose}
              whileTap={tap}
              aria-label="Close"
              style={{ backgroundColor: "rgba(0,0,0,0.18)", color: onAccent }}
              className="w-9 h-9 rounded-full flex items-center justify-center"
            >
              <X size={18} />
            </motion.button>
          </div>
          <div className="flex items-center gap-3">
            <div
              style={{ backgroundColor: "#111827", color: accent }}
              className="w-14 h-14 rounded-full flex items-center justify-center shrink-0"
            >
              <Target size={26} />
            </div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What do you want to accomplish?"
              style={{ color: onAccent, caretColor: onAccent, borderColor: "rgba(255,255,255,0.5)" }}
              className="flex-1 min-w-0 bg-transparent text-2xl font-semibold placeholder-white/50 border-b pb-1 focus:outline-none"
            />
          </div>
        </div>

        <div className="p-5">
          <label className="text-xs font-bold tracking-wide text-fg-muted mb-2 block">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does done look like?"
            rows={2}
            className="w-full bg-surface-raised rounded-2xl px-4 py-3 text-sm text-fg placeholder-fg-faint focus:outline-none resize-none"
          />

          <label className="text-xs font-bold tracking-wide text-fg-muted mt-5 mb-2 block">
            Start date
          </label>
          <FieldRow
            icon={Calendar}
            value={formatFullDate(startDate)}
            hint={relativeDayLabel(startDate)}
            onPress={() => setDateOpen(true)}
          />

          <label className="text-xs font-bold tracking-wide text-fg-muted mt-3 mb-2 block">
            End date
          </label>
          <FieldRow
            icon={Calendar}
            value={formatFullDate(endDate)}
            hint={relativeDayLabel(endDate)}
            onPress={() => setEndDateOpen(true)}
          />

          <label className="text-xs font-bold tracking-wide text-fg-muted mt-5 mb-2 block">
            Priority
          </label>
          <div className="flex items-center gap-2">
            {PRIORITY_LEVELS.map((level) => {
              const selected = priority === level.key;
              const color = goalColor(level.key);
              return (
                <motion.button
                  key={level.key}
                  onClick={() => setPriority(selected ? null : level.key)}
                  whileTap={tap}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-2xl border text-sm font-medium"
                  style={
                    selected
                      ? { borderColor: color, backgroundColor: `${color}1a`, color }
                      : { borderColor: "var(--border-strong)", color: "var(--fg-muted)" }
                  }
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  {level.label}
                </motion.button>
              );
            })}
          </div>

          <motion.button
            onClick={save}
            whileTap={tap}
            disabled={!title.trim()}
            style={title.trim() ? { backgroundColor: accent, color: onAccent } : undefined}
            className={`mt-6 w-full flex items-center justify-center gap-2 rounded-full py-4 font-semibold ${
              title.trim() ? "" : "bg-surface-raised text-fg-faint"
            }`}
          >
            Save changes
            <ChevronRight size={18} />
          </motion.button>
        </div>
      </div>

      <FieldPanel
        open={dateOpen}
        title="Start date"
        color={accent}
        onColor={onAccent}
        onClose={() => setDateOpen(false)}
      >
        <CalendarMonth
          value={startDate}
          color={accent}
          onChange={(iso) => {
            setStartDate(iso);
            setDateOpen(false);
          }}
        />
      </FieldPanel>

      <FieldPanel
        open={endDateOpen}
        title="End date"
        color={accent}
        onColor={onAccent}
        onClose={() => setEndDateOpen(false)}
      >
        <CalendarMonth
          value={endDate}
          color={accent}
          onChange={(iso) => {
            setEndDate(iso);
            setEndDateOpen(false);
          }}
        />
      </FieldPanel>
    </>
  );
}
