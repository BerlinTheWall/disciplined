import { useState } from "react";
import { motion } from "framer-motion";
import { Check, ListChecks, Pencil, Plus, Trash2, X } from "lucide-react";

import BottomSheet from "@/components/BottomSheet";
import { useChoose, useConfirm } from "@/components/ConfirmDialog";
import WeightInput from "@/components/goals/WeightInput";
import { hexToRgba } from "@/lib/color";
import { isMilestoneDone } from "@/lib/goalProgress";
import { tap } from "@/lib/motion";
import { useGoalFocusStore } from "@/store/goalFocusStore";
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
  const confirm = useConfirm();
  const choose = useChoose();

  function commitTitle() {
    const trimmed = title.trim();
    if (trimmed) useGoalStore.getState().setMilestoneLabel(goal.id, milestone.id, trimmed);
    else setTitle(milestone.label);
  }

  const linkedTasks = (milestone.linkedTaskIds ?? [])
    .map((id) => tasks.find((t) => t.id === id))
    .filter((t): t is Task => !!t)
    .sort((a, b) => a.date.localeCompare(b.date) || a.startMinutes - b.startMinutes);

  // Same choice goal-deletion already offers (GoalDetailScreen's
  // handleDeleteGoal) — a step with scheduled sessions shouldn't silently
  // orphan them on the calendar, but deleting them outright isn't always
  // wanted either.
  async function handleDelete() {
    const taskCount = linkedTasks.length;
    let deleteTasksToo = false;

    if (taskCount === 0) {
      const ok = await confirm({
        title: "Delete this step?",
        message: `"${milestone.label}" will be removed.`,
        confirmLabel: "Delete",
        destructive: true,
      });
      if (!ok) return;
    } else {
      const choice = await choose({
        title: "Delete this step?",
        message: `"${milestone.label}" has ${taskCount} scheduled session${taskCount === 1 ? "" : "s"} on your calendar. Delete those too, or just unlink them from the step?`,
        options: [
          {
            label: `Delete step and ${taskCount} session${taskCount === 1 ? "" : "s"}`,
            value: "step-and-tasks",
            destructive: true,
          },
          { label: "Delete step only", value: "step-only", destructive: true },
        ],
      });
      if (!choice) return;
      deleteTasksToo = choice === "step-and-tasks";
    }

    if (deleteTasksToo) {
      for (const t of linkedTasks) useTaskStore.getState().deleteTask(t.id);
    }
    useGoalStore.getState().deleteMilestone(goal.id, milestone.id);
    onClose();
  }

  // Same rule as the row's own dot: a milestone with AI-scheduled sessions
  // derives its done state from them, so tapping this completes (or, once
  // they're all done, un-completes) every one of those tasks instead of a
  // plain `done` flag.
  const hasLinkedTasks = (milestone.linkedTaskIds?.length ?? 0) > 0;
  const done = isMilestoneDone(milestone, tasks);

  function toggleTasks() {
    const completed = !done;
    for (const id of milestone.linkedTaskIds ?? []) {
      useTaskStore.getState().updateTask(id, { completed });
    }
  }

  return (
    <div className="px-5 pt-5">
      <div className="flex items-center justify-between mb-4">
        <motion.button
          onClick={
            hasLinkedTasks
              ? toggleTasks
              : () => useGoalStore.getState().toggleMilestone(goal.id, milestone.id)
          }
          whileTap={tap}
          aria-label={done ? "Mark step not done" : "Mark step done"}
          className="w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0"
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
        <div className="flex items-center gap-2">
          <motion.button
            onClick={() => void handleDelete()}
            whileTap={tap}
            aria-label="Delete step"
            className="w-8 h-8 rounded-full bg-surface-raised flex items-center justify-center text-red-400"
          >
            <Trash2 size={15} />
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
      </div>

      <div className="relative mb-5">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          className="w-full bg-surface-alt rounded-xl pl-3.5 pr-9 py-2.5 text-lg font-bold text-fg focus:outline-none"
        />
        <Pencil
          size={14}
          className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-fg-faint"
        />
      </div>

      {/* Weighting only means something with 2+ steps — a single one is
        trivially 100% of the goal (same rule the row's own read-only %
        used to gate on). Kept as a small pill, not a full row — it's a
        secondary, rarely-touched setting next to the title and task list. */}
      {goal.milestones.length > 1 && (
        <div className="mb-5">
          <div className="inline-flex items-center gap-1 rounded-full bg-surface-alt px-2.5 py-1">
            <span className="text-[11px] font-medium text-fg-faint">Weight</span>
            <WeightInput
              value={milestone.weight}
              placeholder={shareFallback}
              onChange={(w) => useGoalStore.getState().setMilestoneWeight(goal.id, milestone.id, w)}
            />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] font-extrabold uppercase tracking-wide text-fg-faint">Tasks</p>
        <motion.button
          onClick={() => {
            // Closes this sheet first, then App.tsx's own subscription to
            // the pending-milestone signal opens the add-task sheet — same
            // "close the viewer, open the editor" handoff GoalDetailScreen
            // uses elsewhere, so the two sheets never stack.
            onClose();
            useGoalFocusStore.getState().requestAddTaskForMilestone(goal.id, milestone.id);
          }}
          whileTap={tap}
          className="flex items-center gap-1 text-[12px] font-semibold"
          style={{ color: accent }}
        >
          <Plus size={13} />
          Add task
        </motion.button>
      </div>
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
