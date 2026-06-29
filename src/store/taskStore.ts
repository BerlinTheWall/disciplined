import { create } from "zustand";
import { persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

import { todayISODate } from "@/lib/date";
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

const initialState: State = {
  tasks: [
    {
      id: "1",
      title: "Morning workout",
      startMinutes: 7 * 60,
      durationMinutes: 45,
      color: "#34d399",
      icon: "workout",
      completed: false,
      date: today,
    },
    {
      id: "2",
      title: "Deep work block",
      startMinutes: 9 * 60,
      durationMinutes: 120,
      color: "#60a5fa",
      icon: "work",
      completed: false,
      date: today,
    },
    {
      id: "3",
      title: "Lunch",
      startMinutes: 12 * 60 + 30,
      durationMinutes: 45,
      color: "#fbbf24",
      icon: "meal",
      completed: false,
      date: today,
    },
  ],
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
  // Replaces the target day's tasks with clones of the source day's tasks (same
  // titles/times/durations), as fresh, uncompleted tasks. Returns how many were
  // copied.
  copyTasksToDate: (fromDate: string, toDate: string) => number;
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
          if (task) task.startMinutes = Math.max(0, startMinutes);
        }),

      updateTaskDuration: (id, durationMinutes) =>
        set((state) => {
          const task = state.tasks.find((t) => t.id === id);
          if (task) task.durationMinutes = Math.max(15, durationMinutes);
        }),

      addTask: (task) => {
        const id = crypto.randomUUID();
        set((state) => {
          state.tasks.push({ ...task, id, completed: false });
        });
        return id;
      },

      toggleTaskCompleted: (id) =>
        set((state) => {
          const task = state.tasks.find((t) => t.id === id);
          if (task) task.completed = !task.completed;
        }),

      deleteTask: (id) =>
        set((state) => {
          state.tasks = state.tasks.filter((t) => t.id !== id);
        }),

      updateTask: (id, changes) =>
        set((state) => {
          const task = state.tasks.find((t) => t.id === id);
          if (task) Object.assign(task, changes);
        }),

      copyTasksToDate: (fromDate, toDate) => {
        const source = useTaskStore.getState().tasks.filter((t) => t.date === fromDate);
        if (source.length === 0) return 0;
        const clones: Task[] = source.map((t) => ({
          id: crypto.randomUUID(),
          title: t.title,
          startMinutes: t.startMinutes,
          durationMinutes: t.durationMinutes,
          color: t.color,
          icon: t.icon,
          completed: false,
          date: toDate,
        }));
        set((state) => {
          state.tasks = state.tasks.filter((t) => t.date !== toDate);
          state.tasks.push(...clones);
        });
        return clones.length;
      },
    })),

    {
      name: "disciplined-tasks", // localStorage key
    }
  )
);
