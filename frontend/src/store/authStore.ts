import { create } from "zustand";
import { persist } from "zustand/middleware";

import { api, setToken, type AuthUser } from "@/lib/api";
import { useProfileStore } from "@/store/profileStore";

// The signed-in account. The JWT itself lives in localStorage via api.ts
// (setToken); this store holds who is logged in and drives the auth gate.
interface State {
  user: AuthUser | null;
}

interface Actions {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => void;
}

// Keys of the stores holding user content. Cleared on logout so the next
// account on this device doesn't inherit — or, for the synced stores, seed
// the server with — the previous account's data. Device preferences
// (settings, theme, tutorial/onboarding flags) survive.
const USER_DATA_STORE_KEYS = [
  // synced with the backend
  "disciplined-tasks",
  "disciplined-habits",
  "disciplined-workouts",
  "disciplined-meals",
  "disciplined-goals",
  // device-local user content
  "disciplined-grocery",
  "disciplined-expenses",
  "disciplined-recipes",
  "disciplined-shopping",
  "disciplined-preferences",
  "disciplined-profile",
  "disciplined-reminders",
];

// The profile hub's display name (useProfileStore) is local-only, not synced
// from the account — logout resets it to the generic "You" default (see
// USER_DATA_STORE_KEYS below). Seed it from the account's real displayName
// right after sign-in, but only while it's still that untouched default, so
// a name customized on this device is never clobbered.
function seedProfileName(displayName: string) {
  if (useProfileStore.getState().name === "You") {
    useProfileStore.getState().setName(displayName);
  }
}

export const useAuthStore = create<State & Actions>()(
  persist(
    (set) => ({
      user: null,
      login: async (email, password) => {
        const { token, user } = await api.auth.login(email, password);
        setToken(token);
        seedProfileName(user.displayName);
        set({ user });
      },
      register: async (email, password, displayName) => {
        const { token, user } = await api.auth.register(email, password, displayName);
        setToken(token);
        seedProfileName(user.displayName);
        set({ user });
      },
      logout: () => {
        setToken(null);
        for (const key of USER_DATA_STORE_KEYS) localStorage.removeItem(key);
        set({ user: null });
        // Reload so the sync module and all stores start from a clean slate.
        window.location.reload();
      },
    }),
    { name: "disciplined-auth" }
  )
);
