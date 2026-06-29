import { create } from "zustand";

// Transient (non-persisted) cross-page intent: "jump to the Recipes section and
// open this recipe's detail". Set from a linked task; consumed by the Recipes
// page once it mounts, then cleared. Mirrors workoutFocusStore.
interface State {
  pendingRecipeId: string | null;
}

const initialState: State = {
  pendingRecipeId: null,
};

interface Actions {
  openRecipe: (id: string) => void;
  clear: () => void;
}

export const useRecipeFocusStore = create<State & Actions>((set) => ({
  ...initialState,

  openRecipe: (id) => set({ pendingRecipeId: id }),
  clear: () => set({ pendingRecipeId: null }),
}));
