// drafts row -> Draft mapper + edit-distance helper (spec FR10/FR12,
// design.md "API Changes" / Key Decision 5, 6). One resource, one mapper —
// mirrors message-mapping.ts's convention.
import "server-only";
import type { Draft } from "@/lib/data/types";

// The subset of a `drafts` row (post-migration-0008 shape) this mapper needs.
export interface DraftRow {
  id: string;
  email_id: string;
  draft_body: string;
  generated_body: string | null;
  tone: Draft["tone"] | null;
  length: Draft["length"] | null;
  status: Draft["status"];
  created_at: string;
  approved_at: string | null;
  edit_distance: number | null;
}

export function mapDraftRowToDraft(row: DraftRow): Draft {
  return {
    id: row.id,
    messageId: row.email_id,
    body: row.draft_body,
    // Pre-0008 rows have generated_body=null — no original to diff against
    // (spec Notes, Backfill); fall back to draft_body itself rather than an
    // empty string, so the commit-view diff at least shows no changes
    // instead of a spurious full-length diff.
    generatedBody: row.generated_body ?? row.draft_body,
    tone: row.tone ?? "friendly",
    length: row.length ?? "standard",
    status: row.status,
    generatedAt: row.created_at,
    approvedAt: row.approved_at,
    editDistance: row.edit_distance,
  };
}

// Word-level distance (spec FR12 Notes: units are words, matching
// app/drafts/page.tsx's "{d.editDistance ?? 0} words" label) — count of
// differing positions plus the absolute length difference, not a
// character-level Levenshtein (overkill for a rough prompt-tuning signal).
// `original === null` (a pre-0008 row with no generated_body) is treated as
// "" rather than thrown on (spec Edge Cases).
export function computeEditDistance(current: string, original: string | null): number {
  const a = (original ?? "").trim().split(/\s+/).filter(Boolean);
  const b = current.trim().split(/\s+/).filter(Boolean);

  const minLen = Math.min(a.length, b.length);
  let differing = 0;
  for (let i = 0; i < minLen; i++) {
    if (a[i] !== b[i]) differing++;
  }
  return differing + Math.abs(a.length - b.length);
}
