import { Check } from "lucide-react";
import { useShallow } from "zustand/shallow";

import { chipCls } from "@/components/timeline/addItemOptions";
import { TIME_OF_DAY_OPTIONS, TIMES_PER_WEEK_OPTIONS } from "@/components/weekplan/timeOfDay";
import { useWeekPlanStore, type WeekPlanKind } from "@/store/weekPlanStore";

export interface SelectableItem {
  id: string;
  title: string;
  badge?: string;
}

interface SelectItemsStepProps {
  kind: WeekPlanKind;
  heading: string;
  subtitle: string;
  items: SelectableItem[];
  emptyHint: string;
  onBack: () => void;
  onNext: () => void;
  nextLabel: string;
}

export default function SelectItemsStep({
  kind,
  heading,
  subtitle,
  items,
  emptyHint,
  onBack,
  onNext,
  nextLabel,
}: SelectItemsStepProps) {
  const prefs = useWeekPlanStore((s) => (kind === "interest" ? s.interestPrefs : s.goalPrefs));
  const [togglePref, setTimesPerWeek, setTimeOfDay] = useWeekPlanStore(
    useShallow((s) => [s.togglePref, s.setTimesPerWeek, s.setTimeOfDay])
  );

  return (
    <div className="flex flex-col max-h-[80vh]">
      <div className="px-4 pt-4 pb-2 shrink-0">
        <h3 className="text-base font-semibold text-fg">{heading}</h3>
        <p className="text-[13px] text-fg-faint mt-0.5">{subtitle}</p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-2">
        {items.length === 0 && (
          <p className="text-sm text-fg-faint py-6 text-center">{emptyHint}</p>
        )}

        {items.map((item) => {
          const pref = prefs[item.id];
          const included = pref?.included ?? false;
          return (
            <div key={item.id} className="py-2.5 border-b border-fg/5 last:border-b-0">
              <button
                onClick={() => togglePref(kind, item.id)}
                className="flex items-center gap-3 w-full text-left"
              >
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                    included ? "bg-fg text-fg-inverse" : "bg-surface-raised text-transparent"
                  }`}
                >
                  <Check size={14} />
                </span>
                <span className="flex-1 min-w-0 truncate text-[14px] font-medium text-fg">
                  {item.title}
                </span>
                {item.badge && (
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-fg-faint shrink-0">
                    {item.badge}
                  </span>
                )}
              </button>

              {included && pref && (
                <div className="mt-2.5 pl-9 flex flex-col gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[12px] text-fg-faint w-full mb-0.5">
                      How often this week
                    </span>
                    {TIMES_PER_WEEK_OPTIONS.map((n) => (
                      <button
                        key={n}
                        onClick={() => setTimesPerWeek(kind, item.id, n)}
                        className={chipCls(pref.timesPerWeek === n)}
                      >
                        {n}x
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[12px] text-fg-faint w-full mb-0.5">Time of day</span>
                    {TIME_OF_DAY_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setTimeOfDay(kind, item.id, opt.value)}
                        className={chipCls(pref.timeOfDay === opt.value)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="shrink-0 flex gap-2 px-4 pt-2 pb-4 border-t border-fg/10">
        <button
          onClick={onBack}
          className="flex-1 h-11 rounded-full bg-surface-raised text-fg text-[14px] font-medium"
        >
          Back
        </button>
        <button
          onClick={onNext}
          className="flex-1 h-11 rounded-full bg-fg text-fg-inverse text-[14px] font-semibold"
        >
          {nextLabel}
        </button>
      </div>
    </div>
  );
}
