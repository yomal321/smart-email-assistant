import { describe, expect, it } from "vitest";
import { byPriority, effortFactor, score, urgency, weightFactor } from "./priority";

const NOW = new Date("2026-09-20T12:00:00.000Z");

function iso(hoursFromNow: number): string {
  return new Date(NOW.getTime() + hoursFromNow * 60 * 60 * 1000).toISOString();
}

describe("urgency", () => {
  it("scores an overdue item at 100", () => {
    expect(urgency(iso(-1), NOW)).toBe(100);
  });
  it("scores under 24h at 80", () => {
    expect(urgency(iso(23), NOW)).toBe(80);
  });
  it("scores under 72h at 50", () => {
    expect(urgency(iso(48), NOW)).toBe(50);
  });
  it("scores under 7d at 25", () => {
    expect(urgency(iso(24 * 5), NOW)).toBe(25);
  });
  it("scores under 14d at 10", () => {
    expect(urgency(iso(24 * 10), NOW)).toBe(10);
  });
  it("scores beyond 14d at 3", () => {
    expect(urgency(iso(24 * 30), NOW)).toBe(3);
  });
  it("scores no due date at 3, same as far-future", () => {
    expect(urgency(null, NOW)).toBe(3);
  });
});

describe("weightFactor", () => {
  it("is 0.8 at the minimum weight", () => {
    expect(weightFactor(1)).toBeCloseTo(0.8);
  });
  it("is 1.6 at the maximum weight", () => {
    expect(weightFactor(5)).toBeCloseTo(1.6);
  });
  it("clamps out-of-range input rather than inverting the ranking", () => {
    expect(weightFactor(9)).toBe(weightFactor(5));
    expect(weightFactor(0)).toBe(weightFactor(1));
  });
});

describe("effortFactor", () => {
  it("is 1 for a zero-effort item", () => {
    expect(effortFactor(0)).toBe(1);
  });
  it("caps the boost at 8h of effort", () => {
    expect(effortFactor(480)).toBe(effortFactor(2000));
  });
  it("never reduces the score for negative input", () => {
    expect(effortFactor(-50)).toBe(1);
  });
});

describe("score", () => {
  it("ranks a weightier item due at the same time above a lighter one", () => {
    const exam = { dueAt: iso(20), weight: 5, effortMinutes: 120 };
    const standup = { dueAt: iso(20), weight: 1, effortMinutes: 15 };
    expect(score(exam, NOW)).toBeGreaterThan(score(standup, NOW));
  });

  it("still lets a much more urgent, lighter item outrank a distant heavy one", () => {
    const dueTonight = { dueAt: iso(2), weight: 2, effortMinutes: 20 };
    const finalExamNextMonth = { dueAt: iso(24 * 30), weight: 5, effortMinutes: 180 };
    expect(score(dueTonight, NOW)).toBeGreaterThan(score(finalExamNextMonth, NOW));
  });
});

describe("byPriority", () => {
  it("orders highest score first", () => {
    // Distant, light, no-urgency item.
    const a = { id: "a", dueAt: iso(24 * 20), weight: 1, effortMinutes: 10 };
    // Overdue but light.
    const b = { id: "b", dueAt: iso(-2), weight: 3, effortMinutes: 30 };
    // Due soon, heavy, and large — the urgency*weight*effort combination
    // outscores the merely-overdue-but-light item.
    const c = { id: "c", dueAt: iso(20), weight: 5, effortMinutes: 200 };
    expect(byPriority([a, b, c], NOW).map((x) => x.id)).toEqual(["c", "b", "a"]);
  });

  it("breaks a tie by the earlier due date", () => {
    // Both land in the same < 24h urgency band with identical weight and
    // effort, so their scores are exactly equal — only the tie-break can
    // order them, and it must put the sooner one first.
    const later = { id: "later", dueAt: iso(20), weight: 3, effortMinutes: 30 };
    const sooner = { id: "sooner", dueAt: iso(10), weight: 3, effortMinutes: 30 };
    expect(score(later, NOW)).toBe(score(sooner, NOW));
    expect(byPriority([later, sooner], NOW).map((x) => x.id)).toEqual(["sooner", "later"]);
  });

  it("sorts a no-due-date item after anything with a real deadline", () => {
    const someday = { id: "someday", dueAt: null, weight: 3, effortMinutes: 30 };
    const dueSoon = { id: "dueSoon", dueAt: iso(5), weight: 1, effortMinutes: 5 };
    expect(byPriority([someday, dueSoon], NOW).map((x) => x.id)).toEqual(["dueSoon", "someday"]);
  });

  it("does not mutate the input array", () => {
    const items = [
      { id: "a", dueAt: iso(24 * 20), weight: 1, effortMinutes: 10 },
      { id: "b", dueAt: iso(-2), weight: 3, effortMinutes: 30 },
    ];
    const original = [...items];
    byPriority(items, NOW);
    expect(items).toEqual(original);
  });
});
