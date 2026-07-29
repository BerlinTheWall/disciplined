import { create } from "zustand";
import { persist } from "zustand/middleware";

import { api, setToken, type AuthUser } from "@/lib/api";
import { deviceTimezone } from "@/lib/timezone";
import { useProfileStore } from "@/store/profileStore";

// The signed-in account. The JWT itself lives in localStorage via api.ts
// (setToken); this store holds who is logged in and drives the auth gate.
interface State {
  user: AuthUser | null;
}

interface Actions {
  login: (email: string, password: string) => Promise<void>;
  // Doesn't sign anyone in — the account isn't usable until verifyEmail
  // succeeds (see routers/auth.py). Callers should follow this with the
  // verify-code step, not treat it like login/verifyEmail.
  register: (email: string, password: string, firstName: string, lastName: string) => Promise<void>;
  logout: () => void;
  verifyEmail: (email: string, code: string) => Promise<void>;
  resendVerification: (email: string) => Promise<string>;
  forgotPassword: (email: string) => Promise<string>;
  resetPassword: (email: string, code: string, newPassword: string) => Promise<void>;
  // No-op when the device's current zone matches what's stored (the common
  // case on every launch) — only actually calls the API when it's changed.
  syncTimezone: () => Promise<void>;
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
// USER_DATA_STORE_KEYS below). Seed it from the account's first name right
// after sign-in, but only while it's still that untouched default, so a name
// customized on this device is never clobbered.
function seedProfileName(firstName: string) {
  if (useProfileStore.getState().name === "You") {
    useProfileStore.getState().setName(firstName);
  }
}

export const useAuthStore = create<State & Actions>()(
  persist(
    (set, get) => ({
      user: null,
      login: async (email, password) => {
        const { token, user } = await api.auth.login(email, password);
        setToken(token);
        seedProfileName(user.firstName);
        set({ user });
      },
      register: async (email, password, firstName, lastName) => {
        await api.auth.register(email, password, firstName, lastName, deviceTimezone());
        seedProfileName(firstName);
      },
      logout: () => {
        setToken(null);
        for (const key of USER_DATA_STORE_KEYS) localStorage.removeItem(key);
        // Clear the persisted auth directly rather than set({ user: null }) —
        // a store update would re-render the app to the login page right
        // away, which then flashes again after the reload below finishes.
        // Reloading with storage already cleared shows the splash first,
        // then the login page, exactly once.
        localStorage.removeItem("disciplined-auth");
        window.location.reload();
      },
      verifyEmail: async (email, code) => {
        const { token, user } = await api.auth.verifyEmail(email, code);
        setToken(token);
        seedProfileName(user.firstName);
        set({ user });
      },
      resendVerification: async (email) => {
        const { message } = await api.auth.resendVerification(email);
        return message;
      },
      forgotPassword: async (email) => {
        const { message } = await api.auth.forgotPassword(email);
        return message;
      },
      resetPassword: async (email, code, newPassword) => {
        const { token, user } = await api.auth.resetPassword(email, code, newPassword);
        setToken(token);
        set({ user });
      },
      syncTimezone: async () => {
        const user = get().user;
        const tz = deviceTimezone();
        if (!user || !tz || tz === user.timezone) return;
        const updated = await api.auth.updateTimezone(tz).catch(() => null);
        if (updated) set({ user: updated });
      },
    }),
    { name: "disciplined-auth" }
  )
);
