import type { StateStorage } from "zustand/middleware";

import { useAuthStore } from "@/store/authStore";

// A zustand `persist` storage engine that namespaces the underlying
// localStorage key by whichever account is currently signed in. Use this
// (instead of the default, unscoped localStorage) for any store whose data
// is genuinely per-account but — unlike tasks/habits/goals/etc — has no
// server copy to fall back on, so it can't just be wiped on every logout:
// switching accounts on one device must neither leak the previous account's
// data into the new one, nor destroy it if that account logs back in later.
export function userScopedStorage(baseKey: string): StateStorage {
  const keyFor = () => `${baseKey}:${useAuthStore.getState().user?.id ?? "anon"}`;
  return {
    getItem: (): string | null => localStorage.getItem(keyFor()),
    setItem: (_name: string, value: string): void => localStorage.setItem(keyFor(), value),
    removeItem: (): void => localStorage.removeItem(keyFor()),
  };
}

// zustand's `persist` only reads from storage once, at module load — it has
// no idea the *key* itself depends on who's signed in. Logging out already
// reloads the page (so a fresh load re-reads under the new "anon" key), but
// logging in doesn't reload anything, so without this a store built on
// userScopedStorage would keep showing whatever loaded before sign-in until
// the app was closed and reopened. Call this once per store, right after
// creating it, to make it re-read from the right key the moment the signed-in
// account actually changes.
export function rehydrateOnAccountChange(store: { persist: { rehydrate: () => unknown } }): void {
  useAuthStore.subscribe((state, prev) => {
    if (state.user?.id !== prev.user?.id) store.persist.rehydrate();
  });
}
