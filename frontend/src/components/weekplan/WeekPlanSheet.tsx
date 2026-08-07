import { useEffect } from "react";
import { Sparkles, X } from "lucide-react";

import IntroStep from "@/components/weekplan/IntroStep";
import ReviewStep from "@/components/weekplan/ReviewStep";
import SelectItemsStep from "@/components/weekplan/SelectItemsStep";
import { currentPeriodKey } from "@/lib/goalPeriods";
import { useGoalStore } from "@/store/goalStore";
import { useInterestStore } from "@/store/interestStore";
import { useWeekPlanStore } from "@/store/weekPlanStore";
import BottomSheet from "../BottomSheet";

// Own sheet, own store — deliberately not built on ChatSheet/chatStore, so a
// bug here can't affect the chat assistant. See MEMORY: new AI features
// should be isolated, not extend the existing chat surface.
//
// A thin step-switch shell: each step is its own component, all reading
// weekPlanStore directly (same pattern the shell itself uses), so this file
// only owns the sheet chrome and which step is currently shown.

export default function WeekPlanSheet() {
  const isOpen = useWeekPlanStore((s) => s.isOpen);
  const step = useWeekPlanStore((s) => s.step);
  const close = useWeekPlanStore((s) => s.close);
  const goToStep = useWeekPlanStore((s) => s.goToStep);
  const generate = useWeekPlanStore((s) => s.generate);

  const interests = useInterestStore((s) => s.interests);
  const interestsLoaded = useInterestStore((s) => s.loaded);
  const fetchInterests = useInterestStore((s) => s.fetchInterests);
  // Same lazy-load-on-open pattern as InterestsSheet.tsx — interests aren't
  // fetched at app startup, only when a surface that needs them opens.
  useEffect(() => {
    if (isOpen && !interestsLoaded) void fetchInterests();
  }, [isOpen, interestsLoaded, fetchInterests]);

  const goals = useGoalStore((s) => s.goals);
  const currentGoals = goals.filter((g) => g.periodKey === currentPeriodKey(g.period));

  return (
    <BottomSheet isOpen={isOpen} onClose={close} className="bg-surface flex flex-col max-h-[85vh]">
      <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-fg-faint" />
          <h2 className="text-base font-semibold text-fg">Plan my week</h2>
        </div>
        <button
          onClick={close}
          aria-label="Close"
          className="w-8 h-8 rounded-full bg-surface-raised flex items-center justify-center"
        >
          <X size={16} />
        </button>
      </div>

      {step === "intro" && <IntroStep />}

      {step === "selectInterests" && (
        <SelectItemsStep
          kind="interest"
          heading="Activities"
          subtitle="Pick what you want to make time for this week."
          items={interests.map((i) => ({ id: i.id, title: i.title }))}
          emptyHint="No activities yet — add some from Settings > Things you want to make time for."
          onBack={() => goToStep("intro")}
          onNext={() => goToStep("selectGoals")}
          nextLabel="Next"
        />
      )}

      {step === "selectGoals" && (
        <SelectItemsStep
          kind="goal"
          heading="Goals & Plans"
          subtitle="Pick which ones need time this week."
          items={currentGoals.map((g) => ({
            id: g.id,
            title: g.title,
            badge: g.period.charAt(0).toUpperCase() + g.period.slice(1),
          }))}
          emptyHint="No current goals — add some in Goals & Plans."
          onBack={() => goToStep("selectInterests")}
          onNext={() => generate()}
          nextLabel="Generate my week"
        />
      )}

      {step === "review" && <ReviewStep />}
    </BottomSheet>
  );
}
