import { StrictMode, useEffect, useState } from "react";
import { AnimatePresence, MotionConfig } from "framer-motion";
import { createRoot } from "react-dom/client";

// Self-hosted Inter (variable = all weights in one file), bundled into the app
// so there's no network fetch or font-swap reflow on launch. Replaces the
// Google Fonts <link> that used to live in index.html.
import "@fontsource-variable/inter/index.css";
import "./index.css";

import App from "./App.tsx";
import { ConfirmProvider } from "./components/ConfirmDialog.tsx";
import SplashScreen from "./components/SplashScreen.tsx";
import { todayISODate } from "./lib/date.ts";
import { startSync } from "./lib/sync.ts";
import AuthPage from "./pages/AuthPage.tsx";
import { useAuthStore } from "./store/authStore.ts";
import { useTaskStore } from "./store/taskStore.ts";

// Apply persisted theme before first render to avoid flash
try {
  const stored = localStorage.getItem("app-theme");
  if (stored) {
    const { state } = JSON.parse(stored);
    if (state?.theme === "dark") document.documentElement.setAttribute("data-theme", "dark");
  }
} catch (e) {
  console.log(e);
}

// Auth gate: the app (and its backend sync) only mounts once someone is logged
// in; until then show the login/signup page.
function Root() {
  const userId = useAuthStore((s) => s.user?.id);
  const logout = useAuthStore((s) => s.logout);

  // Cold-start splash over whatever renders first (app or login). Initial state
  // true only on page load — backgrounding the app doesn't reload the page, so
  // resuming never re-shows it.
  const [showSplash, setShowSplash] = useState(true);
  useEffect(() => {
    const id = window.setTimeout(() => setShowSplash(false), 930);
    return () => window.clearTimeout(id);
  }, []);

  // Hydrate stores from the backend and start write-through sync (no-op if the
  // backend is unreachable — the app then runs on localStorage alone).
  useEffect(() => {
    if (userId) void startSync();
  }, [userId]);

  // Keep the account's stored timezone matching the device's — so someone
  // who travels doesn't have to do anything for it to catch up. Checked on
  // every launch and every foreground (backgrounding a WKWebView doesn't
  // reload the page, so a tab/app switch is the only signal a real trip
  // gets); syncTimezone itself no-ops when nothing's actually changed.
  useEffect(() => {
    if (!userId) return;
    void useAuthStore.getState().syncTimezone();
    const onVisible = () => {
      if (document.visibilityState === "visible") void useAuthStore.getState().syncTimezone();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [userId]);

  // The calendar should always come back to today after a backgrounding —
  // selectedDate is persisted (see taskStore), so without this someone who
  // navigated to another day, backgrounded the app, and reopened it (even the
  // next day) would land right back where they left off instead of on today.
  // Same visibilitychange signal as syncTimezone above, for the same reason:
  // backgrounding a WKWebView doesn't reload the page. Skipped when already on
  // today so a quick tab-switch doesn't replay the day's entrance animation
  // for no reason (setSelectedDate bumps navNonce).
  useEffect(() => {
    if (!userId) return;
    const backToToday = () => {
      const todayDate = todayISODate();
      if (useTaskStore.getState().selectedDate !== todayDate) {
        useTaskStore.getState().setSelectedDate(todayDate);
      }
    };
    backToToday();
    const onVisible = () => {
      if (document.visibilityState === "visible") backToToday();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [userId]);

  // api.ts announces a rejected token (expired, or the user was deleted) —
  // drop back to the login page instead of silently failing every request.
  useEffect(() => {
    const onUnauthorized = () => logout();
    window.addEventListener("api-unauthorized", onUnauthorized);
    return () => window.removeEventListener("api-unauthorized", onUnauthorized);
  }, [logout]);

  return (
    <>
      {userId ? <App /> : <AuthPage />}
      <AnimatePresence>{showSplash && <SplashScreen />}</AnimatePresence>
    </>
  );
}

// Service worker for reminder notifications (Android requires showing them
// through a registration). Failing to register just means constructor-based
// notifications where supported.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch((e) => {
    console.warn("[sw] registration failed", e);
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <ConfirmProvider>
        <Root />
      </ConfirmProvider>
    </MotionConfig>
  </StrictMode>
);
