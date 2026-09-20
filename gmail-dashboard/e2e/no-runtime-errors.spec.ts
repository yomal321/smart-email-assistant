import { test, expect, type Page } from "@playwright/test";

// A runtime-error smoke suite: visit every route once, fail if the page
// throws an uncaught exception, logs a console error, or Next.js's own
// dev-mode error overlay appears. This is the class of bug a type checker
// and a unit test both miss by construction — e.g. the `summary?.capacity
// .bySource` crash fixed in this same session threw only once React
// actually rendered the Today page against a real (or even a still-null)
// fetch result. Not a behaviour suite: it asserts nothing about what a page
// *shows*, only that it doesn't fall over while showing it.

const HUB_ROUTES = ["/", "/tasks", "/plans", "/notes", "/bot"];

const MAIL_ROUTES = [
  "/mail",
  "/mail/inbox",
  "/mail/actions",
  "/mail/analytics",
  "/mail/contacts",
  "/mail/drafts",
  "/mail/follow-ups",
  "/mail/guide",
  "/mail/review",
  "/mail/rules",
  "/mail/settings",
  "/mail/settings/cleanup",
];

interface CapturedErrors {
  pageErrors: string[];
  consoleErrors: string[];
}

// Attaches listeners before navigation — errors thrown during the initial
// render (the exact timing of the bug this suite exists to catch) fire
// before Playwright's `page.goto()` promise even resolves, so wiring these
// up after navigation would miss them.
function captureErrors(page: Page): CapturedErrors {
  const captured: CapturedErrors = { pageErrors: [], consoleErrors: [] };

  page.on("pageerror", (err) => {
    captured.pageErrors.push(err.message);
  });

  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    // Next.js dev logs a benign "Fast Refresh had to perform a full reload"
    // notice through console.error; nothing else in this app's own code
    // uses console.error for a non-error condition, so this is the one
    // pattern worth excluding rather than tuning per-route.
    const text = msg.text();
    if (text.includes("Fast Refresh")) return;
    captured.consoleErrors.push(text);
  });

  return captured;
}

async function assertNoErrors(page: Page, captured: CapturedErrors, route: string) {
  // <nextjs-portal> itself is NOT an error signal — Next 15/16 mounts it on
  // every dev-mode page as the container for the persistent dev-tools
  // indicator button, present whether or not anything is wrong (confirmed
  // by inspecting its shadow DOM on a known-clean page: just the dev-tools
  // button, aria-label "Open Next.js Dev Tools", no dialog). The actual
  // error overlay renders as a `[role="dialog"]` inside that same shadow
  // root — confirmed by injecting a real uncaught exception and observing
  // one appear — which Playwright's CSS engine finds directly since it
  // pierces open shadow roots. This is the second, independent check on the
  // same failure the pageerror/console.error listeners already catch below.
  const overlay = page.locator('nextjs-portal [role="dialog"]');
  await expect(overlay, `${route}: Next.js dev error overlay is showing`).toHaveCount(0);

  expect(captured.pageErrors, `${route}: uncaught exception(s)\n${captured.pageErrors.join("\n")}`).toEqual([]);
  expect(captured.consoleErrors, `${route}: console.error(s)\n${captured.consoleErrors.join("\n")}`).toEqual([]);
}

// The pages under test all fetch client-side after mount (see
// app/(hub)/page.tsx, app/mail/inbox/page.tsx, etc.) rather than in a server
// component, so "the initial HTML arrived" is not the same as "the
// crash-prone render already happened". `networkidle` looks like the right
// wait for that, but Next's own dev-mode client (HMR/dev-tools) keeps a
// long-lived connection open that can prevent the network from ever fully
// idling — confirmed by /mail/actions timing out here while its own
// screenshot showed a fully, correctly rendered page. A bounded wait after
// `load` is less precise but doesn't hang on a connection this suite has no
// business caring about.
async function waitForClientFetch(page: Page) {
  await page.waitForLoadState("load");
  await page.waitForTimeout(1500);
}

for (const route of [...HUB_ROUTES, ...MAIL_ROUTES]) {
  test(`${route} renders without a runtime error`, async ({ page }) => {
    const captured = captureErrors(page);
    await page.goto(route);
    await waitForClientFetch(page);
    await assertNoErrors(page, captured, route);
  });
}

// The one real dynamic route (app/(hub)/plans/[id]/page.tsx) needs a real
// id, which only exists once a plan has been created — reached via the UI
// instead of a hardcoded guess, and skipped rather than failed if the
// account has no plans yet (that is a fixture-data gap, not a runtime bug).
test("a plan detail page renders without a runtime error", async ({ page }) => {
  const captured = captureErrors(page);
  await page.goto("/plans");
  await waitForClientFetch(page);
  await assertNoErrors(page, captured, "/plans");

  const firstPlanLink = page.locator('a[href^="/plans/"]').first();
  if ((await firstPlanLink.count()) === 0) {
    test.skip(true, "No plans exist yet — nothing to click into.");
  }

  await firstPlanLink.click();
  await waitForClientFetch(page);
  await assertNoErrors(page, captured, "/plans/[id]");
});
