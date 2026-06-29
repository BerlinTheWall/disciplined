import { StrictMode } from "react";
import { MotionConfig } from "framer-motion";
import { createRoot } from "react-dom/client";

import "./index.css";

import App from "./App.tsx";
import { ConfirmProvider } from "./components/ConfirmDialog.tsx";

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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <ConfirmProvider>
        <App />
      </ConfirmProvider>
    </MotionConfig>
  </StrictMode>
);
