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

// The last day you can start this and still make the deadline, given
// everything else already committed on the days between now and due. Walks
// backward from the due day, spending each day's leftover capacity
// (dailyCapacityMinutes minus what's already committed that day) against
// the item's effort until it's covered.
//
// `days` must be the chronological window this was computed over (today..N
// days out) and `committedMinutesByDay` the total load per day across every
// item, keyed the same way — both produced by the caller (route.ts already
// builds this window for the fortnight chart). Kept as plain string keys
// and a Map rather than importing dayKey/Date-tz logic here, so this file
// stays free of any timezone dependency, same as the rest of it.
//
// Returns null when the due day isn't in `days` at all (no due date,
// already overdue, or beyond the window — ponytail: fixed to the caller's
// window, currently 14 days; widen if items routinely land further out)
// or, degenerate but valid, the effort doesn't fit even starting today —
// callers should read that as "start now," not "no answer."
export function computeStartBy(
  effortMinutes: number,
  dueDay: string,
  days: string[],
  committedMinutesByDay: Map<string, number>,
  dailyCapacityMinutes: number
): string | null {
  const dueIndex = days.indexOf(dueDay);
  if (dueIndex === -1) return null;

  let remaining = effortMinutes;
  for (let i = dueIndex; i >= 0; i--) {
    const day = days[i];
    const committedRaw = committedMinutesByDay.get(day) ?? 0;
    // The due day's own committed total includes this item's own effort
    // (it's anchored there) — exclude it so the item doesn't count as
    // competition against itself.
    const committed = day === dueDay ? Math.max(0, committedRaw - effortMinutes) : committedRaw;
    const available = Math.max(0, dailyCapacityMinutes - committed);
    remaining -= available;
    if (remaining <= 0) return day;
  }
  return days[0];
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}
