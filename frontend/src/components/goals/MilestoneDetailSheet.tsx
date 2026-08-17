import { useState } from "react";
import { motion } from "framer-motion";
import { Check, ListChecks, X } from "lucide-react";

import BottomSheet from "@/components/BottomSheet";
import WeightInput from "@/components/goals/WeightInput";
import { hexToRgba } from "@/lib/color";
import { isMilestoneDone } from "@/lib/goalProgress";
import { tap } from "@/lib/motion";
import { useGoalStore } from "@/store/goalStore";
import { useTaskStore } from "@/store/taskStore";
import type { Goal, GoalMilestone } from "@/types/goals";
import type { Task } from "@/types/task";

// Full detail of one milestone — title, weight, and whichever tasks are
// actually scheduled against it — as its own popup rather than crammed onto
// the milestone's row, which only has room for the label and a couple of
// icon buttons. `milestoneId` (not the milestone object itself) drives
// `isOpen`, same "gate by id/data, not a separate open flag" convention as
// GoalDetailScreen/GoalEditSheet use.
export default function MilestoneDetailSheet({
  goal,
  milestoneId,
  tasks,
  accent,
  milestoneShareById,
  onClose,
  onViewTask,
}: {
  goal: Goal;
  milestoneId: string | null;
  tasks: Task[];
  accent: string;
  milestoneShareById: Record<string, number>;
  onClose: () => void;
  onViewTask: (t: Task) => void;
}) {
  const milestone = goal.milestones.find((m) => m.id === milestoneId) ?? null;

  return (
    <BottomSheet
      isOpen={!!milestone}
      onClose={onClose}
      className="bg-surface rounded-t-3xl pb-[calc(24px+env(safe-area-inset-bottom))] max-h-[85vh] overflow-y-auto"
    >
      {milestone && (
        <MilestoneDetailContent
          goal={goal}
          milestone={milestone}
          tasks={tasks}
          accent={accent}
          shareFallback={milestoneShareById[milestone.id] ?? 0}
          onClose={onClose}
          onViewTask={onViewTask}
        />
      )}
    </BottomSheet>
  );
}

function MilestoneDetailContent({
  goal,
  milestone,
  tasks,
  accent,
  shareFallback,
  onClose,
  onViewTask,
}: {
  goal: Goal;
  milestone: GoalMilestone;
  tasks: Task[];
  accent: string;
  shareFallback: number;
  onClose: () => void;
  onViewTask: (t: Task) => void;
}) {
  // Seeded once per mount — the sheet fully unmounts on close (its parent
  // gates `milestoneId` to null), so reopening always starts from the
  // milestone's current committed label rather than a stale draft.
  const [title, setTitle] = useState(milestone.label);

  function commitTitle() {
    const trimmed = title.trim();
    if (trimmed) useGoalStore.getState().setMilestoneLabel(goal.id, milestone.id, trimmed);
    else setTitle(milestone.label);
  }

  const linkedTasks = (milestone.linkedTaskIds ?? [])
    .map((id) => tasks.find((t) => t.id === id))
    .filter((t): t is Task => !!t)
    .sort((a, b) => a.date.localeCompare(b.date) || a.startMinutes - b.startMinutes);

  // Same rule as the row's own dot: a milestone with AI-scheduled sessions
  // derives its done state from them, so toggling it by hand here would
  // silently do nothing to the actual progress ring — it isn't offered.
  const hasLinkedTasks = (milestone.linkedTaskIds?.length ?? 0) > 0;
  const done = isMilestoneDone(milestone, tasks);

  return (
    <div className="px-5 pt-5">
      <div className="flex items-center justify-between mb-4">
        <motion.button
          onClick={
            hasLinkedTasks
              ? undefined
              : () => useGoalStore.getState().toggleMilestone(goal.id, milestone.id)
          }
          whileTap={hasLinkedTasks ? undefined : tap}
          disabled={hasLinkedTasks}
          aria-label={
            hasLinkedTasks
              ? done
                ? "Done — every scheduled session is completed"
                : "Not done — scheduled sessions still pending"
              : done
                ? "Mark step not done"
                : "Mark step done"
          }
          className={`w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 ${
            hasLinkedTasks ? "cursor-default" : ""
          }`}
          style={
            done
              ? { backgroundColor: accent, borderColor: accent }
              : { backgroundColor: `${accent}1f`, borderColor: `${accent}55` }
          }
        >
          {done ? (
            <Check size={16} strokeWidth={3} className="text-white" />
          ) : (
            <ListChecks size={16} style={{ color: accent }} />
          )}
        </motion.button>
        <motion.button
          onClick={onClose}
          whileTap={tap}
          aria-label="Close"
          className="w-8 h-8 rounded-full bg-surface-raised flex items-center justify-center"
        >
          <X size={16} />
        </motion.button>
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={commitTitle}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className="w-full bg-transparent text-xl font-extrabold text-fg focus:outline-none border-b border-transparent focus:border-border-strong pb-1.5 mb-5"
      />

      {/* Weighting only means something with 2+ steps — a single one is
        trivially 100% of the goal (same rule the row's own WeightInput
        used to gate on). */}
      {goal.milestones.length > 1 && (
        <div className="flex items-center justify-between mb-5 px-0.5">
          <span className="text-sm font-medium text-fg-muted">Weight</span>
          <WeightInput
            value={milestone.weight}
            placeholder={shareFallback}
            onChange={(w) => useGoalStore.getState().setMilestoneWeight(goal.id, milestone.id, w)}
          />
        </div>
      )}

      <p className="text-[11px] font-extrabold uppercase tracking-wide text-fg-faint mb-2">Tasks</p>
      {linkedTasks.length > 0 ? (
        <div className="flex flex-col gap-2">
          {linkedTasks.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-2.5 rounded-xl px-3 py-2.5"
              style={{ backgroundColor: hexToRgba(t.color, 0.12) }}
            >
              <button
                onClick={() => useTaskStore.getState().toggleTaskCompleted(t.id)}
                aria-label={t.completed ? "Mark task not done" : "Mark task done"}
                className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0"
                style={{
                  backgroundColor: t.completed ? t.color : "transparent",
                  borderColor: t.color,
                }}
              >
                <Check
                  size={11}
                  strokeWidth={3.5}
                  className={t.completed ? "text-white" : "text-transparent"}
                />
              </button>
              <button
                onClick={() => onViewTask(t)}
                className={`flex-1 min-w-0 text-left text-sm truncate ${
                  t.completed ? "text-fg-faint line-through" : "text-fg"
                }`}
              >
                {t.title}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-fg-faint">No tasks scheduled for this step yet.</p>
      )}
    </div>
  );
}
