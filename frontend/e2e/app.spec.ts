import { expect, test, type Page } from "@playwright/test";

/**
 * The paths a user cannot get past if they are broken: sign in, see your day,
 * add something to it, and have it still be there afterwards.
 *
 * Kept deliberately small. Every one of these crosses the whole stack —
 * React, the API, Postgres — so they are the tests that catch a broken
 * deployment, and they are also the slowest and flakiest kind. Detail belongs
 * in the unit suites.
 */

const EMAIL = process.env.E2E_EMAIL ?? "e2e@example.com";
const PASSWORD = process.env.E2E_PASSWORD ?? "e2e-test-password";

/**
 * These tests sign in and create data, so they must never point at production.
 *
 * That is a live risk rather than a theoretical one: `frontend/.env.production`
 * is committed and sets VITE_API_URL to the deployed Railway backend, and
 * `vite build` runs in production mode and loads it. Without an explicit
 * override the suite silently tests production — which is how it was
 * behaving until this check existed.
 */
test.beforeAll(() => {
  const api = process.env.VITE_API_URL ?? "";
  const local = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(api);
  if (!local) {
    throw new Error(
      `Refusing to run against "${api || "(unset — .env.production wins)"}". ` +
        "Set VITE_API_URL to a local API, e.g. http://127.0.0.1:8000."
    );
  }
});

/** Zustand's persist middleware reads this shape out of localStorage. */
const persisted = (state: Record<string, unknown>) => JSON.stringify({ state, version: 0 });

/**
 * Skip the first-run experience.
 *
 * The onboarding wizard and the spotlight tutorial are gated on persisted
 * localStorage flags that default to false, and App.tsx renders the wizard
 * *instead of* the timeline until onboarding is done — so a fresh browser
 * context never reaches the app itself. Marking them complete is setup, not
 * cheating: these tests are about the core loop, and the first-run flow
 * deserves its own test rather than being crossed on the way to every other
 * one.
 *
 * addInitScript runs before any page script, so the stores read the flag on
 * their very first hydration.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ([onboarding, tutorial]) => {
      localStorage.setItem("disciplined-onboarding", onboarding);
      localStorage.setItem("disciplined-tutorial", tutorial);
    },
    [persisted({ done: true }), persisted({ done: true, step: 0 })]
  );
});

async function login(page: Page) {
  await page.goto("/");
  await page.getByPlaceholder("you@example.com").fill(EMAIL);
  await page.getByPlaceholder("Your password").fill(PASSWORD);

  // Watch the actual call rather than inferring from the UI. When this breaks,
  // "the API returned 401 saying X, having been sent Y" is a diagnosis;
  // "element not found" is the start of one.
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes("/api/auth/login") && r.request().method() === "POST"
    ),
    page.getByRole("button", { name: "Login", exact: true }).click(),
  ]);

  if (!response.ok()) {
    throw new Error(
      `login failed: ${response.status()} ${await response.text()}\n` +
        `  requested: ${response.url()}\n` +
        `  sent: ${response.request().postData()}`
    );
  }
  // The bottom nav only exists inside the authenticated shell, so it is the
  // signal that login completed. Deliberately not the quick-add bar: that
  // lives in the Timeline, which only renders on the schedule page, and a
  // fresh browser lands on home.
  await expect(page.getByRole("button", { name: "Calendar" })).toBeVisible();
}

/** The quick-add bar lives on the schedule page. Get there the way a user does. */
async function goToSchedule(page: Page) {
  await page.getByRole("button", { name: "Calendar" }).click();
  await expect(page.getByPlaceholder(/Add, command or ask/)).toBeVisible();
}

test("a signed-out visitor gets the login page", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByPlaceholder("you@example.com")).toBeVisible();
  await expect(page.getByRole("button", { name: "Login", exact: true })).toBeVisible();
});

test("the wrong password is refused and keeps you on the login page", async ({ page }) => {
  await page.goto("/");
  await page.getByPlaceholder("you@example.com").fill(EMAIL);
  await page.getByPlaceholder("Your password").fill("definitely-not-the-password");
  await page.getByRole("button", { name: "Login", exact: true }).click();

  await expect(page.getByText(/incorrect email or password/i)).toBeVisible();
  await expect(page.getByPlaceholder("you@example.com")).toBeVisible();
});

test("signing in reaches the app", async ({ page }) => {
  await login(page);
});

/**
 * Deliberately created through the API rather than through the quick-add bar.
 *
 * Quick-add is not a local parser with an AI garnish — `handleSubmit` sends
 * everything to the Gemini assistant and treats the local parsers only as an
 * offline fallback, and focusing the input opens the chat sheet. Driving it
 * would make this test depend on a paid third-party service being reachable
 * and on what a language model decided to do that day, which is the opposite
 * of what an end-to-end smoke test is for.
 *
 * What is worth asserting is the integration underneath: something in the
 * database reaches the screen. The quick-add flow itself belongs in a test
 * that stubs the assistant.
 */
test("an event in the database is rendered on the schedule", async ({ page, request }) => {
  const api = process.env.VITE_API_URL;

  const auth = await request.post(`${api}/api/auth/login`, {
    data: { email: EMAIL, password: PASSWORD },
  });
  expect(auth.ok(), `login for setup failed: ${auth.status()}`).toBeTruthy();
  const { token } = await auth.json();

  // Unique per run: the suite shares one account and one database, so a fixed
  // title would match a previous run's leftovers and pass for the wrong reason.
  const title = `e2e event ${Date.now()}`;
  const now = new Date();
  const today = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");

  const created = await request.post(`${api}/api/events`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { title, date: today, startMinutes: 15 * 60, durationMinutes: 30 },
  });
  expect(created.ok(), `creating the event failed: ${created.status()}`).toBeTruthy();

  await login(page);
  await goToSchedule(page);

  // Reaching the screen means the app hydrated from the API rather than from
  // whatever happened to be in local storage.
  await expect(page.getByText(title)).toBeVisible();
});
