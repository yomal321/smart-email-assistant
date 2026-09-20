import { defineConfig } from "vitest/config";

// Excludes e2e/ — vitest's default glob (**/*.{test,spec}.ts) also matches
// Playwright's own *.spec.ts files, and Playwright's test() has a different
// signature than vitest's, so vitest tries to run it and fails confusingly.
// The two suites are separate on purpose (unit vs. real-browser/real-DB) and
// have their own runners: `npm run test` vs. `npm run test:e2e`.
export default defineConfig({
  test: {
    exclude: ["node_modules/**", "e2e/**"],
  },
});
