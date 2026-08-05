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
// opened here in an in-app browser — Microsoft's identity platform requires
// a real browser context, not our WebView. Microsoft redirects to the
// backend's own /api/outlook/callback (so the client secret never touches
// the device), which does the token exchange and then redirects again, this
// time to this app's custom URL scheme — caught below via appUrlOpen.
//
// Requires native (custom-scheme deep links can't be caught by a plain
// browser tab), same posture as lib/deviceCalendar.ts.
export const outlookSupported = Capacitor.isNativePlatform();

const CALLBACK_PREFIX = "com.hooman.disciplined://outlook-callback";

export async function connectOutlook(): Promise<void> {
  if (!outlookSupported) return;
  const { authorizeUrl } = await api.outlook.connect();
  await Browser.open({ url: authorizeUrl });
}

export async function disconnectOutlook(): Promise<void> {
  await api.outlook.disconnect();
  await useOutlookStore.getState().refresh();
}

let initialized = false;

export function initOutlookAuth(): void {
  if (initialized || !outlookSupported) return;
  initialized = true;

  void useOutlookStore.getState().refresh();

  void CapacitorApp.addListener("appUrlOpen", ({ url }) => {
    if (!url.startsWith(CALLBACK_PREFIX)) return;
    void Browser.close();
    // Success or failure, re-fetch status rather than trusting the URL's
    // own status param — it's just a hint for a possible toast later.
    void useOutlookStore.getState().refresh();
  });
}
