import { App as CapacitorApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";

import { api } from "./api";
import { useOutlookStore } from "@/store/outlookStore";

// Connects disciplined directly to a Microsoft account via Graph OAuth —
// independent of the device-calendar feature (lib/deviceCalendar.ts), which
// only sees what's synced into the phone's own calendar app (Outlook often
// isn't, unless its own "sync to device calendar" setting is on).
//
// Flow: backend builds the Microsoft login URL (GET /api/outlook/connect),
// opened here in an in-app browser natively, or as a full-page redirect on
// web — Microsoft's identity platform requires a real top-level browser
// context either way, not an iframe/WebView-embedded one. Microsoft
// redirects to the backend's own /api/outlook/callback (so the client
// secret never touches the client), which does the token exchange and then
// redirects again — to this app's custom URL scheme natively (caught below
// via appUrlOpen), or back to this tab's own origin on web (caught below by
// checking the query string on load, since a full-page redirect reloads the
// SPA from scratch).
export const outlookSupported = true;

const CALLBACK_PREFIX = "com.hooman.disciplined://outlook-callback";
const WEB_CALLBACK_PARAM = "outlookConnected";

export async function connectOutlook(): Promise<void> {
  const native = Capacitor.isNativePlatform();
  const { authorizeUrl } = await api.outlook.connect(native ? undefined : window.location.origin);
  if (native) {
    await Browser.open({ url: authorizeUrl });
  } else {
    // A full top-level navigation, not a fetch — Microsoft's login page
    // can't run inside this tab any other way.
    window.location.href = authorizeUrl;
  }
}

export async function disconnectOutlook(): Promise<void> {
  await api.outlook.disconnect();
  await useOutlookStore.getState().refresh();
}

let initialized = false;

export function initOutlookAuth(): void {
  if (initialized) return;
  initialized = true;

  void useOutlookStore.getState().refresh();

  if (Capacitor.isNativePlatform()) {
    void CapacitorApp.addListener("appUrlOpen", ({ url }) => {
      if (!url.startsWith(CALLBACK_PREFIX)) return;
      void Browser.close();
      // Success or failure, re-fetch status rather than trusting the URL's
      // own status param — it's just a hint for a possible toast later.
      void useOutlookStore.getState().refresh();
    });
    return;
  }

  const params = new URLSearchParams(window.location.search);
  if (params.has(WEB_CALLBACK_PARAM)) {
    params.delete(WEB_CALLBACK_PARAM);
    const rest = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${rest ? `?${rest}` : ""}`);
    void useOutlookStore.getState().refresh();
  }
}
