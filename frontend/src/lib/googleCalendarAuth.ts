import { App as CapacitorApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";

import { api } from "./api";
import { useGoogleCalendarStore } from "@/store/googleCalendarStore";

// Connects disciplined directly to a Google account via OAuth — mirrors
// lib/outlookAuth.ts exactly; see that module's docstring for the full flow
// rationale (backend-mediated exchange, custom-scheme deep link back into
// the app). Only the callback path differs, so the two connections' status
// stay independent.
export const googleCalendarSupported = Capacitor.isNativePlatform();

const CALLBACK_PREFIX = "com.hooman.disciplined://google-calendar-callback";

export async function connectGoogleCalendar(): Promise<void> {
  if (!googleCalendarSupported) return;
  const { authorizeUrl } = await api.googleCalendar.connect();
  await Browser.open({ url: authorizeUrl });
}

export async function disconnectGoogleCalendar(): Promise<void> {
  await api.googleCalendar.disconnect();
  await useGoogleCalendarStore.getState().refresh();
}

let initialized = false;

export function initGoogleCalendarAuth(): void {
  if (initialized || !googleCalendarSupported) return;
  initialized = true;

  void useGoogleCalendarStore.getState().refresh();

  void CapacitorApp.addListener("appUrlOpen", ({ url }) => {
    if (!url.startsWith(CALLBACK_PREFIX)) return;
    void Browser.close();
    void useGoogleCalendarStore.getState().refresh();
  });
}
