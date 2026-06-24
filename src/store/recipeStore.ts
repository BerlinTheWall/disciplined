import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Recipe } from '../types/recipe'

// Recipes are reusable plans for what to make. Tasks and meals link to them by id.
interface RecipeStore {
  recipes: Recipe[]
  addRecipe: (recipe: Omit<Recipe, 'id'>) => string
  updateRecipe: (id: string, changes: Partial<Omit<Recipe, 'id'>>) => void
  deleteRecipe: (id: string) => void
}

const initialRecipes: Recipe[] = []

export const useRecipeStore = create<RecipeStore>()(
  persist(
    (set) => ({
      recipes: initialRecipes,

      addRecipe: (recipe) => {
        const id = crypto.randomUUID()
        set((state) => ({ recipes: [...state.recipes, { ...recipe, id }] }))
        return id
      },

      updateRecipe: (id, changes) =>
        set((state) => ({
          recipes: state.recipes.map((r) => (r.id === id ? { ...r, ...changes } : r)),
        })),

      deleteRecipe: (id) =>
        set((state) => ({ recipes: state.recipes.filter((r) => r.id !== id) })),
    }),
    {
      name: 'disciplined-recipes', // localStorage key
      version: 1,
      // v1: drop the sample seed recipes that referenced the removed seed catalog items.
      migrate: (persisted, version) => {
        const state = persisted as { recipes?: Recipe[] } | undefined
        if (!state) return persisted as never
        if (version < 1) {
          return {
            ...state,
            recipes: (state.recipes ?? []).filter((r) => !['r1', 'r2'].includes(r.id)),
          } as never
        }
        return state as never
      },
    },
  ),
)
