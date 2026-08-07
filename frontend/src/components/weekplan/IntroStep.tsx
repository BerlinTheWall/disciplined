import { Sparkles } from "lucide-react";

import { useWeekPlanStore } from "@/store/weekPlanStore";

export default function IntroStep() {
  const goToStep = useWeekPlanStore((s) => s.goToStep);

  return (
    <div className="flex flex-col items-center text-center px-6 py-10">
      <div className="w-14 h-14 rounded-full bg-surface-raised flex items-center justify-center mb-4">
        <Sparkles size={26} className="text-fg" />
      </div>
      <h3 className="text-lg font-semibold text-fg mb-2">Plan my week</h3>
      <p className="text-[14px] text-fg-faint leading-relaxed mb-8 max-w-xs">
        Pick a few activities and goals, how often, and roughly when — I'll draft a schedule for the
        next 7 days that you review before anything is saved.
      </p>
      <button
        onClick={() => goToStep("selectInterests")}
        className="h-11 px-6 rounded-full bg-fg text-fg-inverse text-[14px] font-semibold"
      >
        Get started
      </button>
    </div>
  );
}
