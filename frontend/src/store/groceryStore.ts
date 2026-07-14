import { create } from "zustand";
import { persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

import type { GroceryItem } from "@/types/grocery";

// The item catalog: the single source of truth for every food/product the user
// has added. Shopping lists and meals both reference these items by id. This
// store holds DEFINITIONS only — per-trip state (what's ticked) lives on the
// shopping list, and what's eaten lives on meals.

interface State {
  groceryItems: GroceryItem[];
}

const initialState: State = {
  groceryItems: [],
};

interface Actions {
  // Returns the new item's id so callers (e.g. a picker) can immediately use it.
  addGroceryItem: (item: Omit<GroceryItem, "id">) => string;
  updateGroceryItem: (id: string, changes: Partial<Omit<GroceryItem, "id">>) => void;
  deleteGroceryItem: (id: string) => void;
  // Change on-hand stock by a delta (negative to consume), clamped at 0.
  adjustStock: (id: string, delta: number) => void;
}

export const useGroceryStore = create<State & Actions>()(
  persist(
    immer((set) => ({
      ...initialState,

      addGroceryItem: (item) => {
        const id = crypto.randomUUID();
        set((state) => {
          state.groceryItems.push({ ...item, id });
        });
        return id;
      },

      updateGroceryItem: (id, changes) =>
        set((state) => {
          const item = state.groceryItems.find((g) => g.id === id);
          if (item) Object.assign(item, changes);
        }),

      deleteGroceryItem: (id) =>
        set((state) => {
          const index = state.groceryItems.findIndex((g) => g.id === id);
          if (index !== -1) state.groceryItems.splice(index, 1);
        }),

      adjustStock: (id, delta) =>
        set((state) => {
          const item = state.groceryItems.find((g) => g.id === id);
          if (item) item.stock = Math.max(0, Math.round((item.stock + delta) * 100) / 100);
        }),
    })),
    {
      name: "disciplined-grocery",
      version: 1,
      migrate: (persisted, version) => {
        const state = persisted as { groceryItems?: GroceryItem[] } | undefined;
        if (!state) return persisted as never;
        if (version < 1) {
          const items = (state.groceryItems ?? [])
            .filter((it) => !["g1", "g2", "g3"].includes(it.id))
            .map((it) => ({ ...it, stock: it.stock ?? it.quantity ?? 0 }));
          return { ...state, groceryItems: items } as never;
        }
        return state as never;
      },
    }
  )
);
