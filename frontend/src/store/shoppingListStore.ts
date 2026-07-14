import { create } from "zustand";
import { persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

import { todayISODate } from "@/lib/date";
import type { ShoppingList } from "@/types/shopping";

// Shopping lists are the "trip" events. A line references a catalog item by id
// with a quantity multiplier and a per-trip checked flag. Completing a trip is
// done from the Expenses page: it sums the checked lines into an Expense and
// calls markDone with that expense's id.

interface State {
  lists: ShoppingList[];
  activeListId: string | null;
}

const initialState: State = {
  lists: [],
  activeListId: null,
};

interface Actions {
  createList: (init?: Partial<Pick<ShoppingList, "title" | "date" | "taskId">>) => string;
  deleteList: (id: string) => void;
  setActiveList: (id: string | null) => void;
  setListTask: (id: string, taskId: string) => void;

  addLine: (listId: string, itemId: string, qty?: number) => void;
  removeLine: (listId: string, itemId: string) => void;
  setLineQty: (listId: string, itemId: string, qty: number) => void;
  toggleLine: (listId: string, itemId: string) => void;

  markDone: (listId: string, expenseId: string) => void;
}

export const useShoppingListStore = create<State & Actions>()(
  persist(
    immer((set) => ({
      ...initialState,

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
        set((state) => {
          state.lists.push(list);
          state.activeListId = id;
        });
        return id;
      },

      deleteList: (id) =>
        set((state) => {
          const index = state.lists.findIndex((l) => l.id === id);
          if (index === -1) return;
          state.lists.splice(index, 1);
          if (state.activeListId === id) state.activeListId = state.lists[0]?.id ?? null;
        }),

      setActiveList: (id) =>
        set((state) => {
          state.activeListId = id;
        }),

      setListTask: (id, taskId) =>
        set((state) => {
          const list = state.lists.find((l) => l.id === id);
          if (list) list.taskId = taskId;
        }),

      addLine: (listId, itemId, qty = 1) =>
        set((state) => {
          const list = state.lists.find((l) => l.id === listId);
          if (!list) return;
          if (list.lines.some((line) => line.itemId === itemId)) return;
          list.lines.push({ itemId, qty, checked: false });
        }),

      removeLine: (listId, itemId) =>
        set((state) => {
          const list = state.lists.find((l) => l.id === listId);
          if (!list) return;
          const index = list.lines.findIndex((line) => line.itemId === itemId);
          if (index !== -1) list.lines.splice(index, 1);
        }),

      setLineQty: (listId, itemId, qty) =>
        set((state) => {
          const list = state.lists.find((l) => l.id === listId);
          if (!list) return;
          const line = list.lines.find((line) => line.itemId === itemId);
          if (line) line.qty = Math.max(0.25, Math.round(qty * 100) / 100);
        }),

      toggleLine: (listId, itemId) =>
        set((state) => {
          const list = state.lists.find((l) => l.id === listId);
          if (!list) return;
          const line = list.lines.find((line) => line.itemId === itemId);
          if (line) line.checked = !line.checked;
        }),

      markDone: (listId, expenseId) =>
        set((state) => {
          const list = state.lists.find((l) => l.id === listId);
          if (!list) return;
          list.status = "done";
          list.expenseId = expenseId;
        }),
    })),
    {
      name: "disciplined-shopping",
      version: 1,
      migrate: (persisted, version) => {
        const state = persisted as
          { lists?: ShoppingList[]; activeListId?: string | null } | undefined;
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
    }
  )
);
