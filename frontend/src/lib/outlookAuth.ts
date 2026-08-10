import { App as CapacitorApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";

import { api } from "./api";
import { useOutlookStore } from "@/store/outlookStore";
import { useToastStore } from "@/store/toastStore";

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
      // Always re-fetch status so the store's connected/email fields are
      // fresh, but the toast itself trusts the URL's own status param — it's
      // set by the backend only once the connection actually succeeded (or
      // definitively failed), which is a more reliable signal in the moment
      // than whatever /status happens to return right now.
      const status = new URL(url).searchParams.get("status");
      showConnectToast(status);
      void useOutlookStore.getState().refresh();
    });
    return;
  }

  const params = new URLSearchParams(window.location.search);
  if (params.has(WEB_CALLBACK_PARAM)) {
    // The backend puts "success"/"error" directly as this param's own value
    // for a web-initiated connect (routers/outlook.py::_redirect_target) —
    // unlike the native deep link, which uses a separate ?status= key.
    const status = params.get(WEB_CALLBACK_PARAM);
    params.delete(WEB_CALLBACK_PARAM);
    const rest = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${rest ? `?${rest}` : ""}`);
    showConnectToast(status);
    void useOutlookStore.getState().refresh();
  }
}

function showConnectToast(status: string | null): void {
  if (status === "success") {
    useToastStore.getState().show("Outlook connected");
  } else if (status === "error") {
    useToastStore.getState().show("Couldn't connect Outlook — try again", "error");
  }
}
