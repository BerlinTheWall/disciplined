import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ShoppingList } from "../types/shopping";
import { todayISODate } from "../lib/date";

// Shopping lists are the "trip" events. A line references a catalog item by id
// with a quantity multiplier and a per-trip checked flag. Completing a trip is
// done from the Expenses page: it sums the checked lines into an Expense and
// calls markDone with that expense's id.
interface ShoppingListStore {
  lists: ShoppingList[];
  activeListId: string | null;

  createList: (
    init?: Partial<Pick<ShoppingList, "title" | "date" | "taskId">>,
  ) => string;
  deleteList: (id: string) => void;
  setActiveList: (id: string | null) => void;
  setListTask: (id: string, taskId: string) => void;

  addLine: (listId: string, itemId: string, qty?: number) => void;
  removeLine: (listId: string, itemId: string) => void;
  setLineQty: (listId: string, itemId: string, qty: number) => void;
  toggleLine: (listId: string, itemId: string) => void;

  markDone: (listId: string, expenseId: string) => void;
}

const initialLists: ShoppingList[] = [];

export const useShoppingListStore = create<ShoppingListStore>()(
  persist(
    (set) => ({
      lists: initialLists,
      activeListId: null,

      createList: (init) => {
        const id = crypto.randomUUID();
        const list: ShoppingList = {
          id,
          title: init?.title?.trim() || "Shopping list",
          date: init?.date || todayISODate(),
          status: "planned",
          lines: [],
          taskId: init?.taskId,
        };
        set((state) => ({ lists: [...state.lists, list], activeListId: id }));
        return id;
      },

      deleteList: (id) =>
        set((state) => {
          const lists = state.lists.filter((l) => l.id !== id);
          return {
            lists,
            activeListId:
              state.activeListId === id ? (lists[0]?.id ?? null) : state.activeListId,
          };
        }),

      setActiveList: (id) => set({ activeListId: id }),

      setListTask: (id, taskId) =>
        set((state) => ({
          lists: state.lists.map((l) => (l.id === id ? { ...l, taskId } : l)),
        })),

      addLine: (listId, itemId, qty = 1) =>
        set((state) => ({
          lists: state.lists.map((l) => {
            if (l.id !== listId) return l;
            if (l.lines.some((line) => line.itemId === itemId)) return l;
            return { ...l, lines: [...l.lines, { itemId, qty, checked: false }] };
          }),
        })),

      removeLine: (listId, itemId) =>
        set((state) => ({
          lists: state.lists.map((l) =>
            l.id === listId
              ? { ...l, lines: l.lines.filter((line) => line.itemId !== itemId) }
              : l,
          ),
        })),

      setLineQty: (listId, itemId, qty) =>
        set((state) => ({
          lists: state.lists.map((l) =>
            l.id === listId
              ? {
                  ...l,
                  lines: l.lines.map((line) =>
                    line.itemId === itemId
                      ? { ...line, qty: Math.max(0.25, Math.round(qty * 100) / 100) }
                      : line,
                  ),
                }
              : l,
          ),
        })),

      toggleLine: (listId, itemId) =>
        set((state) => ({
          lists: state.lists.map((l) =>
            l.id === listId
              ? {
                  ...l,
                  lines: l.lines.map((line) =>
                    line.itemId === itemId
                      ? { ...line, checked: !line.checked }
                      : line,
                  ),
                }
              : l,
          ),
        })),

      markDone: (listId, expenseId) =>
        set((state) => ({
          lists: state.lists.map((l) =>
            l.id === listId ? { ...l, status: "done", expenseId } : l,
          ),
        })),
    }),
    {
      name: "disciplined-shopping", // localStorage key
      version: 1,
      // v1: drop the sample seed list (sl1) that referenced removed seed catalog items.
      migrate: (persisted, version) => {
        const state = persisted as
          | { lists?: ShoppingList[]; activeListId?: string | null }
          | undefined;
        if (!state) return persisted as never;
        if (version < 1) {
          const lists = (state.lists ?? []).filter((l) => l.id !== "sl1");
          return {
            ...state,
            lists,
            activeListId:
              state.activeListId === "sl1" ? (lists[0]?.id ?? null) : state.activeListId,
          } as never;
        }
        return state as never;
      },
    },
  ),
);