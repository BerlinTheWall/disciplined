import { motion, Reorder, useDragControls } from "framer-motion";
import type { DragControls } from "framer-motion";
import { Menu, X } from "lucide-react";

import BottomSheet from "@/components/BottomSheet";
import { tap } from "@/lib/motion";
import { useGoalStore } from "@/store/goalStore";
import type { Goal, GoalMilestone } from "@/types/goals";

// A flat, trail-free list of the same milestones — reordering by dragging
// the trail's connected dots would fight the trail's own layout math, so
// this sheet strips that down to just rows + a drag handle. Every drop
// commits straight to the store (see reorderMilestones), so there's nothing
// to save: closing this sheet just returns to the trail, already reordered.
export default function MilestoneReorderSheet({
  goal,
  isOpen,
  onClose,
}: {
  goal: Goal;
  isOpen: boolean;
  onClose: () => void;
}) {
  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      className="bg-surface rounded-t-3xl pb-[calc(24px+env(safe-area-inset-bottom))] max-h-[85vh] overflow-y-auto"
    >
      <div className="px-5 pt-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-fg">Reorder Milestones</h2>
          <motion.button
            onClick={onClose}
            whileTap={tap}
            aria-label="Close"
            className="w-8 h-8 rounded-full bg-surface-raised flex items-center justify-center"
          >
            <X size={16} />
          </motion.button>
        </div>

        <Reorder.Group
          as="div"
          axis="y"
          values={goal.milestones}
          onReorder={(next) =>
            useGoalStore.getState().reorderMilestones(
              goal.id,
              next.map((m) => m.id)
            )
          }
          className="flex flex-col gap-2"
        >
          {goal.milestones.map((m) => (
            <ReorderRow key={m.id} milestone={m} />
          ))}
        </Reorder.Group>
      </div>
    </BottomSheet>
  );
}

// Its own component (not inlined in the .map) so it can call useDragControls
// once per row — a hook can't live inside a loop body. dragListener stays
// off so only holding the handle itself starts a drag; a stray tap on the
// row does nothing.
function ReorderRow({ milestone }: { milestone: GoalMilestone }) {
  const dragControls: DragControls = useDragControls();

  return (
    <Reorder.Item
      value={milestone}
      as="div"
      dragListener={false}
      dragControls={dragControls}
      whileDrag={{ scale: 1.02 }}
      className="flex items-center gap-3 rounded-full bg-surface-alt px-4 py-3"
    >
      <span className="flex-1 min-w-0 truncate text-[14.5px] font-semibold text-fg">
        {milestone.label}
      </span>
      <div
        onPointerDown={(e) => dragControls.start(e)}
        aria-label="Drag to reorder"
        className="touch-none p-1 -m-1 text-fg-faint cursor-grab active:cursor-grabbing"
      >
        <Menu size={16} />
      </div>
    </Reorder.Item>
  );
}
