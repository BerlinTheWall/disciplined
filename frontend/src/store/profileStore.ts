import { create } from "zustand";
import { persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

// The profile hub's tagline. Local-only (no backend field); the display name
// itself lives on the account (see authStore's `user.displayName`, synced
// with the backend) rather than here.
interface State {
  tagline: string;
}

const initialState: State = {
  tagline: "Staying disciplined",
};

interface Actions {
  setTagline: (tagline: string) => void;
}

export const useProfileStore = create<State & Actions>()(
  persist(
    immer((set) => ({
      ...initialState,
      setTagline: (tagline) =>
        set((state) => {
          state.tagline = tagline;
        }),
    })),
    { name: "disciplined-profile" }
  )
);
