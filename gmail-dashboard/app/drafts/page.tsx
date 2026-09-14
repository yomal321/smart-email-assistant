"use client";

import * as React from "react";
import { FileEdit, RefreshCcw } from "lucide-react";
import type { Draft } from "@/lib/data";
import { getMessageById } from "@/lib/data";
import { useDrafts } from "@/components/board/drafts-provider";
import { EmptyState } from "@/components/board/empty-state";
import { CommitView } from "@/components/board/commit-view";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatFullDateTime } from "@/lib/format/relative-time";

const TONES: Draft["tone"][] = ["formal", "friendly", "brief", "firm"];
const LENGTHS: Draft["length"][] = ["brief", "standard", "detailed"];

const SNIPPETS = [
  "Thanks for flagging this — I'll take a look and get back to you shortly.",
  "Apologies for the delay on this.",
  "Let me know if you'd like to jump on a quick call instead.",
  "Attached is the latest version for your review.",
];

/** A labelled segmented control — the label is what tells Tone apart from Length. */
function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-narrow text-[9.5px] font-bold uppercase tracking-wider text-ink-tertiary">{label}</span>
      <div
        className="flex overflow-hidden rounded-full border border-rule-strong bg-surface-sunk p-0.5"
        role="group"
        aria-label={label}
      >
        {options.map((o) => (
          <button
            key={o}
            onClick={() => onChange(o)}
            aria-pressed={value === o}
            className={
              "rounded-full px-2.5 py-1 text-[11px] font-medium capitalize transition-colors " +
              (value === o
                ? "bg-departure font-semibold text-departure-ink shadow-sm"
                : "text-ink-tertiary hover:bg-surface-raised hover:text-ink")
            }
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function DraftsPage() {
  const store = useDrafts();
  const [committingId, setCommittingId] = React.useState<string | null>(null);
  const [regeneratingId, setRegeneratingId] = React.useState<string | null>(null);

  const pending = store.drafts.filter((d) => d.status === "pending");
  const history = store.drafts.filter((d) => d.status === "sent" || d.status === "approved");

  const committing = store.drafts.find((d) => d.id === committingId);
  if (committing) {
    const message = getMessageById(committing.messageId);
    if (message) {
      return (
        <CommitView
          message={message}
          draft={committing}
          onBack={() => setCommittingId(null)}
          onSent={() => {
            store.setStatus(committing.id, "sent");
            setCommittingId(null);
          }}
        />
      );
    }
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="rule-b px-4 py-3">
        <h1 className="text-lg font-semibold text-ink">Drafts</h1>
        <p className="text-sm text-ink-secondary">AI-generated replies awaiting your review.</p>
      </div>

      {pending.length === 0 ? (
        <EmptyState
          icon={FileEdit}
          heading="No drafts waiting."
          body="Drafts appear here when a message is classified Needs Reply and a reply is generated."
          actionLabel="Go to Needs Reply"
          actionHref="/inbox?platform=needs-reply"
        />
      ) : (
        <div className="divide-y" style={{ borderColor: "var(--rule)" }}>
          {pending.map((draft) => {
            const message = getMessageById(draft.messageId);
            if (!message) return null;
            const regenerating = regeneratingId === draft.id;
            return (
              <div key={draft.id} className="border-b border-rule p-4">
                <div className="mb-3 flex items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-sm font-semibold text-ink">{message.sender.name}</span>
                    <span className="ml-2 text-sm text-ink-secondary">{message.subject}</span>
                  </div>
                  <span className="shrink-0 text-xs tabular text-ink-tertiary">{formatFullDateTime(draft.generatedAt)}</span>
                </div>

                <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
                  {/* What they said */}
                  <section>
                    <h4 className="mb-1.5 font-narrow text-[11px] font-bold uppercase tracking-wider text-ink-secondary">
                      Their message
                    </h4>
                    <blockquote className="whitespace-pre-wrap rounded-xl border-l-3 border-rule-strong bg-surface-sunk px-3.5 py-2.5 text-sm leading-relaxed text-ink-secondary">
                      {message.thread[message.thread.length - 1]?.gist}
                    </blockquote>
                  </section>

                  {/* Your reply */}
                  <section>
                    <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                      <h4 className="font-narrow text-[11px] font-bold uppercase tracking-wider text-ink-secondary">
                        Your reply
                      </h4>
                      <div className="flex flex-wrap items-end gap-3">
                        <Segmented
                          label="Tone"
                          options={TONES}
                          value={draft.tone}
                          onChange={(t) => store.setTone(draft.id, t)}
                        />
                        <span className="mb-1.5 h-5 w-px shrink-0 bg-rule" aria-hidden="true" />
                        <Segmented
                          label="Length"
                          options={LENGTHS}
                          value={draft.length}
                          onChange={(l) => store.setLength(draft.id, l)}
                        />
                        <span className="mb-1.5 h-5 w-px shrink-0 bg-rule" aria-hidden="true" />
                        <button
                          className="mb-0.5 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium text-ink-tertiary transition-colors hover:bg-surface-sunk hover:text-ink disabled:opacity-50"
                          disabled={regenerating}
                          onClick={() => {
                            setRegeneratingId(draft.id);
                            setTimeout(() => setRegeneratingId(null), 900);
                          }}
                        >
                          <RefreshCcw size={12} className={regenerating ? "animate-spin" : undefined} />
                          {regenerating ? "Regenerating…" : "Regenerate"}
                        </button>
                      </div>
                    </div>
                    <Textarea
                      value={draft.body}
                      onChange={(e) => store.updateBody(draft.id, e.target.value)}
                      className="min-h-32 w-full rounded-xl text-sm leading-relaxed"
                      aria-label={`Draft reply to ${message.sender.name}`}
                    />

                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      <span className="mr-0.5 text-[11px] font-medium text-ink-tertiary">Insert phrase</span>
                      {SNIPPETS.map((s) => (
                        <button
                          key={s}
                          onClick={() => store.updateBody(draft.id, `${draft.body}\n\n${s}`)}
                          className="rounded-full border border-rule bg-surface px-2.5 py-1 text-[11px] text-ink-secondary transition-colors hover:border-departure hover:bg-departure-field hover:text-departure-field-ink"
                          title={s}
                        >
                          {s.length > 30 ? s.slice(0, 30) + "…" : s}
                        </button>
                      ))}
                    </div>

                    <div className="mt-3.5 flex items-center gap-2">
                      <Button size="sm" className="rounded-xl" onClick={() => setCommittingId(draft.id)}>
                        Approve and review
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="rounded-xl"
                        onClick={() => store.setStatus(draft.id, "discarded")}
                      >
                        Discard
                      </Button>
                    </div>
                  </section>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Approval history — the prompt-tuning signal */}
      <div className="mt-4 px-4 pb-8">
        <h2 className="mb-2 font-narrow text-[11px] font-bold uppercase tracking-wider text-ink-tertiary">
          Approval history
        </h2>
        <p className="mb-2 text-xs text-ink-tertiary">
          What gets edited before sending feeds prompt tuning over time.
        </p>
        <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--rule)" }}>
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b border-rule bg-surface-sunk text-left font-narrow text-[11px] uppercase tracking-wider text-ink-secondary">
                <th className="px-3 py-2 font-bold">Date</th>
                <th className="px-3 py-2 font-bold">Message</th>
                <th className="px-3 py-2 font-bold">Edited</th>
                <th className="px-3 py-2 font-bold">Time to approve</th>
              </tr>
            </thead>
            <tbody>
              {history.map((d) => {
                const message = getMessageById(d.messageId);
                const hours = d.approvedAt
                  ? Math.round((new Date(d.approvedAt).getTime() - new Date(d.generatedAt).getTime()) / 3_600_000)
                  : null;
                return (
                  <tr key={d.id} className="rule-b">
                    <td className="px-3 py-1.5 tabular text-ink-secondary">{formatFullDateTime(d.generatedAt)}</td>
                    <td className="px-3 py-1.5 text-ink">{message?.subject ?? "—"}</td>
                    <td className="px-3 py-1.5 tabular text-ink-secondary">{d.editDistance ?? 0} words</td>
                    <td className="px-3 py-1.5 tabular text-ink-secondary">{hours !== null ? `${hours}h` : "—"}</td>
                  </tr>
                );
              })}
              {history.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-center text-ink-tertiary">
                    No approvals yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
