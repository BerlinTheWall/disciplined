import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { GroceryItem } from "../types/grocery";
import { estimateNutrition } from "../lib/nutritions";

// The item catalog: the single source of truth for every food/product the user
// has added. Shopping lists and meals both reference these items by id. This
// store holds DEFINITIONS only — per-trip state (what's ticked) lives on the
// shopping list, and what's eaten lives on meals.
interface GroceryStore {
  groceryItems: GroceryItem[];
  // Returns the new item's id so callers (e.g. a picker) can immediately use it.
  addGroceryItem: (item: Omit<GroceryItem, "id">) => string;
  updateGroceryItem: (
    id: string,
    changes: Partial<Omit<GroceryItem, "id">>,
  ) => void;
  deleteGroceryItem: (id: string) => void;
}

const initialGroceryItems: GroceryItem[] = [
  {
    id: "g1",
    name: "Chicken breast",
    category: "protein",
    price: 7.5,
    quantity: 500,
    unit: "g",
    nutrition: estimateNutrition("Chicken breast", "protein", 500, "g"),
    autoNutrition: true,
  },
  {
    id: "g2",
    name: "Bananas",
    category: "fruit",
    price: 2.0,
    quantity: 6,
    unit: "unit",
    nutrition: estimateNutrition("Bananas", "fruit", 6, "unit"),
    autoNutrition: true,
  },
  {
    id: "g3",
    name: "Milk",
    category: "dairy",
    price: 4.5,
    quantity: 2,
    unit: "l",
    nutrition: estimateNutrition("Milk", "dairy", 2, "l"),
    autoNutrition: true,
  },
];

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
          groceryItems: state.groceryItems.map((g) =>
            g.id === id ? { ...g, ...changes } : g,
          ),
        })),

      deleteGroceryItem: (id) =>
        set((state) => ({
          groceryItems: state.groceryItems.filter((g) => g.id !== id),
        })),
    }),
    {
      name: "disciplined-grocery", // localStorage key
    },
  ),
);