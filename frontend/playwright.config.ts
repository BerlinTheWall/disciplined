import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;

/**
 * End-to-end tests against the built app talking to a real backend.
 *
 * These need a backend on 127.0.0.1:8000 with a real Postgres behind it, and
 * the account created by `backend/scripts/seed_e2e_user.py`. CI starts both
 * (see the `e2e` job); locally, `docker compose up -d` then run uvicorn.
 *
 * They exercise the web build, which is the same React app the native builds
 * wrap — so they cover the app's own logic, but not the Capacitor plugin
 * paths (notifications, speech, device calendar), which have no browser
 * equivalent and still need a device.
 */
export default defineConfig({
  testDir: "./e2e",
  // A failing e2e test is far more often a race than a real regression, but
  // retrying locally hides flakes from the person best placed to fix them.
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  forbidOnly: !!process.env.CI,

  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    // Keep evidence for the failures you cannot reproduce locally.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      // A phone viewport, because that is the only shape this app ships in.
      name: "mobile-chrome",
      use: { ...devices["Pixel 7"] },
    },
  ],

  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
