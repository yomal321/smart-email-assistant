import type { Draft, Email, EmailCategory, Task } from "@/lib/types";

// Pure calculation functions over Email[]/Task[]/Draft[] arrays. No component
// code, no fixture-specific assumptions — these operate on whatever arrays
// they're given so a chart and its accessible-table fallback (and any future
// real data source) can share one source of truth for the numbers.

export const ALL_CATEGORIES: EmailCategory[] = [
  "needs_reply",
  "fyi",
  "waiting_on_someone_else",
  "promotional",
  "low_priority",
];

export interface VolumeDataPoint {
  /** Calendar day the emails were received on, `YYYY-MM-DD` (UTC slice of `received_at`). */
  date: string;
  count: number;
}

export interface CategoryBreakdownEntry {
  category: EmailCategory;
  count: number;
  /** 0-100. 0 (not NaN) when there are no triaged emails at all. */
  percentage: number;
}

/** Total emails that have been triaged (assigned a category). */
export function countTriagedEmails(emails: Email[]): number {
  return emails.filter((email) => email.category !== null).length;
}

/** Count of tasks still open (not done, not dismissed). */
export function countOpenTasks(tasks: Task[]): number {
  return tasks.filter((task) => task.status === "open").length;
}

/**
 * Draft acceptance rate: sent / (sent + discarded), among drafts that have
 * been decided one way or another (`pending` drafts are excluded from both
 * halves of the ratio since they haven't been accepted or rejected yet).
 *
 * Returns `null` when there are no decided drafts to compute a rate from
 * (zero drafts, or all drafts still pending) — callers should render a
 * placeholder ("—" / "No drafts yet") rather than treating `null` as 0%.
 */
export function computeDraftAcceptanceRate(drafts: Draft[]): number | null {
  const decided = drafts.filter((draft) => draft.status === "sent" || draft.status === "discarded");
  if (decided.length === 0) return null;
  const sent = decided.filter((draft) => draft.status === "sent").length;
  return sent / decided.length;
}

/**
 * Average time from an email's `received_at` to its draft's `created_at`,
 * in milliseconds, across all drafts that have a matching source email and
 * a non-negative delta.
 *
 * Returns `null` when there are no drafts (or none with a resolvable,
 * non-negative delta) to average — callers should render a placeholder
 * rather than dividing by zero.
 */
export function computeAvgTimeToDraftMs(emails: Email[], drafts: Draft[]): number | null {
  if (drafts.length === 0) return null;

  const emailsById = new Map(emails.map((email) => [email.id, email]));
  const deltas: number[] = [];

  for (const draft of drafts) {
    const email = emailsById.get(draft.email_id);
    if (!email) continue;
    const delta = new Date(draft.created_at).getTime() - new Date(email.received_at).getTime();
    if (Number.isFinite(delta) && delta >= 0) {
      deltas.push(delta);
    }
  }

  if (deltas.length === 0) return null;
  return deltas.reduce((sum, delta) => sum + delta, 0) / deltas.length;
}

/**
 * Email volume grouped by calendar day, ascending by date. Days with no
 * emails simply don't appear (callers/charts render a sparse series as-is —
 * there's no fixed calendar range to backfill against).
 */
export function computeVolumeOverTime(emails: Email[]): VolumeDataPoint[] {
  const counts = new Map<string, number>();

  for (const email of emails) {
    const date = email.received_at.slice(0, 10);
    counts.set(date, (counts.get(date) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Count and share of triaged emails per category, sorted descending by
 * count. Every category in `ALL_CATEGORIES` is always present (even at
 * count 0) so a chart/table has a stable set of rows. `percentage` is 0
 * (never NaN) when there are zero triaged emails overall.
 */
export function computeCategoryBreakdown(emails: Email[]): CategoryBreakdownEntry[] {
  const counts = new Map<EmailCategory, number>(ALL_CATEGORIES.map((category) => [category, 0]));
  let total = 0;

  for (const email of emails) {
    if (email.category === null) continue;
    counts.set(email.category, (counts.get(email.category) ?? 0) + 1);
    total += 1;
  }

  return ALL_CATEGORIES.map((category) => {
    const count = counts.get(category) ?? 0;
    return {
      category,
      count,
      percentage: total === 0 ? 0 : (count / total) * 100,
    };
  }).sort((a, b) => b.count - a.count);
}

/**
 * Percentage change from `previous` to `current`, for KPI trend indicators.
 * Returns `null` when the previous period was 0 and current is nonzero
 * (an undefined/infinite percentage change) — callers should render a
 * neutral/"new" trend rather than `Infinity` or `NaN`. Returns 0 when both
 * periods are 0 (no change, flat at zero).
 */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) {
    return current === 0 ? 0 : null;
  }
  return ((current - previous) / previous) * 100;
}
