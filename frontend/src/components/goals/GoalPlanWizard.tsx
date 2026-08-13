import { useEffect, useState } from "react";

import { useConfirm, usePrompt } from "@/components/ConfirmDialog";
import GoalScheduleSheet from "@/components/goals/GoalScheduleSheet";
import MilestoneSuggestSheet from "@/components/goals/MilestoneSuggestSheet";
import { useGoalPlanWizardStore } from "@/store/goalPlanWizardStore";
import { useGoalScheduleStore } from "@/store/goalScheduleStore";
import { useGoalStore } from "@/store/goalStore";

// Orchestrates the AI planning sequence (why -> milestones -> schedule) for
// whatever goal useGoalPlanWizardStore points at — triggered either right
// after creating a goal (GoalsPage) or from an existing goal's "Plan with
// AI" chip (GoalDetailScreen). Mounted once, at GoalsPage level, so it
// outlives any single detail screen and owns the MilestoneSuggestSheet /
// GoalScheduleSheet mounts that used to live inside GoalDetailScreen.
export default function GoalPlanWizard() {
  const goalId = useGoalPlanWizardStore((s) => s.goalId);
  const finish = useGoalPlanWizardStore((s) => s.finish);
  const goals = useGoalStore((s) => s.goals);
  const scheduleGoalId = useGoalScheduleStore((s) => s.goalId);
  const confirm = useConfirm();
  const prompt = usePrompt();

  const [milestoneGoalId, setMilestoneGoalId] = useState<string | null>(null);

  useEffect(() => {
    if (!goalId) return;
    let cancelled = false;

    (async () => {
      const goal = useGoalStore.getState().goals.find((g) => g.id === goalId);
      if (!goal) {
        finish();
        return;
      }

      // Already planned — re-running "Plan with AI" shouldn't repeat
      // why/milestones, just jump straight to scheduling what's there.
      if (goal.milestones.length > 0) {
        await useGoalScheduleStore.getState().start(goal);
        if (!cancelled) finish();
        return;
      }

      const wantsHelp = await confirm({
        title: "Want help scheduling this?",
        message: "I can help figure out the why, break it into milestones, and find time for it.",
        confirmLabel: "Yes, help me",
        cancelLabel: "No thanks",
      });
      if (cancelled) return;
      if (!wantsHelp) {
        finish();
        return;
      }

      const why = await prompt({
        title: "Why does this matter?",
        message: "Personal, or something you need to do? This shapes the plan the AI proposes.",
        placeholder: "Why this matters…",
        defaultValue: goal.note ?? "",
        confirmLabel: "Continue",
      });
      if (cancelled) return;
      if (why === null) {
        finish();
        return;
      }
      if (why.trim()) useGoalStore.getState().setNote(goalId, why.trim());

      setMilestoneGoalId(goalId);
    })();

    return () => {
      cancelled = true;
      finish();
    };
    // Only re-run when a new goal is targeted, not on every store update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goalId]);

  const milestoneGoal = goals.find((g) => g.id === milestoneGoalId) ?? null;
  const scheduleGoal = goals.find((g) => g.id === scheduleGoalId) ?? null;

  return (
    <>
      {milestoneGoal && (
        <MilestoneSuggestSheet
          goal={milestoneGoal}
          isOpen
          onClose={() => {
            setMilestoneGoalId(null);
            finish();
          }}
          onCommitted={() => {
            const updated = useGoalStore.getState().goals.find((g) => g.id === milestoneGoal.id);
            setMilestoneGoalId(null);
            if (updated) void useGoalScheduleStore.getState().start(updated);
            finish();
          }}
        />
      )}
      {scheduleGoal && <GoalScheduleSheet goal={scheduleGoal} />}
    </>
  );
}
