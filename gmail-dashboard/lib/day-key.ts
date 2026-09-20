// Calendar-day bucketing in the *user's* timezone, not the server's.
//
// Vercel runs UTC; the user is Asia/Colombo (UTC+5:30). A server-local
// `toDateString()` bucket puts everything after 18:30 local onto the previous
// day, so evening lectures and meetings silently vanish from "today" and
// tomorrow's never appear.
//
// Pure and dependency-free on purpose: no `server-only`, no Supabase types, so
// it runs on both sides of the wire and is testable in isolation — same
// reasoning as lib/priority.ts.

export const DEFAULT_TIME_ZONE = "Asia/Colombo";

// YYYY-MM-DD, which sorts lexicographically — callers never have to re-parse
// it back into a Date just to order it. formatToParts rather than format()
// because the assembled parts are stable across ICU versions in a way the
// locale's own short-date pattern is not.
export function dayKey(iso: string, timeZone: string = DEFAULT_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));

  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

// "Mon 22 Sep", for a section heading. Anchored at noon UTC rather than
// midnight so the key cannot slide a day backwards when rendered in a
// negative-offset zone. Built from formatToParts and joined by hand — ICU's
// own en-GB pattern inserts a comma and expands "Sep" to "Sept" depending on
// runtime version, which is exactly the instability formatToParts avoids.
export function formatDayLabel(key: string, timeZone: string = DEFAULT_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).formatToParts(new Date(`${key}T12:00:00Z`));

  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("weekday")} ${part("day")} ${part("month").replace(/\.$/, "")}`;
}
