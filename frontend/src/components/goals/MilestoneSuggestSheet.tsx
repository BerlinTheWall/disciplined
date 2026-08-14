import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check, RefreshCw, Sparkles, X } from "lucide-react";

import BottomSheet from "@/components/BottomSheet";
import WeightInput from "@/components/goals/WeightInput";
import { api, ApiError, type MilestoneSuggestion } from "@/lib/api";
import { autoSplitWeights } from "@/lib/goalProgress";
import { tap } from "@/lib/motion";
import { useGoalStore } from "@/store/goalStore";
import type { Goal } from "@/types/goals";

// AI-proposed milestones for a goal — fetches on open, lets the user
// uncheck any it doesn't want and adjust weights, then adds the rest via
// the same store action a hand-typed milestone would use. A separate sheet
// rather than folded into the existing "Milestone" text input, so
// declining or retrying never disturbs anything the user already added by
// hand.
export default function MilestoneSuggestSheet({
  goal,
  isOpen,
  onClose,
  onCommitted,
}: {
  goal: Goal;
  isOpen: boolean;
  onClose: () => void;
  // Called right after the accepted milestones are added — lets a caller
  // (the AI planning wizard) chain straight into scheduling them, in
  // addition to the normal onClose.
  onCommitted?: () => void;
}) {
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState<MilestoneSuggestion[]>([]);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());

  async function load() {
    setStatus("loading");
    setError("");
    try {
      const res = await api.goalMilestones.suggest({
        title: goal.title,
        description: goal.description,
        category: goal.category,
        note: goal.note,
        period: goal.period,
        durationCount: goal.durationCount,
      });
      setSuggestions(res.milestones);
      setExcluded(new Set());
      setStatus("ready");
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "Couldn't suggest milestones — please try again."
      );
      setStatus("error");
    }
  }

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const id = window.setTimeout(() => {
      if (!cancelled) void load();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
    // Re-fetch only when the sheet opens, not on every goal/load re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  function toggle(i: number) {
    setExcluded((cur) => {
      const next = new Set(cur);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function updateWeight(i: number, weight: number | null) {
    setSuggestions((cur) =>
      cur.map((s, idx) => (idx === i ? { ...s, weight: weight ?? undefined } : s))
    );
  }

  const acceptedIndexes = suggestions.map((_, i) => i).filter((i) => !excluded.has(i));
  const accepted = acceptedIndexes.map((i) => suggestions[i]);
  // Placeholder shares only across what's actually accepted — matching the
  // same auto-split rule the detail screen's own milestone list uses, just
  // scoped to the checked subset instead of the whole suggestion list.
  const acceptedShares = autoSplitWeights(accepted.map((s) => s.weight));

  function handleAdd() {
    if (accepted.length === 0) return;
    useGoalStore.getState().addMilestones(
      goal.id,
      accepted.map((s) => ({ label: s.label, weight: s.weight }))
    );
    onClose();
    onCommitted?.();
  }

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      className="bg-surface rounded-t-3xl p-5 pb-[calc(20px+env(safe-area-inset-bottom))] max-h-[80vh] overflow-y-auto"
    >
      <div className="flex items-center justify-between mb-4">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-fg">
          <Sparkles size={15} />
          Suggested milestones
        </p>
        <motion.button
          onClick={onClose}
          whileTap={tap}
          aria-label="Close"
          className="w-7 h-7 rounded-full bg-surface-raised text-fg-faint flex items-center justify-center"
        >
          <X size={14} />
        </motion.button>
      </div>

      {status === "loading" && (
        <div className="flex flex-col items-center py-10 gap-2.5 text-fg-faint">
          <RefreshCw size={20} className="animate-spin" />
          <p className="text-sm">Thinking through "{goal.title}"…</p>
        </div>
      )}

      {status === "error" && (
        <div className="flex flex-col items-center py-8 gap-3 text-center">
          <p className="text-sm text-fg-muted">{error}</p>
          <motion.button
            onClick={load}
            whileTap={tap}
            className="px-4 py-2 rounded-full bg-surface-raised text-sm font-semibold text-fg"
          >
            Try again
          </motion.button>
        </div>
      )}

      {status === "ready" && suggestions.length === 0 && (
        <p className="text-sm text-fg-faint py-8 text-center">
          Nothing came back — add a note about why this goal matters and try again.
        </p>
      )}

      {status === "ready" && suggestions.length > 0 && (
        <>
          <div className="flex flex-col gap-2 mb-4">
            {suggestions.map((s, i) => {
              const checked = !excluded.has(i);
              const acceptedIdx = acceptedIndexes.indexOf(i);
              return (
                <motion.div
                  key={i}
                  whileTap={tap}
                  className={`flex items-center gap-3 rounded-2xl px-3.5 py-3 bg-surface-alt ${
                    checked ? "" : "opacity-40"
                  }`}
                >
                  <button
                    onClick={() => toggle(i)}
                    aria-label={checked ? "Exclude this milestone" : "Include this milestone"}
                    className="flex items-center gap-3 flex-1 min-w-0 text-left"
                  >
                    <span
                      className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0"
                      style={
                        checked
                          ? {
                              backgroundColor: "var(--path-accent)",
                              borderColor: "var(--path-accent)",
                            }
                          : { borderColor: "var(--border-strong)" }
                      }
                    >
                      {checked && <Check size={12} strokeWidth={3} className="text-white" />}
                    </span>
                    <span className="flex-1 min-w-0 text-[14.5px] font-medium text-fg truncate">
                      {s.label}
                    </span>
                  </button>
                  {checked && accepted.length > 1 && (
                    <WeightInput
                      value={s.weight}
                      placeholder={acceptedShares[acceptedIdx] ?? 0}
                      onChange={(w) => updateWeight(i, w)}
                    />
                  )}
                </motion.div>
              );
            })}
          </div>

          <motion.button
            onClick={handleAdd}
            whileTap={tap}
            disabled={accepted.length === 0}
            className={`w-full py-3.5 rounded-full font-semibold ${
              accepted.length > 0 ? "bg-fg text-fg-inverse" : "bg-surface-raised text-fg-faint"
            }`}
          >
            Add {accepted.length} milestone{accepted.length === 1 ? "" : "s"}
          </motion.button>
        </>
      )}
    </BottomSheet>
  );
}
