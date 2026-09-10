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
  await page.getByRole("button", { name: "Login", exact: true }).click();
  // The quick-add bar only exists inside the authenticated shell, so its
  // presence is the signal that login actually completed.
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
