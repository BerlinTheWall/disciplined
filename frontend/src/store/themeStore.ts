import { create } from "zustand";
import { persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

import type { Theme } from "@/lib/theme";

function applyTheme(theme: Theme) {
  if (theme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

interface State {
  theme: Theme;
}

const initialState: State = {
  theme: "light",
};

interface Actions {
  toggleTheme: () => void;
}

export const useThemeStore = create<State & Actions>()(
  persist(
    immer((set, get) => ({
      ...initialState,
      toggleTheme: () => {
        const next: Theme = get().theme === "light" ? "dark" : "light";
        applyTheme(next);
        set((state) => {
          state.theme = next;
        });
      },
    })),
    {
      name: "app-theme",
      onRehydrateStorage: () => (state) => {
        if (state) applyTheme(state.theme);
      },
    }
  )
);
