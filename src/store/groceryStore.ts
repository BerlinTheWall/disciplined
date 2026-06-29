import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { GroceryItem } from "@/types/grocery";

// The item catalog: the single source of truth for every food/product the user
// has added. Shopping lists and meals both reference these items by id. This
// store holds DEFINITIONS only — per-trip state (what's ticked) lives on the
// shopping list, and what's eaten lives on meals.
interface GroceryStore {
  groceryItems: GroceryItem[];
  // Returns the new item's id so callers (e.g. a picker) can immediately use it.
  addGroceryItem: (item: Omit<GroceryItem, "id">) => string;
  updateGroceryItem: (id: string, changes: Partial<Omit<GroceryItem, "id">>) => void;
  deleteGroceryItem: (id: string) => void;
  // Change on-hand stock by a delta (negative to consume), clamped at 0.
  adjustStock: (id: string, delta: number) => void;
}

// The catalog starts empty — the user builds it up in the Food & Products section.
const initialGroceryItems: GroceryItem[] = [];

export const useGroceryStore = create<GroceryStore>()(
  persist(
    (set) => ({
      groceryItems: initialGroceryItems,

      addGroceryItem: (item) => {
        const id = crypto.randomUUID();
        set((state) => ({
          groceryItems: [...state.groceryItems, { ...item, id }],
        }));
        return id;
      },

      updateGroceryItem: (id, changes) =>
        set((state) => ({
          groceryItems: state.groceryItems.map((g) => (g.id === id ? { ...g, ...changes } : g)),
        })),

      deleteGroceryItem: (id) =>
        set((state) => ({
          groceryItems: state.groceryItems.filter((g) => g.id !== id),
        })),

      adjustStock: (id, delta) =>
        set((state) => ({
          groceryItems: state.groceryItems.map((g) =>
            g.id === id
              ? { ...g, stock: Math.max(0, Math.round((g.stock + delta) * 100) / 100) }
              : g
          ),
        })),
    }),
    {
      name: "disciplined-grocery", // localStorage key
      version: 1,
      // v1: drop the sample seed items (g1/g2/g3) and add the `stock` field
      // (defaulting to one reference amount on hand) to any existing items.
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
