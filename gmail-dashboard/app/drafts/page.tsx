"use client";

import * as React from "react";
import { FileEdit, RefreshCcw } from "lucide-react";
import type { Draft } from "@/lib/data";
import { useMessage } from "@/lib/data/use-message";
import {
  REGEN_CAP_PER_HOUR,
  regenerationsUsedThisHour,
  newestPerMessage,
  requestDraftRegeneration,
  type RegenerateOverrides,
} from "@/lib/data/draft-regeneration";
import { useDrafts } from "@/components/board/drafts-provider";
import { EmptyState } from "@/components/board/empty-state";
import { CommitView } from "@/components/board/commit-view";
import { SourceQuote } from "@/components/board/source-quote";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatFullDateTime } from "@/lib/format/relative-time";

const TONES: Draft["tone"][] = ["formal", "friendly", "brief", "firm", "custom"];
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
  disabled = false,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
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
            disabled={disabled}
            aria-pressed={value === o}
            className={
              "rounded-full px-2.5 py-1 text-[11px] font-medium capitalize transition-colors disabled:opacity-50 " +
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

function PendingDraftRow({
  draft,
  store,
  regenerating,
  usedThisHour,
  error,
  onRegenerate,
  onCommit,
}: {
  draft: Draft;
  store: ReturnType<typeof useDrafts>;
  regenerating: boolean;
  usedThisHour: number;
  error: string | null;
  onRegenerate: (overrides?: RegenerateOverrides) => void;
  onCommit: () => void;
}) {
  const { message, loading } = useMessage(draft.messageId);
  // A regeneration supersedes this draft, so unsaved edits to its body would
  // stop being visible. Hold the request until the user confirms that.
  const [pendingRegen, setPendingRegen] = React.useState<RegenerateOverrides | undefined>(undefined);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  // Selecting "Custom" only reveals the instruction box — it does not
  // persist or regenerate until Generate is clicked, so `selectedTone` can
  // differ from the draft's actually-persisted `draft.tone` while the box
  // is open. Resets naturally on regeneration: a new draft has a new id, so
  // this component remounts rather than re-rendering in place.
  const [selectedTone, setSelectedTone] = React.useState<Draft["tone"]>(draft.tone);
  const [customText, setCustomText] = React.useState(draft.customInstruction ?? "");

  const capReached = usedThisHour >= REGEN_CAP_PER_HOUR;
  const controlsDisabled = regenerating || capReached;
  const hasEdits = (draft.editDistance ?? 0) > 0;

  function requestRegenerate(overrides?: RegenerateOverrides) {
    if (hasEdits) {
      setPendingRegen(overrides);
      setConfirmOpen(true);
      return;
    }
    onRegenerate(overrides);
  }

  // Loading and not-found collapse to the same "render nothing" result — a
  // draft whose message never resolves just doesn't show up, matching the
  // old `if (!message) return null` fixture-miss behavior.
  if (loading || !message) return null;

  return (
    <div className="border-b border-rule p-4">
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
          <SourceQuote
            message={message}
            className="rounded-xl border-l-3 border-rule-strong bg-surface-sunk px-3.5 py-2.5 text-sm leading-relaxed text-ink-secondary"
          />
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
                value={selectedTone}
                disabled={controlsDisabled}
                onChange={(t) => {
                  setSelectedTone(t);
                  if (t === "custom") return; // reveal the box; wait for Generate
                  store.setTone(draft.id, t);
                  requestRegenerate({ tone: t });
                }}
              />
              <span className="mb-1.5 h-5 w-px shrink-0 bg-rule" aria-hidden="true" />
              <Segmented
                label="Length"
                options={LENGTHS}
                value={draft.length}
                disabled={controlsDisabled}
                onChange={(l) => {
                  store.setLength(draft.id, l);
                  requestRegenerate({ length: l });
                }}
              />
              <span className="mb-1.5 h-5 w-px shrink-0 bg-rule" aria-hidden="true" />
              <button
                className="mb-0.5 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium text-ink-tertiary transition-colors hover:bg-surface-sunk hover:text-ink disabled:opacity-50"
                disabled={controlsDisabled || selectedTone === "custom"}
                onClick={() => requestRegenerate()}
              >
                <RefreshCcw size={12} className={regenerating ? "animate-spin" : undefined} />
                {regenerating ? "Regenerating…" : "Regenerate"}
              </button>
            </div>
          </div>

          {selectedTone === "custom" && (
            <div className="mb-2.5 rounded-xl border border-rule-strong bg-surface-sunk p-2.5">
              <Textarea
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                placeholder='Describe the reply you want — e.g. "ask them to push the deadline to Monday, be apologetic"'
                className="min-h-20 w-full rounded-lg text-sm"
                disabled={controlsDisabled}
                aria-label="Custom reply instruction"
              />
              <div className="mt-1.5 flex items-center gap-2">
                <Button
                  size="sm"
                  className="rounded-lg"
                  disabled={controlsDisabled || customText.trim().length === 0}
                  onClick={() =>
                    requestRegenerate({ tone: "custom", customInstruction: customText.trim() })
                  }
                >
                  Generate
                </Button>
                {customText.trim().length === 0 && (
                  <span className="text-[11px] text-ink-tertiary">Describe the reply, then Generate.</span>
                )}
              </div>
            </div>
          )}

          <div className="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-[11px] tabular text-ink-tertiary">
              {usedThisHour} of {REGEN_CAP_PER_HOUR} regenerations used this hour
            </span>
            {capReached && (
              <span className="text-[11px] text-ink-tertiary">
                Limit reached — it frees up an hour after the earliest one.
              </span>
            )}
            {error && (
              <span className="text-[11px] font-medium" style={{ color: "var(--signal)" }}>
                {error}
              </span>
            )}
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
            <Button size="sm" className="rounded-xl" onClick={onCommit}>
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

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md rounded-lg">
          <DialogHeader>
            <DialogTitle>Replace your edited draft?</DialogTitle>
            <DialogDescription>
              You&rsquo;ve edited this reply. Regenerating writes a new draft and this version stops showing —
              it stays in the database, but you won&rsquo;t see it here.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" className="rounded-lg" onClick={() => setConfirmOpen(false)}>
              Keep my edit
            </Button>
            <Button
              size="sm"
              className="rounded-lg"
              onClick={() => {
                setConfirmOpen(false);
                onRegenerate(pendingRegen);
              }}
            >
              Regenerate anyway
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function HistoryRow({ draft }: { draft: Draft }) {
  const { message } = useMessage(draft.messageId);
  const hours = draft.approvedAt
    ? Math.round((new Date(draft.approvedAt).getTime() - new Date(draft.generatedAt).getTime()) / 3_600_000)
    : null;
  return (
    <tr className="rule-b">
      <td className="px-3 py-1.5 tabular text-ink-secondary">{formatFullDateTime(draft.generatedAt)}</td>
      <td className="px-3 py-1.5 text-ink">{message?.subject ?? "—"}</td>
      <td className="px-3 py-1.5 tabular text-ink-secondary">{draft.editDistance ?? 0} words</td>
      <td className="px-3 py-1.5 tabular text-ink-secondary">{hours !== null ? `${hours}h` : "—"}</td>
    </tr>
  );
}

export default function DraftsPage() {
  const store = useDrafts();
  const [committingId, setCommittingId] = React.useState<string | null>(null);
  const [regeneratingId, setRegeneratingId] = React.useState<string | null>(null);
  const [errorByMessageId, setErrorByMessageId] = React.useState<Record<string, string>>({});

  // Regeneration inserts a new row rather than updating the old one, so a
  // message accumulates drafts. Only the newest per message is shown — the
  // superseded ones stay in the database, just not on screen.
  const pending = newestPerMessage(store.drafts.filter((d) => d.status === "pending"));
  const history = store.drafts.filter((d) => d.status === "sent" || d.status === "approved");

  const committing = store.drafts.find((d) => d.id === committingId);
  // Called unconditionally (Rules of Hooks) — messageId is null until a
  // draft is actually being committed, in which case the hook is a no-op.
  const { message: committingMessage } = useMessage(committing?.messageId ?? null);
  if (committing && committingMessage) {
    return (
      <CommitView
        message={committingMessage}
        draft={committing}
        onBack={() => setCommittingId(null)}
        onSent={() => {
          store.setStatus(committing.id, "sent");
          setCommittingId(null);
        }}
      />
    );
  }

  // `overrides` carries the tone/length/instruction the user just picked:
  // the store update that persists tone/length is async, so reading
  // draft.tone here would send the previous value.
  async function regenerate(draft: Draft, overrides?: RegenerateOverrides) {
    setRegeneratingId(draft.id);
    setErrorByMessageId((prev) => {
      if (!(draft.messageId in prev)) return prev;
      const next = { ...prev };
      delete next[draft.messageId];
      return next;
    });

    const result = await requestDraftRegeneration(draft, overrides);
    if (result.draft) {
      store.addDraft(result.draft);
    } else {
      console.error("[drafts/page] failed to regenerate draft", result.error);
      setErrorByMessageId((prev) => ({
        ...prev,
        [draft.messageId]: result.error ?? "failed to regenerate draft",
      }));
    }
    setRegeneratingId(null);
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
          {pending.map((draft) => (
            <PendingDraftRow
              key={draft.id}
              draft={draft}
              store={store}
              regenerating={regeneratingId === draft.id}
              usedThisHour={regenerationsUsedThisHour(store.drafts, draft.messageId)}
              error={errorByMessageId[draft.messageId] ?? null}
              onRegenerate={(overrides) => regenerate(draft, overrides)}
              onCommit={() => setCommittingId(draft.id)}
            />
          ))}
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
              {history.map((d) => (
                <HistoryRow key={d.id} draft={d} />
              ))}
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
