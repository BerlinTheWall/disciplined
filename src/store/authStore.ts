import { create } from "zustand";
import { persist } from "zustand/middleware";

import { api, setToken, type AuthUser } from "@/lib/api";

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

// Keys of the stores that sync to the backend. Cleared on logout so the next
// account on this device doesn't inherit (or seed the server with) the
// previous account's data.
const SYNCED_STORE_KEYS = [
  "disciplined-tasks",
  "disciplined-habits",
  "disciplined-workouts",
  "disciplined-meals",
];

export const useAuthStore = create<State & Actions>()(
  persist(
    (set) => ({
      user: null,
      login: async (email, password) => {
        const { token, user } = await api.auth.login(email, password);
        setToken(token);
        set({ user });
      },
      register: async (email, password, displayName) => {
        const { token, user } = await api.auth.register(email, password, displayName);
        setToken(token);
        set({ user });
      },
      logout: () => {
        setToken(null);
        for (const key of SYNCED_STORE_KEYS) localStorage.removeItem(key);
        set({ user: null });
        // Reload so the sync module and all stores start from a clean slate.
        window.location.reload();
      },
    }),
    { name: "disciplined-auth" }
  )
);
