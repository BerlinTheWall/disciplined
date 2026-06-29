import { create } from "zustand";
import { persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

import { PAGE_ORDER, type Page } from "@/lib/pages";

interface State {
  navbarPages: Page[];
}

const initialState: State = {
  navbarPages: ["schedule", "meals", "workout", "habits"],
};

interface Actions {
  toggleNavbar: (page: Page) => void;
}

export const useNavStore = create<State & Actions>()(
  persist(
    immer((set, get) => ({
      ...initialState,

      toggleNavbar: (page: Page) => {
        if (page === "schedule") return;
        const current = get().navbarPages;
        const inNav = current.includes(page);
        if (inNav) {
          set((state) => {
            state.navbarPages = current.filter((p) => p !== page);
          });
        } else if (current.length < 4) {
          const next = PAGE_ORDER.filter((p) => [...current, page].includes(p));
          set((state) => {
            state.navbarPages = next;
          });
        }
      },
    })),
    { name: "nav-config" }
  )
);
