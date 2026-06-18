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
  addTask: (task: Omit<Task, "id" | "completed">) => void;
  toggleTaskCompleted: (id: string) => void;
  deleteTask: (id: string) => void;
  updateTask: (id: string, changes: Partial<Omit<Task, "id">>) => void;
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

      addTask: (task) =>
        set((state) => ({
          tasks: [
            ...state.tasks,
            { ...task, id: crypto.randomUUID(), completed: false },
          ],
        })),

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
    }),

    {
      name: "disciplined-tasks", // localStorage key
    },
  ),
);
