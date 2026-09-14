// The fixed "today" the fixture world is built around. Using a fixed anchor
// instead of the real clock keeps overdue/SLA math and the demo narrative
// stable regardless of when the prototype is actually opened.
export const NOW = new Date("2026-09-13T14:22:00");

export function hoursAgo(h: number): string {
  return new Date(NOW.getTime() - h * 3600_000).toISOString();
}

export function hoursFromNow(h: number): string {
  return new Date(NOW.getTime() + h * 3600_000).toISOString();
}

export function daysAgo(d: number): string {
  return hoursAgo(d * 24);
}

export function daysFromNow(d: number): string {
  return hoursFromNow(d * 24);
}
