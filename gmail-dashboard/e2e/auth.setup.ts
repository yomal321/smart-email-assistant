import { test as setup, expect } from "@playwright/test";

const authFile = "e2e/.auth/session.json";

// Logs in through the real /login form (not a direct cookie mint) so the
// login page itself gets exercised at least once per run, then saves the
// session cookie for every other test to reuse via storageState.
setup("authenticate", async ({ page }) => {
  const password = process.env.DASHBOARD_LOGIN_SECRET;
  if (!password) {
    throw new Error(
      "DASHBOARD_LOGIN_SECRET is not set for the test process. " +
        "playwright.config.ts loads .env.local automatically — confirm it exists, " +
        "or export the var yourself in CI."
    );
  }

  await page.goto("/login");
  // exact: true — a plain substring match also catches the "Show password"
  // toggle button's own aria-label, which contains "password" too.
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  // The hub landing page redirect on success (app/login/page.tsx: router.push("/")).
  await expect(page).toHaveURL("/");
  await page.context().storageState({ path: authFile });
});
