import { App as CapacitorApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";

import { api } from "./api";
import { useGoogleCalendarStore } from "@/store/googleCalendarStore";

// Connects disciplined directly to a Google account via OAuth — mirrors
// lib/outlookAuth.ts exactly; see that module's docstring for the full flow
// rationale (backend-mediated exchange, then a deep link back into the
// native app or a full-page redirect back to this tab on web). Only the
// callback path differs, so the two connections' status stay independent.
export const googleCalendarSupported = true;

const CALLBACK_PREFIX = "com.hooman.disciplined://google-calendar-callback";
const WEB_CALLBACK_PARAM = "googleCalendarConnected";

export async function connectGoogleCalendar(): Promise<void> {
  const native = Capacitor.isNativePlatform();
  const { authorizeUrl } = await api.googleCalendar.connect(
    native ? undefined : window.location.origin
  );
  if (native) {
    await Browser.open({ url: authorizeUrl });
  } else {
    window.location.href = authorizeUrl;
  }
}

export async function disconnectGoogleCalendar(): Promise<void> {
  await api.googleCalendar.disconnect();
  await useGoogleCalendarStore.getState().refresh();
}

let initialized = false;

export function initGoogleCalendarAuth(): void {
  if (initialized) return;
  initialized = true;

  void useGoogleCalendarStore.getState().refresh();

  if (Capacitor.isNativePlatform()) {
    void CapacitorApp.addListener("appUrlOpen", ({ url }) => {
      if (!url.startsWith(CALLBACK_PREFIX)) return;
      void Browser.close();
      void useGoogleCalendarStore.getState().refresh();
    });
    return;
  }

  const params = new URLSearchParams(window.location.search);
  if (params.has(WEB_CALLBACK_PARAM)) {
    params.delete(WEB_CALLBACK_PARAM);
    const rest = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${rest ? `?${rest}` : ""}`);
    void useGoogleCalendarStore.getState().refresh();
  }
}
