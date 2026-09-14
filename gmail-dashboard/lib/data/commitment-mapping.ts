// commitments row -> Commitment mapper (spec FR10, design.md "Key Decisions"
// item 3). One resource, one mapper — mirrors draft-mapping.ts's convention.
import "server-only";
import type { Commitment } from "@/lib/data/types";

// The subset of a `commitments` row (migration 0007) this mapper needs.
export interface CommitmentRow {
  id: string;
  email_id: string;
  direction: Commitment["direction"];
  text: string;
  trigger_sentence: string;
  counterparty_id: string | null;
  due_date: string | null;
  status: Commitment["status"];
  confidence: number;
  created_at: string;
}

export function mapCommitmentRowToCommitment(row: CommitmentRow): Commitment {
  return {
    id: row.id,
    direction: row.direction,
    text: row.text,
    triggerSentence: row.trigger_sentence,
    sourceMessageId: row.email_id,
    // A commitment can have no resolved counterparty yet (spec Edge Cases);
    // `Commitment.counterpartyId` is a plain `string`, so fall back to ""
    // rather than throw — same convention as message-mapping.ts's
    // buildContact fallback.
    counterpartyId: row.counterparty_id ?? "",
    dueDate: row.due_date,
    status: row.status,
    confidence: row.confidence,
    // Against the real clock (Date.now()), not the fixture layer's frozen
    // NOW — same convention message-mapping.ts's buildSla uses for its own
    // elapsed-time computation.
    daysElapsed: Math.floor((Date.now() - new Date(row.created_at).getTime()) / 86_400_000),
  };
}
