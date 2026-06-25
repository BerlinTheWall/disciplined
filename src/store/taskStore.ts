import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Task } from "../types/task";
import { todayISODate } from "../lib/date";

interface TaskStore {
  tasks: Task[];
  selectedDate: string;
  setSelectedDate: (date: string) => void;
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

const today = todayISODate();

const initialTasks: Task[] = [
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
];

export const useTaskStore = create<TaskStore>()(
  persist(
    (set) => ({
      tasks: initialTasks,
      selectedDate: today,
      setSelectedDate: (date) => set({ selectedDate: date }),

      updateTaskTime: (id, startMinutes) =>
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === id ? { ...t, startMinutes: Math.max(0, startMinutes) } : t,
          ),
        })),

      updateTaskDuration: (id, durationMinutes) =>
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === id
              ? { ...t, durationMinutes: Math.max(15, durationMinutes) }
              : t,
          ),
        })),

      addTask: (task) => {
        const id = crypto.randomUUID();
        set((state) => ({
          tasks: [...state.tasks, { ...task, id, completed: false }],
        }));
        return id;
      },

      toggleTaskCompleted: (id) =>
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === id ? { ...t, completed: !t.completed } : t,
          ),
        })),

      deleteTask: (id) =>
        set((state) => ({ tasks: state.tasks.filter((t) => t.id !== id) })),

      updateTask: (id, changes) =>
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === id ? { ...t, ...changes } : t,
          ),
        })),

      copyTasksToDate: (fromDate, toDate) => {
        const source = useTaskStore
          .getState()
          .tasks.filter((t) => t.date === fromDate);
        if (source.length === 0) return 0;
        // Copy only the plan itself — drop completion and any instance-specific
        // links (shopping list, workout session, recipe) so the two days don't
        // share state.
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
        // Override the target day: clear whatever was there, then drop in the copy.
        set((state) => ({
          tasks: [...state.tasks.filter((t) => t.date !== toDate), ...clones],
        }));
        return clones.length;
      },
    }),

    {
      name: "disciplined-tasks", // localStorage key
    },
  ),
);