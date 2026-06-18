import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Expense } from "../types/expense";
import { todayISODate } from "../lib/date";

interface ExpenseStore {
  expenses: Expense[];
  monthlyBudget: number; // 0 = no budget set yet
  addExpense: (expense: Omit<Expense, "id">) => void;
  updateExpense: (id: string, changes: Partial<Omit<Expense, "id">>) => void;
  deleteExpense: (id: string) => void;
  setMonthlyBudget: (amount: number) => void;
}

const today = todayISODate();

const initialExpenses: Expense[] = [
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
];

export const useExpenseStore = create<ExpenseStore>()(
  persist(
    (set) => ({
      expenses: initialExpenses,
      monthlyBudget: 600,

      addExpense: (expense) =>
        set((state) => ({
          expenses: [
            ...state.expenses,
            { ...expense, id: crypto.randomUUID() },
          ],
        })),

      updateExpense: (id, changes) =>
        set((state) => ({
          expenses: state.expenses.map((e) =>
            e.id === id ? { ...e, ...changes } : e,
          ),
        })),

      deleteExpense: (id) =>
        set((state) => ({
          expenses: state.expenses.filter((e) => e.id !== id),
        })),

      setMonthlyBudget: (amount) =>
        set({ monthlyBudget: Math.max(0, amount) }),
    }),
    {
      name: "disciplined-expenses", // localStorage key
    },
  ),
);