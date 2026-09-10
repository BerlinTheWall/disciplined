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

test("a task added by voice-style text survives a reload", async ({ page }) => {
  await login(page);
  await goToSchedule(page);

  // A unique title per run: these tests share one seeded account and one
  // database, so a fixed title would collide with earlier runs' leftovers.
  const title = `e2e task ${Date.now()}`;

  const quickAdd = page.getByPlaceholder(/Add, command or ask/);
  await quickAdd.click();
  // An explicit date and time so the parser has everything it needs and does
  // not stop to ask — see parseQuickAdd's `timeGiven` / `dateGiven`.
  await quickAdd.fill(`${title} today 3pm`);
  await quickAdd.press("Enter");

  await expect(page.getByText(title)).toBeVisible();

  // The real assertion. Local state would show the task either way; only a
  // successful round trip to the API and back survives a reload.
  await page.reload();
  await expect(page.getByText(title)).toBeVisible();
});
