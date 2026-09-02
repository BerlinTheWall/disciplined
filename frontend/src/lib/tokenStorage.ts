import { SecureStorage } from "@aparajita/capacitor-secure-storage";
import { Capacitor } from "@capacitor/core";

// The auth JWT (see api.ts) is the one piece of client state worth more than
// localStorage: on iOS/Android it now lives in the platform Keychain/Keystore
// (encrypted at rest, excluded from unencrypted device backups) instead of a
// plain-text entry any script in the WebView could read straight off disk.
// The plugin's own web implementation stores it in plain localStorage "for
// debugging purposes only" (see its README) — not good enough for a real
// deployment, so the web build keeps using localStorage directly here, same
// as before this change.
const KEY = "disciplined-token";
const native = Capacitor.isNativePlatform();

export async function getToken(): Promise<string | null> {
  if (!native) return localStorage.getItem(KEY);
  try {
    const token = await SecureStorage.getItem(KEY);
    if (token !== null) return token;
  } catch {
    return null;
  }
  // One-time migration for an app already installed before this change: pick
  // up whatever token localStorage still has, move it into the Keychain/
  // Keystore, and stop leaving a plain-text copy on disk — instead of
  // silently logging out every existing user on their next launch.
  const legacy = localStorage.getItem(KEY);
  if (legacy === null) return null;
  localStorage.removeItem(KEY);
  try {
    await SecureStorage.setItem(KEY, legacy);
  } catch {
    // Best effort — still honor it for this session even if the write failed.
  }
  return legacy;
}

export async function setToken(token: string | null): Promise<void> {
  if (!native) {
    if (token === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, token);
    return;
  }
  try {
    if (token === null) await SecureStorage.removeItem(KEY);
    else await SecureStorage.setItem(KEY, token);
  } catch {
    // A failed keychain write shouldn't crash login/logout — the next
    // request will simply come back 401 and route through the normal
    // api-unauthorized -> logout flow (see api.ts's request()).
  }
}
