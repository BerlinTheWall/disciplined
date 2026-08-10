import { App as CapacitorApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";

import { api } from "./api";
import { useGoogleCalendarStore } from "@/store/googleCalendarStore";
import { useToastStore } from "@/store/toastStore";

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
      // Trust the URL's own status param for the toast — see
      // lib/outlookAuth.ts's identical block for the full rationale.
      const search = new URL(url).searchParams;
      showConnectToast(search.get("status"), search.get("reason"));
      void useGoogleCalendarStore.getState().refresh();
    });
    return;
  }

  const params = new URLSearchParams(window.location.search);
  if (params.has(WEB_CALLBACK_PARAM)) {
    // The backend puts "success"/"error" directly as this param's own value
    // for a web-initiated connect (routers/google_calendar.py::_redirect_target).
    // reason is a short, non-sensitive failure code (e.g. "userinfo_403"),
    // set only on error — see that same function's _error_reason.
    const status = params.get(WEB_CALLBACK_PARAM);
    const reason = params.get("reason");
    params.delete(WEB_CALLBACK_PARAM);
    params.delete("reason");
    const rest = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${rest ? `?${rest}` : ""}`);
    showConnectToast(status, reason);
    void useGoogleCalendarStore.getState().refresh();
  }
}

function showConnectToast(status: string | null, reason: string | null): void {
  if (status === "success") {
    useToastStore.getState().show("Google Calendar connected");
  } else if (status === "error") {
    const suffix = reason ? ` (${reason})` : "";
    useToastStore.getState().show(`Couldn't connect Google Calendar${suffix} — try again`, "error");
  }
}
