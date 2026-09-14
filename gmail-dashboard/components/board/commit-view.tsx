"use client";

import * as React from "react";
import { ArrowLeft } from "lucide-react";
import type { Message, Draft } from "@/lib/data";
import { Button } from "@/components/ui/button";

/**
 * The commit station — a draft is staged against the original before it
 * commits, but reversible. design-spec.md §6.5
 */
export function CommitView({
  message,
  draft,
  onBack,
  onSent,
}: {
  message: Message;
  draft: Draft;
  onBack: () => void;
  onSent: () => void;
}) {
  const [sent, setSent] = React.useState(false);

  if (sent) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-surface-raised px-6 text-center">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ background: "var(--cleared-field)" }}>
          <span style={{ color: "var(--cleared)" }} className="text-lg font-bold">✓</span>
        </span>
        <p className="text-sm font-semibold text-ink">Sent to {message.sender.name}</p>
        <p className="text-xs text-ink-tertiary">Recorded in the activity log with the edit diff attached.</p>
        <Button size="sm" variant="secondary" className="rounded-lg" onClick={onSent}>
          Back to board
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-surface-raised">
      <div className="flex shrink-0 items-center gap-3 rule-b px-5 py-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-ink-tertiary hover:text-ink"
        >
          <ArrowLeft size={15} /> Back to editing
        </button>
        <span className="ml-auto font-narrow text-[11px] font-bold uppercase tracking-wider text-ink-tertiary">
          Review before sending
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <h4 className="mb-2 font-narrow text-[11px] font-bold uppercase tracking-wider text-ink-tertiary">
              Original
            </h4>
            <div className="measure whitespace-pre-wrap rounded-lg border p-3 text-sm text-ink-secondary" style={{ borderColor: "var(--rule)" }}>
              {message.thread[message.thread.length - 1]?.gist}
            </div>
          </div>
          <div>
            <h4 className="mb-2 font-narrow text-[11px] font-bold uppercase tracking-wider text-ink-tertiary">
              Your reply {draft.editDistance ? `(${draft.editDistance} words edited from the draft)` : "(unedited)"}
            </h4>
            <div className="measure whitespace-pre-wrap rounded-lg border p-3 text-sm text-ink" style={{ borderColor: "var(--rule)" }}>
              {draft.body}
            </div>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 gap-2 rule-t px-5 py-3">
        <Button size="sm" className="rounded-lg" onClick={() => setSent(true)}>
          Send
        </Button>
        <Button size="sm" variant="secondary" className="rounded-lg" onClick={onBack}>
          Back to editing
        </Button>
      </div>
    </div>
  );
}
