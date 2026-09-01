import { create } from "zustand";
import { persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

import { todayISODate } from "@/lib/date";
import { useGoalStore } from "@/store/goalStore";
import type { Task } from "@/types/task";

const today = todayISODate();
interface State {
  tasks: Task[];
  selectedDate: string;
  // Bumped on every discrete date navigation (tap a day, chevron, picker) but
  // preserved across a swipe, so the day view replays its entrance animation on
  // a deliberate jump yet stays seamless while swiping.
  navNonce: number;
}

// No sample data: tasks sync to the signed-in account, so seeding demo items
// here would fill every new account with them.
const initialState: State = {
  tasks: [],
  selectedDate: today,
  navNonce: 0,
};

interface Actions {
  setSelectedDate: (date: string) => void; // discrete nav — bumps navNonce
  swipeToDate: (date: string) => void; // swipe — preserves navNonce
  updateTaskTime: (id: string, startMinutes: number) => void;
  updateTaskDuration: (id: string, durationMinutes: number) => void;
  // Returns the new task's id so callers can link it (e.g. to a shopping list).
  addTask: (task: Omit<Task, "id" | "completed">) => string;
  toggleTaskCompleted: (id: string) => void;
  deleteTask: (id: string) => void;
  updateTask: (id: string, changes: Partial<Omit<Task, "id">>) => void;
}

export const useTaskStore = create<State & Actions>()(
  persist(
    immer((set) => ({
      ...initialState,

      setSelectedDate: (date) =>
        set((state) => {
          state.selectedDate = date;
          state.navNonce += 1;
        }),

      swipeToDate: (date) =>
        set((state) => {
          state.selectedDate = date;
        }),

      updateTaskTime: (id, startMinutes) =>
        set((state) => {
          const task = state.tasks.find((t) => t.id === id);
          if (task) {
            task.startMinutes = Math.max(0, startMinutes);
            task.updatedAt = new Date().toISOString();
          }
        }),

      updateTaskDuration: (id, durationMinutes) =>
        set((state) => {
          const task = state.tasks.find((t) => t.id === id);
          if (task) {
            task.durationMinutes = Math.max(15, durationMinutes);
            task.updatedAt = new Date().toISOString();
          }
        }),

      addTask: (task) => {
        const id = crypto.randomUUID();
        set((state) => {
          state.tasks.push({ ...task, id, completed: false, updatedAt: new Date().toISOString() });
        });
        return id;
      },

      toggleTaskCompleted: (id) =>
        set((state) => {
          const task = state.tasks.find((t) => t.id === id);
          if (task) {
            task.completed = !task.completed;
            task.updatedAt = new Date().toISOString();
          }
        }),

      deleteTask: (id) => {
        set((state) => {
          state.tasks = state.tasks.filter((t) => t.id !== id);
        });
        // Otherwise a deleted task lingers in linkedTaskIds forever, permanently
        // capping its goal/milestone's progress below 100% (see goalStore's own
        // comment on unlinkTaskEverywhere).
        useGoalStore.getState().unlinkTaskEverywhere(id);
      },

      updateTask: (id, changes) =>
        set((state) => {
          const task = state.tasks.find((t) => t.id === id);
          // Defaults updatedAt to now, but lets an explicit updatedAt in
          // `changes` win — reconcileAppleCalendar (lib/deviceCalendarSync.ts)
          // pulls in a device edit and needs the *device's* modified time
          // recorded, not the moment this reconciliation pass happened to run.
          if (task) Object.assign(task, { updatedAt: new Date().toISOString() }, changes);
        }),
    })),

    {
      name: "disciplined-tasks", // localStorage key
    }
  )
);
