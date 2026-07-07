import { StrictMode } from "react";
import { MotionConfig } from "framer-motion";
import { createRoot } from "react-dom/client";

import "./index.css";

import App from "./App.tsx";
import { ConfirmProvider } from "./components/ConfirmDialog.tsx";
import { startSync } from "./lib/sync.ts";

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

// Hydrate stores from the backend and start write-through sync (no-op if the
// backend is unreachable — the app then runs on localStorage alone).
void startSync();

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
        <App />
      </ConfirmProvider>
    </MotionConfig>
  </StrictMode>
);
