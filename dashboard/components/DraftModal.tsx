"use client";

import { useState } from "react";
import type { Draft, Email } from "@/lib/types";
import { StatusBadge } from "@/components/StatusBadge";

export function DraftModal({
  email,
  draft,
  isGenerating,
  error,
  onGenerate,
  onChangeStatus,
  onClose,
}: {
  email: Email;
  draft: Draft | null;
  isGenerating: boolean;
  error: string | null;
  onGenerate: () => void;
  onChangeStatus: (status: Draft["status"]) => void;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(draft.draft_body);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard permission denied — no destructive fallback needed for a prototype
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Draft review"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border p-5">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Draft reply</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Re: {email.subject}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="cursor-pointer rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            <p className="whitespace-pre-wrap">{email.body}</p>
          </div>

          <div className="mt-4">
            {!draft && !isGenerating && !error && (
              <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-8 text-center">
                <p className="text-sm text-muted-foreground">No draft yet for this email.</p>
                <button
                  type="button"
                  onClick={onGenerate}
                  className="cursor-pointer rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Generate draft
                </button>
              </div>
            )}

            {isGenerating && (
              <div className="flex flex-col items-center gap-3 rounded-lg border border-border py-8 text-center">
                <span
                  className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-primary"
                  aria-hidden
                />
                <p className="text-sm text-muted-foreground">Generating a draft…</p>
              </div>
            )}

            {error && !isGenerating && (
              <div className="flex flex-col items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 py-8 text-center">
                <p className="text-sm text-destructive">{error}</p>
                <button
                  type="button"
                  onClick={onGenerate}
                  className="cursor-pointer rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                >
                  Try again
                </button>
              </div>
            )}

            {draft && !isGenerating && (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Generated reply</span>
                  <StatusBadge status={draft.status} />
                </div>
                <div className="rounded-lg border border-border bg-card p-3">
                  <p className="whitespace-pre-wrap text-sm text-foreground">{draft.draft_body}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {draft && !isGenerating && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border p-4">
            <button
              type="button"
              onClick={handleCopy}
              className="cursor-pointer rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
            >
              {copied ? "Copied" : "Copy to clipboard"}
            </button>
            <div className="flex gap-2">
              {draft.status !== "discarded" && (
                <button
                  type="button"
                  onClick={() => onChangeStatus("discarded")}
                  className="cursor-pointer rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
                >
                  Discard
                </button>
              )}
              {draft.status !== "sent" && (
                <button
                  type="button"
                  onClick={() => onChangeStatus("sent")}
                  className="cursor-pointer rounded-md bg-success px-3 py-1.5 text-xs font-medium text-success-foreground transition-colors hover:bg-success/90"
                >
                  Mark sent (copied elsewhere)
                </button>
              )}
              {draft.status !== "pending" && (
                <button
                  type="button"
                  onClick={() => onChangeStatus("pending")}
                  className="cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                >
                  Reopen
                </button>
              )}
              <button
                type="button"
                onClick={onGenerate}
                className="cursor-pointer rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
              >
                Regenerate
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
