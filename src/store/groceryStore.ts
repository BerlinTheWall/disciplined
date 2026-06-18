import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { GroceryItem } from "../types/grocery";
import { estimateNutrition } from "../lib/nutritions";

interface GroceryStore {
  groceryItems: GroceryItem[];
  addGroceryItem: (item: Omit<GroceryItem, "id" | "checked">) => void;
  updateGroceryItem: (
    id: string,
    changes: Partial<Omit<GroceryItem, "id">>,
  ) => void;
  deleteGroceryItem: (id: string) => void;
  toggleChecked: (id: string) => void;
  clearChecked: () => void;
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
    checked: false,
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
    checked: false,
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
    checked: false,
  },
];

export const useGroceryStore = create<GroceryStore>()(
  persist(
    (set) => ({
      groceryItems: initialGroceryItems,

      addGroceryItem: (item) =>
        set((state) => ({
          groceryItems: [
            ...state.groceryItems,
            { ...item, id: crypto.randomUUID(), checked: false },
          ],
        })),

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

      toggleChecked: (id) =>
        set((state) => ({
          groceryItems: state.groceryItems.map((g) =>
            g.id === id ? { ...g, checked: !g.checked } : g,
          ),
        })),

      clearChecked: () =>
        set((state) => ({
          groceryItems: state.groceryItems.map((g) =>
            g.checked ? { ...g, checked: false } : g,
          ),
        })),
    }),
    {
      name: "disciplined-grocery", // localStorage key
    },
  ),
);