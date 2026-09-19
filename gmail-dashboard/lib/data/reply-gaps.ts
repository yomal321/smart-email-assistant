// Shared thread-pairing walk: for each thread, whenever an inbound message
// (`is_from_user: false`) is immediately followed by an outbound one
// (`is_from_user: true`), that gap is one "reply time" sample. Extracted
// from contact-mapping.ts's `computeAvgReplyHours` (Phase 5) so
// GET /api/analytics/response-times can bucket the same samples
// account-wide instead of reimplementing the pairing logic a second time.
import "server-only";

export interface ReplyPairRow {
  thread_id: string | null;
  is_from_user: boolean;
  received_at: string | null;
}

export function computeReplyGapsHours(rows: ReplyPairRow[]): number[] {
  const byThread = new Map<string, { is_from_user: boolean; received_at: string }[]>();
  for (const row of rows) {
    if (row.thread_id === null || row.received_at === null) continue;
    const list = byThread.get(row.thread_id) ?? [];
    list.push({ is_from_user: row.is_from_user, received_at: row.received_at });
    byThread.set(row.thread_id, list);
  }

  const gapHours: number[] = [];
  for (const list of byThread.values()) {
    list.sort((a, b) => new Date(a.received_at).getTime() - new Date(b.received_at).getTime());

    for (let i = 0; i < list.length - 1; i++) {
      const current = list[i];
      const next = list[i + 1];
      if (!current.is_from_user && next.is_from_user) {
        const gapMs = new Date(next.received_at).getTime() - new Date(current.received_at).getTime();
        gapHours.push(gapMs / 3_600_000);
      }
    }
  }

  return gapHours;
}
