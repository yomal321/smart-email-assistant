import { describe, expect, it } from "vitest";
import { dayKey, formatDayLabel } from "./day-key";

describe("dayKey", () => {
  it("buckets an evening item to the same Colombo day it occurs on", () => {
    // 18:30 in Colombo (UTC+5:30) is 13:00 UTC the same calendar day.
    expect(dayKey("2026-09-20T13:00:00.000Z", "Asia/Colombo")).toBe("2026-09-20");
  });

  it("rolls a late-UTC evening into the next Colombo day", () => {
    // 20:00 UTC is 01:30 the next day in Colombo — the exact case a bare
    // server-local toDateString() gets wrong on a UTC server.
    expect(dayKey("2026-09-20T20:00:00.000Z", "Asia/Colombo")).toBe("2026-09-21");
  });

  it("agrees with plain UTC bucketing when given the UTC zone", () => {
    expect(dayKey("2026-09-20T23:59:00.000Z", "UTC")).toBe("2026-09-20");
    expect(dayKey("2026-09-21T00:00:00.000Z", "UTC")).toBe("2026-09-21");
  });

  it("produces a lexicographically sortable key across a month boundary", () => {
    const aug = dayKey("2026-08-31T12:00:00.000Z", "UTC");
    const sep = dayKey("2026-09-01T12:00:00.000Z", "UTC");
    expect(aug < sep).toBe(true);
  });
});

describe("formatDayLabel", () => {
  it("renders a short weekday + day + month label", () => {
    // Node's ICU data abbreviates September as "Sep" or "Sept" depending on
    // version — assert the stable parts (weekday, day, no comma) rather than
    // pin an exact month spelling this test doesn't actually care about.
    const label = formatDayLabel("2026-09-21", "UTC");
    expect(label).toMatch(/^Mon 21 Sept?$/);
  });
});
