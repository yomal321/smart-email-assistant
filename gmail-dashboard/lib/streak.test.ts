import { describe, expect, it } from "vitest";
import { currentStreak } from "./streak";

describe("currentStreak", () => {
  it("counts consecutive days ending today", () => {
    expect(currentStreak(["2026-09-20", "2026-09-21", "2026-09-22"], "2026-09-22")).toBe(3);
  });

  it("counts from yesterday when today is not logged yet", () => {
    expect(currentStreak(["2026-09-20", "2026-09-21"], "2026-09-22")).toBe(2);
  });

  it("breaks on a gap", () => {
    expect(currentStreak(["2026-09-18", "2026-09-21", "2026-09-22"], "2026-09-22")).toBe(2);
  });

  it("is zero with no logs", () => {
    expect(currentStreak([], "2026-09-22")).toBe(0);
  });

  it("is zero when only older, non-consecutive days are logged", () => {
    expect(currentStreak(["2026-09-10"], "2026-09-22")).toBe(0);
  });
});
