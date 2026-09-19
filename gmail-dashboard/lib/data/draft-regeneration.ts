// Shared between app/drafts/page.tsx and components/station/board-sheet.tsx
// — both surfaces let the user regenerate a draft with a chosen tone/length/
// custom instruction, and both need to know the same two things: which draft
// is "the" draft for a message once regeneration can produce several, and
// how much of the n8n-enforced regeneration cap is already used.
import type { Draft } from "./types";

// n8n's "Check regeneration cap" (draft-generation.json) rejects a 6th draft
// for the same email within an hour. Mirrored here so the limit is visible
// before it is hit rather than only as a 429 afterwards — it counts drafts
// of every status, so discarding one does not free capacity.
export const REGEN_CAP_PER_HOUR = 5;

export function regenerationsUsedThisHour(drafts: Draft[], messageId: string): number {
  const cutoff = Date.now() - 3_600_000;
  return drafts.filter((d) => d.messageId === messageId && new Date(d.generatedAt).getTime() > cutoff).length;
}

// Regeneration inserts a new `drafts` row rather than updating the old one,
// so a message accumulates drafts over time. Only the newest per message is
// "the" draft — the superseded ones stay in the database, just not surfaced.
export function newestPerMessage(drafts: Draft[]): Draft[] {
  const newest = new Map<string, Draft>();
  for (const d of drafts) {
    const current = newest.get(d.messageId);
    if (!current || new Date(d.generatedAt).getTime() > new Date(current.generatedAt).getTime()) {
      newest.set(d.messageId, d);
    }
  }
  return [...newest.values()].sort(
    (a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime()
  );
}

export function newestForMessage(drafts: Draft[], messageId: string): Draft | undefined {
  return newestPerMessage(drafts.filter((d) => d.messageId === messageId))[0];
}

// Overrides for a single generation request — never persisted directly
// except via the draft that comes back. `customInstruction` only matters
// when tone is "custom"; the API/n8n ignore it otherwise.
export interface RegenerateOverrides {
  tone?: Draft["tone"];
  length?: Draft["length"];
  customInstruction?: string;
}

export interface RegenerateResult {
  draft?: Draft;
  error?: string;
}

// POSTs /api/drafts and returns either the new Draft or a message straight
// from n8n's rejection body (regeneration cap, auth cooldown, LLM failure) —
// fetch resolves on 4xx/5xx, so checking res.ok here is what stands between
// those rejections and a silent no-op.
export async function requestDraftRegeneration(
  draft: Pick<Draft, "messageId" | "tone" | "length">,
  overrides?: RegenerateOverrides
): Promise<RegenerateResult> {
  try {
    const res = await fetch("/api/drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messageId: draft.messageId,
        tone: overrides?.tone ?? draft.tone,
        length: overrides?.length ?? draft.length,
        customInstruction: overrides?.customInstruction,
      }),
    });
    const body = await res.json().catch(() => null);

    if (!res.ok) {
      return {
        error: (body && typeof body.error === "string" && body.error) || `request failed with status ${res.status}`,
      };
    }

    return { draft: body as Draft };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "failed to reach draft generation service" };
  }
}
