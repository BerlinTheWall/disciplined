import { create } from "zustand";
import { persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

import type { Meal } from "@/types/meal";

// Meals are dated log entries of what was eaten. Components reference catalog
// items by id and scale them by servings. Daily diet totals roll up from here.

interface State {
  meals: Meal[];
}

const initialState: State = {
  meals: [],
};

interface Actions {
  addMeal: (meal: Omit<Meal, "id">) => string;
  updateMeal: (id: string, changes: Partial<Omit<Meal, "id">>) => void;
  deleteMeal: (id: string) => void;
  setComponentServings: (mealId: string, itemId: string, servings: number) => void;
  removeComponent: (mealId: string, itemId: string) => void;
}

export const useMealStore = create<State & Actions>()(
  persist(
    immer((set) => ({
      ...initialState,

      addMeal: (meal) => {
        const id = crypto.randomUUID();
        set((state) => {
          state.meals.push({ ...meal, id });
        });
        return id;
      },

      updateMeal: (id, changes) =>
        set((state) => {
          const meal = state.meals.find((m) => m.id === id);
          if (meal) Object.assign(meal, changes);
        }),

      deleteMeal: (id) =>
        set((state) => {
          const index = state.meals.findIndex((m) => m.id === id);
          if (index !== -1) state.meals.splice(index, 1);
        }),

      setComponentServings: (mealId, itemId, servings) =>
        set((state) => {
          const meal = state.meals.find((m) => m.id === mealId);
          if (!meal) return;
          const component = meal.components.find((c) => c.itemId === itemId);
          if (component) component.servings = Math.max(0, Math.round(servings * 100) / 100);
        }),

      removeComponent: (mealId, itemId) =>
        set((state) => {
          const meal = state.meals.find((m) => m.id === mealId);
          if (!meal) return;
          const index = meal.components.findIndex((c) => c.itemId === itemId);
          if (index !== -1) meal.components.splice(index, 1);
        }),
    })),
    {
      name: "disciplined-meals",
      version: 1,
      migrate: (persisted, version) => {
        const state = persisted as { meals?: Meal[] } | undefined;
        if (!state) return persisted as never;
        if (version < 1) {
          return { ...state, meals: (state.meals ?? []).filter((m) => m.id !== "m1") } as never;
        }
        return state as never;
      },
    }
  )
);
