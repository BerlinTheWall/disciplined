import { create } from 'zustand'

// Transient (non-persisted) cross-page intent: "jump to the Recipes section and
// open this recipe's detail". Set from a linked task; consumed by the Recipes
// page once it mounts, then cleared. Mirrors workoutFocusStore.
interface RecipeFocusStore {
  pendingRecipeId: string | null
  openRecipe: (id: string) => void
  clear: () => void
}

export const useRecipeFocusStore = create<RecipeFocusStore>((set) => ({
  pendingRecipeId: null,
  openRecipe: (id) => set({ pendingRecipeId: id }),
  clear: () => set({ pendingRecipeId: null }),
}))
