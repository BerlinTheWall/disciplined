import { motion } from "framer-motion";
import { Pencil, X } from "lucide-react";

import { isLightColor } from "@/lib/color";
import { tap } from "@/lib/motion";
import { exerciseMetrics, sessionSummary, WORKOUT_TYPE_META } from "@/lib/workout";
import type { WorkoutSession } from "@/types/workout";
import BottomSheet from "../BottomSheet";

interface WorkoutSessionDetailSheetProps {
  session: WorkoutSession | null;
  onClose: () => void;
  onEdit: (session: WorkoutSession) => void;
}

export default function WorkoutSessionDetailSheet({
  session,
  onClose,
  onEdit,
}: WorkoutSessionDetailSheetProps) {
  const isOpen = !!session;
  const meta = session ? WORKOUT_TYPE_META[session.type] : null;
  const HeaderIcon = meta?.icon;
  const color = session?.color ?? "#000";
  const onColor = isLightColor(color) ? "#111827" : "#ffffff";
  const headerBtn = {
    backgroundColor: isLightColor(color) ? "rgba(0,0,0,0.12)" : "rgba(0,0,0,0.25)",
    color: onColor,
  };

  return (
    <BottomSheet
      isOpen={!!(isOpen && session && meta && HeaderIcon)}
      onClose={onClose}
      className="bg-surface max-h-[92vh] overflow-y-auto"
    >
      {isOpen && session && meta && HeaderIcon && (
        <>
          {/* Colored header */}
          <div className="px-4 pt-3 pb-5 rounded-t-2xl" style={{ backgroundColor: color }}>
            <div className="flex items-center justify-between">
              <motion.button
                onClick={onClose}
                whileTap={tap}
                className="w-9 h-9 rounded-full flex items-center justify-center"
                style={headerBtn}
              >
                <X size={20} />
              </motion.button>
              <motion.button
                onClick={() => onEdit(session)}
                whileTap={tap}
                className="flex items-center gap-1.5 h-9 px-3.5 rounded-full text-sm font-medium"
                style={headerBtn}
              >
                <Pencil size={15} />
                Edit
              </motion.button>
            </div>

            <div className="flex items-center gap-4 mt-3">
              <div
                className="w-16 h-16 rounded-full border-[3px] border-white flex items-center justify-center shrink-0"
                style={{ backgroundColor: "#2f2f33" }}
              >
                <HeaderIcon size={28} style={{ color }} />
              </div>
              <div className="min-w-0">
                <h2 className="text-2xl font-bold truncate" style={{ color: onColor }}>
                  {session.name}
                </h2>
                <p
                  className="text-sm"
                  style={{
                    color: isLightColor(color) ? "rgba(17,24,39,0.7)" : "rgba(255,255,255,0.85)",
                  }}
                >
                  {meta.label} · {sessionSummary(session)}
                </p>
              </div>
            </div>
          </div>

          {/* Exercises */}
          <div className="p-4 pb-8">
            {session.exercises.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
                <p className="text-base font-medium text-fg">No exercises yet</p>
                <p className="text-sm text-fg-faint">Tap Edit to add what this session involves.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {session.exercises.map((ex, i) => {
                  const metrics = exerciseMetrics(ex, session.type);
                  return (
                    <div key={ex.id} className="rounded-2xl bg-surface-alt p-4">
                      <div className="flex items-center gap-3">
                        <span
                          className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                          style={{ backgroundColor: color, color: onColor }}
                        >
                          {i + 1}
                        </span>
                        <p className="font-semibold text-fg leading-tight">{ex.name}</p>
                      </div>

                      {metrics.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3 pl-10">
                          {metrics.map((m) => (
                            <div
                              key={m.key}
                              className="flex flex-col bg-surface-raised rounded-xl px-3 py-1.5"
                            >
                              <span className="text-[10px] uppercase tracking-wide text-fg-faint">
                                {m.label}
                              </span>
                              <span className="text-sm font-semibold text-fg tabular-nums">
                                {m.value}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {ex.notes && <p className="text-sm text-fg-muted mt-3 pl-10">{ex.notes}</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </BottomSheet>
  );
}
