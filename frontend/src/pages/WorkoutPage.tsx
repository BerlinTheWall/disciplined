/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ChevronRight, Dumbbell, Plus } from "lucide-react";

import WorkoutSessionDetailSheet from "@/components/workout/WorkoutSessionDetailSheet";
import WorkoutSessionSheet from "@/components/workout/WorkoutSessionSheet";
import { isLightColor } from "@/lib/color";
import { press, spring, tap } from "@/lib/motion";
import { sessionSummary, WORKOUT_TYPE_META } from "@/lib/workout";
import { useWorkoutFocusStore } from "@/store/workoutFocusStore";
import { useWorkoutStore } from "@/store/workoutStore";
import type { WorkoutSession } from "@/types/workout";

export default function WorkoutPage() {
  const sessions = useWorkoutStore((s) => s.sessions);

  const [detailSession, setDetailSession] = useState<WorkoutSession | null>(null);
  const [editSession, setEditSession] = useState<WorkoutSession | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  // Consume a "jump to this workout" intent from a linked task: open its detail.
  const pendingSessionId = useWorkoutFocusStore((s) => s.pendingSessionId);
  const clearWorkoutFocus = useWorkoutFocusStore((s) => s.clear);
  useEffect(() => {
    if (!pendingSessionId) return;
    const target = sessions.find((s) => s.id === pendingSessionId);
    if (target) setDetailSession(target);
    clearWorkoutFocus();
  }, [pendingSessionId, sessions, clearWorkoutFocus]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between px-1">
        <h2 className="text-base font-semibold text-fg">Your workouts</h2>
        <motion.button
          onClick={() => setAddOpen(true)}
          whileTap={tap}
          className="flex items-center gap-1 text-sm text-fg-muted"
        >
          <Plus size={15} />
          New session
        </motion.button>
      </div>

      {sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="w-14 h-14 rounded-full bg-surface-raised flex items-center justify-center">
            <Dumbbell size={24} className="text-fg-faint" />
          </div>
          <p className="text-base font-medium text-fg">No workouts yet</p>
          <p className="text-sm text-fg-faint text-center">
            Create a gym, run, ride or swim session, then link it to a task in your schedule.
          </p>
        </div>
      ) : (
        sessions.map((session) => {
          const meta = WORKOUT_TYPE_META[session.type];
          const Icon = meta.icon;
          return (
            <motion.button
              key={session.id}
              onClick={() => setDetailSession(session)}
              whileTap={press}
              transition={spring.snappy}
              className="flex items-center gap-3 p-4 rounded-2xl bg-surface-alt text-left w-full"
            >
              <div
                className="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
                style={{
                  backgroundColor: session.color,
                  color: isLightColor(session.color) ? "#111827" : "#fff",
                }}
              >
                <Icon size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-fg leading-tight truncate">{session.name}</p>
                  <span className="text-[11px] font-medium text-fg-muted bg-surface-subtle rounded-full px-2 py-0.5 shrink-0">
                    {meta.label}
                  </span>
                </div>
                <p className="text-xs text-fg-faint mt-1 truncate">{sessionSummary(session)}</p>
              </div>
              <ChevronRight size={18} className="text-fg-faint shrink-0" />
            </motion.button>
          );
        })
      )}

      <WorkoutSessionDetailSheet
        session={detailSession}
        onClose={() => setDetailSession(null)}
        onEdit={(session) => {
          setDetailSession(null);
          setEditSession(session);
        }}
      />

      <WorkoutSessionSheet
        isOpen={addOpen || !!editSession}
        editSession={editSession}
        onClose={() => {
          setAddOpen(false);
          setEditSession(null);
        }}
      />
    </div>
  );
}
