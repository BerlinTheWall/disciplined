import { create } from "zustand";
import { persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

// The user's identity for the profile hub. Local-only (no account/backend); it
// just personalizes the app and feeds the side-menu user card.
interface State {
  name: string;
  tagline: string;
}

const initialState: State = {
  name: "Hooman",
  tagline: "Staying disciplined",
};

interface Actions {
  setName: (name: string) => void;
  setTagline: (tagline: string) => void;
}

export const useProfileStore = create<State & Actions>()(
  persist(
    immer((set) => ({
      ...initialState,
      setName: (name) =>
        set((state) => {
          state.name = name;
        }),
      setTagline: (tagline) =>
        set((state) => {
          state.tagline = tagline;
        }),
    })),
    { name: "disciplined-profile" }
  )
);
