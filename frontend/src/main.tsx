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
import { startSync } from "./lib/sync.ts";
import AuthPage from "./pages/AuthPage.tsx";
import { useAuthStore } from "./store/authStore.ts";

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
    const id = window.setTimeout(() => setShowSplash(false), 1400);
    return () => window.clearTimeout(id);
  }, []);

  // Hydrate stores from the backend and start write-through sync (no-op if the
  // backend is unreachable — the app then runs on localStorage alone).
  useEffect(() => {
    if (userId) void startSync();
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
