export function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 3600_000).toISOString();
}

export function hoursFromNow(h: number): string {
  return new Date(Date.now() + h * 3600_000).toISOString();
}

export function daysAgo(d: number): string {
  return hoursAgo(d * 24);
}

export function daysFromNow(d: number): string {
  return hoursFromNow(d * 24);
}
