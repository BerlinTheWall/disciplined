import { create } from "zustand";
import { persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

import type { Recipe } from "@/types/recipe";

// Recipes are reusable plans for what to make. Tasks and meals link to them by id.

interface State {
  recipes: Recipe[];
}

const initialState: State = {
  recipes: [],
};

interface Actions {
  addRecipe: (recipe: Omit<Recipe, "id">) => string;
  updateRecipe: (id: string, changes: Partial<Omit<Recipe, "id">>) => void;
  deleteRecipe: (id: string) => void;
}

export const useRecipeStore = create<State & Actions>()(
  persist(
    immer((set) => ({
      ...initialState,

      addRecipe: (recipe) => {
        const id = crypto.randomUUID();
        set((state) => {
          state.recipes.push({ ...recipe, id });
        });
        return id;
      },

      updateRecipe: (id, changes) =>
        set((state) => {
          const recipe = state.recipes.find((r) => r.id === id);
          if (recipe) Object.assign(recipe, changes);
        }),

      deleteRecipe: (id) =>
        set((state) => {
          const index = state.recipes.findIndex((r) => r.id === id);
          if (index !== -1) state.recipes.splice(index, 1);
        }),
    })),
    {
      name: "disciplined-recipes",
      version: 1,
      migrate: (persisted, version) => {
        const state = persisted as { recipes?: Recipe[] } | undefined;
        if (!state) return persisted as never;
        if (version < 1) {
          return {
            ...state,
            recipes: (state.recipes ?? []).filter((r) => !["r1", "r2"].includes(r.id)),
          } as never;
        }
        return state as never;
      },
    }
  )
);
