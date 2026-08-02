import { create } from "zustand";
import { persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

// The profile hub's tagline and avatar. Local-only (no backend field for
// either); the display name itself lives on the account (see authStore's
// `user.displayName`, synced with the backend) rather than here.
interface State {
  tagline: string;
  // Small square JPEG data URL (see lib/avatar.ts) or null for the initial.
  avatar: string | null;
}

const initialState: State = {
  tagline: "Staying disciplined",
  avatar: null,
};

interface Actions {
  setTagline: (tagline: string) => void;
  setAvatar: (avatar: string | null) => void;
}

export const useProfileStore = create<State & Actions>()(
  persist(
    immer((set) => ({
      ...initialState,
      setTagline: (tagline) =>
        set((state) => {
          state.tagline = tagline;
        }),
      setAvatar: (avatar) =>
        set((state) => {
          state.avatar = avatar;
        }),
    })),
    { name: "disciplined-profile" }
  )
);
