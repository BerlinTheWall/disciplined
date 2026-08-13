import { motion } from "framer-motion";
import { Loader2, Sparkles, X } from "lucide-react";

import BottomSheet from "@/components/BottomSheet";
import { formatShortDate } from "@/lib/date";
import { tap } from "@/lib/motion";
import { rangeLabel } from "@/lib/time";
import { useGoalScheduleStore } from "@/store/goalScheduleStore";
import type { Goal } from "@/types/goals";

function num(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

// Review sheet for AI-proposed calendar sessions, grouped by which
// milestone they're for. Confirming creates the sessions via the same
// pending-action/confirm path chat and week_plan use, then links each new
// task to its milestone (see goalScheduleStore's confirm). Reads `isOpen`
// from its own store rather than a prop, same convention WeekPlanSheet
// uses — the store, not this component's mount state, is the source of
// truth for whether the wizard is open.
export default function GoalScheduleSheet({ goal }: { goal: Goal }) {
  const { isOpen, busy, message, proposals, resolved, error, close, removeProposal, confirm } =
    useGoalScheduleStore();

  const loading = busy && proposals.length === 0 && !message;
  const byMilestone = new Map<string, { a: (typeof proposals)[number]; index: number }[]>();
  proposals.forEach((a, index) => {
    const list = byMilestone.get(a.milestoneId) ?? [];
    list.push({ a, index });
    byMilestone.set(a.milestoneId, list);
  });

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={close}
      className="bg-surface rounded-t-3xl pt-5 pb-[calc(20px+env(safe-area-inset-bottom))] max-h-[85vh] flex flex-col"
    >
      <div className="flex items-center justify-between px-5 mb-4">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-fg">
          <Sparkles size={15} />
          Schedule "{goal.title}"
        </p>
        <motion.button
          onClick={close}
          whileTap={tap}
          aria-label="Close"
          className="w-7 h-7 rounded-full bg-surface-raised text-fg-faint flex items-center justify-center"
        >
          <X size={14} />
        </motion.button>
      </div>

      <div className="flex-1 overflow-y-auto px-5">
        {loading && (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-fg-faint">
            <Loader2 size={22} className="animate-spin" />
            <p className="text-sm">Finding time for each milestone…</p>
          </div>
        )}

        {error && <p className="text-sm text-red-400 py-4">{error}</p>}

        {!loading &&
          !error &&
          goal.milestones.map((m) => {
            const rows = byMilestone.get(m.id);
            if (!rows || rows.length === 0) return null;
            return (
              <div key={m.id} className="py-2 border-b border-border last:border-b-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-faint mb-1.5">
                  {m.label}
                </p>
                <div className="flex flex-col gap-1.5">
                  {rows.map(({ a, index }) => {
                    const title = str(a.args.title) ?? "(untitled)";
                    const date = str(a.args.date);
                    const start = num(a.args.start_minutes);
                    const duration = num(a.args.duration_minutes) ?? 60;
                    return (
                      <div
                        key={index}
                        className="flex items-center gap-2 rounded-xl border border-dashed border-border-strong bg-surface-alt px-3 py-2"
                      >
                        <span className="flex-1 min-w-0 truncate text-[13.5px] font-medium text-fg">
                          {title}
                        </span>
                        <span className="text-[12px] text-fg-faint shrink-0">
                          {date && `${formatShortDate(date)} · `}
                          {start != null ? rangeLabel(start, duration) : "auto-picked time"}
                        </span>
                        {!resolved && (
                          <button
                            onClick={() => removeProposal(index)}
                            aria-label={`Remove ${title}`}
                            className="w-5 h-5 rounded-full bg-surface-raised flex items-center justify-center shrink-0"
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

        {!loading && !error && proposals.length === 0 && message && (
          <p className="text-sm text-fg-faint py-8 text-center">{message}</p>
        )}
      </div>

      <div className="shrink-0 px-5 pt-3">
        {message && proposals.length > 0 && !resolved && (
          <p className="text-[13px] text-fg-faint mb-2">{message}</p>
        )}
        {resolved ? (
          <p className="text-sm font-medium text-fg text-center py-2">Added to your schedule.</p>
        ) : (
          proposals.length > 0 && (
            <motion.button
              onClick={confirm}
              whileTap={tap}
              disabled={busy}
              className="w-full py-3.5 rounded-full font-semibold bg-fg text-fg-inverse flex items-center justify-center gap-1.5"
            >
              {busy ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                `Add ${proposals.length} session${proposals.length === 1 ? "" : "s"}`
              )}
            </motion.button>
          )
        )}
      </div>
    </BottomSheet>
  );
}
