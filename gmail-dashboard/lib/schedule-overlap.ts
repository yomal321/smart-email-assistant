// Which of today's scheduled items collide in time — a work meeting at
// 14:00 against a lecture at 14:30 is a different failure mode than the
// hub's workload-collision alert (CollisionAlert: minutes-over-capacity
// across a multi-day window). This is two things claiming the same clock
// time on one day, and the fortnight-load math never looks inside a day
// closely enough to catch it.
//
// Pure and dependency-free on purpose, same convention as priority.ts and
// day-key.ts — testable in isolation, no Date-tz assumptions beyond what
// the caller's ISO strings already carry.

export interface TimedItem {
  id: string;
  startsAt: string; // ISO
  durationMinutes: number;
}

// Every id that overlaps at least one other item. O(n log n) sort + a sweep
// that breaks as soon as the next item starts after the current one ends —
// fine at any n a single day's schedule could realistically reach.
export function findOverlappingIds(items: TimedItem[]): Set<string> {
  const sorted = [...items].sort((a, b) => (a.startsAt < b.startsAt ? -1 : 1));
  const overlapping = new Set<string>();

  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    const aEnd = new Date(a.startsAt).getTime() + a.durationMinutes * 60_000;

    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j];
      const bStart = new Date(b.startsAt).getTime();
      if (bStart >= aEnd) break; // sorted by start — nothing later overlaps a either
      overlapping.add(a.id);
      overlapping.add(b.id);
    }
  }

  return overlapping;
}
