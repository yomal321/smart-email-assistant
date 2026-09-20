import { defineConfig, devices } from "@playwright/test";

// `next dev` (started by webServer below) loads .env.local into its own
// process automatically; this test *process* needs the same values itself
// to fill in the login form, so it loads them independently here. Node's
// built-in loader (20.6+), no dotenv dependency needed. CI supplies these
// as real environment variables instead, so a missing file there is fine.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local (e.g. CI) — real env vars are expected to be set already.
}

// A runtime-error smoke suite, not a behaviour/E2E suite — see
// e2e/README.md. Boots the real `next dev` server against whatever
// .env.local points at (real Supabase in this repo), so it exercises the
// actual data-fetching code paths a unit test can't reach.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    // localhost, not 127.0.0.1 — Next 16 dev treats them as different
    // origins and blocks cross-origin requests to its own HMR/RSC assets by
    // default (allowedDevOrigins), which silently breaks client hydration:
    // the login form falls back to a native GET submit with no JS attached,
    // which is what produced the /login?password=... redirect below before
    // this fix.
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  // Next refuses to start a second `next dev` in the same project directory
  // regardless of port, so this always prefers an already-running server
  // (e.g. one left open from active development) over spawning its own —
  // reuseExistingServer: true unconditionally, not just outside CI.
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000/login",
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    // Logs in once via the real /login form and saves the resulting session
    // cookie, so every smoke test starts authenticated without re-running
    // the login flow (and its rate-limit counter) per page.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/session.json" },
      dependencies: ["setup"],
    },
  ],
});
