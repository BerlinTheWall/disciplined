import { create } from "zustand";
import { persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

import { todayISODate } from "@/lib/date";
import type { Expense } from "@/types/expense";

const today = todayISODate();

interface State {
  expenses: Expense[];
  monthlyBudget: number;
}

const initialState: State = {
  expenses: [
    {
      id: "e1",
      amount: 4.75,
      note: "Oat latte",
      category: "coffee",
      date: today,
    },
    {
      id: "e2",
      amount: 32.4,
      note: "Groceries",
      category: "food",
      date: today,
    },
  ],
  monthlyBudget: 600,
};

interface Actions {
  addExpense: (expense: Omit<Expense, "id">) => string;
  updateExpense: (id: string, changes: Partial<Omit<Expense, "id">>) => void;
  deleteExpense: (id: string) => void;
  setMonthlyBudget: (amount: number) => void;
  reset: () => void;
}

export const useExpenseStore = create<State & Actions>()(
  persist(
    immer((set) => ({
      ...initialState,

      addExpense: (expense) => {
        const id = crypto.randomUUID();
        set((state) => {
          state.expenses = [...state.expenses, { ...expense, id }];
        });
        return id;
      },

      updateExpense: (id, changes) =>
        set((state) => ({
          expenses: state.expenses.map((e) => (e.id === id ? { ...e, ...changes } : e)),
        })),

      deleteExpense: (id) =>
        set((state) => {
          state.expenses = state.expenses.filter((e) => e.id !== id);
        }),

      setMonthlyBudget: (amount) =>
        set((state) => {
          state.monthlyBudget = Math.max(0, amount);
        }),
      reset: () => {
        set(() => initialState);
      },
    })),
    {
      name: "disciplined-expenses", // localStorage key
    }
  )
);
