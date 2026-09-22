import { describe, expect, it } from "vitest";
import { findOverlappingIds } from "./schedule-overlap";

const DAY = "2026-09-22T";

function item(id: string, hour: number, minute: number, durationMinutes: number) {
  return {
    id,
    startsAt: `${DAY}${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00.000Z`,
    durationMinutes,
  };
}

describe("findOverlappingIds", () => {
  it("flags nothing when the schedule is empty or has one item", () => {
    expect(findOverlappingIds([])).toEqual(new Set());
    expect(findOverlappingIds([item("a", 9, 0, 30)])).toEqual(new Set());
  });

  it("flags nothing for a clean back-to-back schedule (end == next start)", () => {
    const items = [item("a", 9, 0, 60), item("b", 10, 0, 30)];
    expect(findOverlappingIds(items)).toEqual(new Set());
  });

  it("flags both items in a direct overlap", () => {
    const items = [item("a", 14, 0, 60), item("b", 14, 30, 30)];
    expect(findOverlappingIds(items)).toEqual(new Set(["a", "b"]));
  });

  it("flags all three in a three-way overlap", () => {
    const items = [item("a", 9, 0, 120), item("b", 9, 30, 30), item("c", 10, 0, 30)];
    expect(findOverlappingIds(items)).toEqual(new Set(["a", "b", "c"]));
  });

  it("is order-independent — unsorted input gives the same result", () => {
    const items = [item("b", 14, 30, 30), item("a", 14, 0, 60)];
    expect(findOverlappingIds(items)).toEqual(new Set(["a", "b"]));
  });

  it("only flags the pair that actually overlaps, not an unrelated third item", () => {
    const items = [item("a", 9, 0, 30), item("b", 14, 0, 60), item("c", 14, 30, 30)];
    expect(findOverlappingIds(items)).toEqual(new Set(["b", "c"]));
  });
});
