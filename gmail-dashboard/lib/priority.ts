// The hub's ordering. With work and two degree programmes feeding one list,
// bucketing by "overdue / due today" stops being enough — two things due
// tomorrow are not equally worth starting, and a 6-hour assignment has to
// surface days before a 15-minute admin task with the same deadline.
//
// Pure and dependency-free on purpose: no `server-only`, no Supabase types,
// so it runs on both sides of the wire and is testable in isolation
// (priority.test.ts). Tune the constants against real use — they are a
// starting point, not a result.

export interface Scoreable {
  dueAt: string | null;
  weight: number; // 1–5, user's judgement of how much this matters
  effortMinutes: number;
}

const HOUR_MS = 60 * 60 * 1000;

// Hours until due -> raw urgency. Deliberately a step function rather than a
// curve: the gaps between bands are what actually separate "today" from
// "this week" in the rendered list, and a smooth curve blurs them.
export function urgency(dueAt: string | null, now: Date): number {
  if (dueAt === null) return 3;

  const hours = (new Date(dueAt).getTime() - now.getTime()) / HOUR_MS;

  if (hours < 0) return 100; // overdue
  if (hours < 24) return 80;
  if (hours < 72) return 50;
  if (hours < 24 * 7) return 25;
  if (hours < 24 * 14) return 10;
  return 3;
}

// 1 -> 0.8, 3 -> 1.2, 5 -> 1.6. A final exam outranks a standup due at the
// same hour, but weight never dominates urgency outright.
export function weightFactor(weight: number): number {
  return 0.6 + clamp(weight, 1, 5) * 0.2;
}

// A mild boost so big items surface early enough to actually be started,
// capped at 8h of effort (beyond that the estimate is guesswork anyway).
export function effortFactor(effortMinutes: number): number {
  return 1 + Math.min(Math.max(effortMinutes, 0), 480) / 960;
}

export function score(item: Scoreable, now: Date): number {
  return urgency(item.dueAt, now) * weightFactor(item.weight) * effortFactor(item.effortMinutes);
}

// Highest score first. Ties break on the earlier due date, then on the
// larger item, so the order is stable rather than dependent on row order.
export function byPriority<T extends Scoreable>(items: T[], now: Date): T[] {
  return [...items].sort((a, b) => {
    const diff = score(b, now) - score(a, now);
    if (diff !== 0) return diff;
    if (a.dueAt !== b.dueAt) {
      if (a.dueAt === null) return 1;
      if (b.dueAt === null) return -1;
      return a.dueAt < b.dueAt ? -1 : 1;
    }
    return b.effortMinutes - a.effortMinutes;
  });
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}
