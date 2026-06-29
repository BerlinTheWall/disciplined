import { create } from "zustand";
import { persist } from "zustand/middleware";

import { todayISODate } from "@/lib/date";
import type { Meal } from "@/types/meal";

// Meals are dated log entries of what was eaten. Components reference catalog
// items by id and scale them by servings. Daily diet totals roll up from here.
interface MealStore {
  meals: Meal[];
  addMeal: (meal: Omit<Meal, "id">) => string;
  updateMeal: (id: string, changes: Partial<Omit<Meal, "id">>) => void;
  deleteMeal: (id: string) => void;
  setComponentServings: (mealId: string, itemId: string, servings: number) => void;
  removeComponent: (mealId: string, itemId: string) => void;
}

const today = todayISODate();

const initialMeals: Meal[] = [
  {
    id: "m1",
    name: "Post-workout lunch",
    type: "lunch",
    date: today,
    components: [
      { itemId: "g1", servings: 0.4 },
      { itemId: "g2", servings: 0.33 },
    ],
  },
];

export const useMealStore = create<MealStore>()(
  persist(
    (set) => ({
      meals: initialMeals,

      addMeal: (meal) => {
        const id = crypto.randomUUID();
        set((state) => ({ meals: [...state.meals, { ...meal, id }] }));
        return id;
      },

      updateMeal: (id, changes) =>
        set((state) => ({
          meals: state.meals.map((m) => (m.id === id ? { ...m, ...changes } : m)),
        })),

      deleteMeal: (id) => set((state) => ({ meals: state.meals.filter((m) => m.id !== id) })),

      setComponentServings: (mealId, itemId, servings) =>
        set((state) => ({
          meals: state.meals.map((m) =>
            m.id === mealId
              ? {
                  ...m,
                  components: m.components.map((c) =>
                    c.itemId === itemId
                      ? { ...c, servings: Math.max(0, Math.round(servings * 100) / 100) }
                      : c
                  ),
                }
              : m
          ),
        })),

      removeComponent: (mealId, itemId) =>
        set((state) => ({
          meals: state.meals.map((m) =>
            m.id === mealId
              ? { ...m, components: m.components.filter((c) => c.itemId !== itemId) }
              : m
          ),
        })),
    }),
    {
      name: "disciplined-meals", // localStorage key
    }
  )
);
