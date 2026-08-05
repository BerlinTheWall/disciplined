import { Loader2, Sparkles, X } from "lucide-react";
import { useShallow } from "zustand/shallow";

import { addDaysISO, parseISODate, relativeDayLabel, todayISODate } from "@/lib/date";
import { isHabitActiveOnDate } from "@/lib/habits";
import { formatTimeLabel, rangeLabel } from "@/lib/time";
import { useHabitStore } from "@/store/habitStore";
import { useTaskStore } from "@/store/taskStore";
import { useWeekPlanStore } from "@/store/weekPlanStore";
import BottomSheet from "../BottomSheet";

// Own sheet, own store — deliberately not built on ChatSheet/chatStore, so a
// bug here can't affect the chat assistant. See MEMORY: new AI features
// should be isolated, not extend the existing chat surface.

function num(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

export default function WeekPlanSheet() {
  const [
    isOpen,
    busy,
    message,
    pendingActions,
    resolved,
    error,
    close,
    removeProposal,
    confirm,
    discard,
  ] = useWeekPlanStore(
    useShallow((s) => [
      s.isOpen,
      s.busy,
      s.message,
      s.pendingActions,
      s.resolved,
      s.error,
      s.close,
      s.removeProposal,
      s.confirm,
      s.discard,
    ])
  );
  const tasks = useTaskStore((s) => s.tasks);
  const habits = useHabitStore((s) => s.habits);

  const days = Array.from({ length: 7 }, (_, i) => addDaysISO(todayISODate(), i));
  const loading = busy && pendingActions.length === 0 && !message;

  return (
    <BottomSheet isOpen={isOpen} onClose={close} className="bg-surface flex flex-col max-h-[85vh]">
      <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-fg-faint" />
          <h2 className="text-base font-semibold text-fg">Week Plan</h2>
        </div>
        <button
          onClick={close}
          aria-label="Close"
          className="w-8 h-8 rounded-full bg-surface-raised flex items-center justify-center"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-2">
        {loading && (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-fg-faint">
            <Loader2 size={22} className="animate-spin" />
            <p className="text-sm">Planning your week…</p>
          </div>
        )}

        {error && <p className="text-sm text-[#b07a85] py-4">{error}</p>}

        {!loading &&
          !error &&
          days.map((iso) => {
            const date = parseISODate(iso);
            const dayTasks = tasks.filter((t) => t.date === iso);
            const dayHabits = habits.filter((h) => isHabitActiveOnDate(h, date));
            const proposals = pendingActions
              .map((a, index) => ({ a, index }))
              .filter(({ a }) => a.tool === "create_event" && str(a.args.date) === iso);

            if (dayTasks.length === 0 && dayHabits.length === 0 && proposals.length === 0)
              return null;

            return (
              <div key={iso} className="py-2 border-b border-fg/5 last:border-b-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-faint mb-1.5">
                  {relativeDayLabel(iso)}
                </p>
                <div className="flex flex-col gap-1">
                  {dayTasks.map((t) => (
                    <div key={t.id} className="flex items-center gap-2 text-[13px] text-fg-faint">
                      <span className="w-1.5 h-1.5 rounded-full bg-fg/20 shrink-0" />
                      <span className="truncate">{t.title}</span>
                      <span className="text-fg-faint/70 shrink-0">
                        {formatTimeLabel(t.startMinutes)}
                      </span>
                    </div>
                  ))}
                  {dayHabits.map((h) => (
                    <div key={h.id} className="flex items-center gap-2 text-[13px] text-fg-faint">
                      <span className="w-1.5 h-1.5 rounded-full bg-fg/20 shrink-0" />
                      <span className="truncate">{h.title}</span>
                      <span className="text-fg-faint/70 shrink-0">
                        {formatTimeLabel(h.startMinutes)}
                      </span>
                    </div>
                  ))}
                  {proposals.map(({ a, index }) => {
                    const title = str(a.args.title) ?? "(untitled)";
                    const start = num(a.args.start_minutes);
                    const duration = num(a.args.duration_minutes) ?? 60;
                    return (
                      <div
                        key={index}
                        className="flex items-center gap-2 rounded-lg border border-dashed border-fg/25 bg-surface-raised px-2 py-1.5"
                      >
                        <Sparkles size={13} className="text-fg-faint shrink-0" />
                        <span className="flex-1 min-w-0 truncate text-[13px] font-medium text-fg">
                          {title}
                        </span>
                        <span className="text-[12px] text-fg-faint shrink-0">
                          {start != null ? rangeLabel(start, duration) : "auto-picked time"}
                        </span>
                        {!resolved && (
                          <button
                            onClick={() => removeProposal(index)}
                            aria-label={`Remove ${title}`}
                            className="w-5 h-5 rounded-full bg-fg/10 flex items-center justify-center shrink-0"
                          >
                            <X size={11} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

        {!loading && !error && pendingActions.length === 0 && message && (
          <p className="text-sm text-fg-faint py-6 text-center">{message}</p>
        )}
      </div>

      <div className="shrink-0 px-4 pt-2 pb-4 border-t border-fg/10">
        {message && pendingActions.length > 0 && !resolved && (
          <p className="text-[13px] text-fg-faint mb-2">{message}</p>
        )}
        {resolved ? (
          <p className="text-sm font-medium text-fg text-center py-2">Added to your schedule.</p>
        ) : (
          pendingActions.length > 0 && (
            <div className="flex gap-2">
              <button
                onClick={discard}
                disabled={busy}
                className="flex-1 h-11 rounded-full bg-surface-raised text-fg text-[14px] font-medium"
              >
                Discard
              </button>
              <button
                onClick={confirm}
                disabled={busy}
                className="flex-1 h-11 rounded-full bg-fg text-fg-inverse text-[14px] font-semibold flex items-center justify-center gap-1.5"
              >
                {busy ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  `Confirm week (${pendingActions.length})`
                )}
              </button>
            </div>
          )
        )}
      </div>
    </BottomSheet>
  );
}
