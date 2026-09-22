// Consecutive-day streak from a set of logged day-keys (lib/day-key.ts
// format, YYYY-MM-DD). Pure and dependency-free, same convention as
// lib/priority.ts — no Supabase types, testable in isolation.
//
// Counts backward from today; if today isn't logged yet, starts from
// yesterday instead, so a habit logged every day this week doesn't read
// streak=0 at 9am before today's box is ticked.
//
// Cadence-agnostic on purpose (Phase 7 Wave 3, ponytail: no separate
// weekly-streak algorithm for a field this thin — add one if a real user
// ever asks what "streak" means for a weekly habit).

const DAY_MS = 24 * 60 * 60 * 1000;

// Noon-UTC anchor so shifting a day never crosses into the wrong calendar
// day in a negative-offset zone — same trick lib/day-key.ts's
// formatDayLabel uses.
function shiftKey(key: string, deltaDays: number): string {
  const shifted = new Date(new Date(`${key}T12:00:00Z`).getTime() + deltaDays * DAY_MS);
  return shifted.toISOString().slice(0, 10);
}

export function currentStreak(loggedDays: string[], todayKey: string): number {
  const logged = new Set(loggedDays);
  let cursor = logged.has(todayKey) ? todayKey : shiftKey(todayKey, -1);
  let streak = 0;
  while (logged.has(cursor)) {
    streak += 1;
    cursor = shiftKey(cursor, -1);
  }
  return streak;
}
