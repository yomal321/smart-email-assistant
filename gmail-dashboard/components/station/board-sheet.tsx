"use client";

import * as React from "react";
import { X, ExternalLink, RefreshCcw, ChevronDown, ChevronUp } from "lucide-react";
import type { Message } from "@/lib/data";
import { platformMeta, PLATFORMS, type Platform } from "@/lib/data";
import { formatFullDateTime } from "@/lib/format/relative-time";
import type { Draft } from "@/lib/data";
import {
  REGEN_CAP_PER_HOUR,
  regenerationsUsedThisHour,
  newestForMessage,
  requestDraftRegeneration,
  type RegenerateOverrides,
} from "@/lib/data/draft-regeneration";
import { useDrafts } from "@/components/board/drafts-provider";
import { useActionItems } from "@/components/board/action-items-provider";
import { PriorityAspect } from "./priority-aspect";
import { PlatformBadge } from "./platform-badge";
import { DelayFigure } from "./delay-figure";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CommitView } from "@/components/board/commit-view";

export function BoardSheet({
  message,
  onClose,
  onReassign,
  isVip,
  onToggleVip,
}: {
  message: Message;
  onClose: () => void;
  onReassign: (platform: Platform) => void;
  isVip: boolean;
  onToggleVip: () => void;
}) {
  const [showFullThread, setShowFullThread] = React.useState(false);
  const [committing, setCommitting] = React.useState(false);
  const draftsStore = useDrafts();
  const actionItemsStore = useActionItems();

  // A message can carry several superseded drafts (each regeneration is a
  // new row, never an edit of the old one) — only the newest pending one is
  // "the" suggested reply, matching app/drafts/page.tsx's dedupe.
  const draft = newestForMessage(
    draftsStore.drafts.filter((d) => d.status === "pending"),
    message.id
  );

  const actionItems = actionItemsStore.items.filter((a) => message.ai?.actionItemIds.includes(a.id));
  const thread = message.thread;
  const visibleThread = showFullThread ? thread : thread.slice(-3);

  const closeRef = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    closeRef.current?.focus();
  }, [message.id]);

  if (committing && draft) {
    return (
      <CommitView
        message={message}
        draft={draft}
        onBack={() => setCommitting(false)}
        onSent={() => {
          draftsStore.setStatus(draft.id, "sent");
          setCommitting(false);
          onClose();
        }}
      />
    );
  }

  return (
    <div className="flex h-full flex-col bg-surface-raised" role="dialog" aria-label={message.subject}>
      {/* Pinned header — the close button sits outside flow so the rest can
          wrap freely on narrow widths instead of truncating to nothing. */}
      <div className="relative shrink-0 border-b border-rule py-3.5 pr-12 pl-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {message.ai && <PriorityAspect priority={message.ai.priority} />}
          <span className="max-w-full truncate text-[15px] font-semibold text-ink">{message.sender.name}</span>
          <span className="min-w-0 truncate text-sm text-ink-secondary">{message.subject}</span>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {message.ai && <PlatformBadge platform={message.ai.platform} confidence={message.ai.confidence} />}
            <DelayFigure sla={message.sla} snoozedUntil={message.snoozedUntil} />
          </div>
        </div>
        <button
          ref={closeRef}
          onClick={onClose}
          aria-label="Close (Esc)"
          className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-ink-tertiary hover:bg-surface-sunk hover:text-ink"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="measure space-y-6 pb-8">
          {/* Summary */}
          <section>
            <div className="mb-2"><SectionHead>Summary</SectionHead></div>
            <p className="text-[15px] leading-relaxed text-ink">
              {message.ai?.summary ?? message.parseFailureReason ?? "This message has not been processed yet."}
            </p>
            {message.ai?.tldr && <p className="mt-2 text-sm text-ink-secondary">{message.ai.tldr}</p>}
          </section>

          {/* Why prioritised — the explainability moment, the one coloured field in the sheet */}
          {message.ai && (
            <section
              className="rounded-2xl border p-4"
              style={{ background: "var(--departure-field)", borderColor: "var(--departure)" }}
            >
              <div className="mb-2.5 flex items-center justify-between gap-2">
                <span className="font-narrow text-[11.5px] font-bold uppercase tracking-wider text-departure-field-ink">
                  Why this is on platform {platformMeta(message.ai.platform).number}
                </span>
                <span className="tabular text-xs font-semibold text-departure-field-ink">
                  confidence {message.ai.confidence}
                </span>
              </div>
              <ul className="space-y-1.5 text-sm leading-relaxed text-ink">
                {message.ai.reasons.map((r, i) => (
                  <li key={i} className="flex gap-2">
                    <span aria-hidden="true" className="text-departure">
                      ·
                    </span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3.5 flex items-center justify-between">
                <button onClick={onToggleVip} className="text-xs font-medium text-departure-field-ink underline decoration-1 underline-offset-2 hover:text-departure">
                  {isVip ? "Remove VIP (!)" : "Mark sender VIP (!)"}
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="ghost" className="h-7 rounded-lg text-xs">
                      Wrong platform? Reassign
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {PLATFORMS.map((p) => (
                      <DropdownMenuItem key={p.platform} onClick={() => onReassign(p.platform)}>
                        <span
                          className="mr-2 inline-flex h-4 w-4 items-center justify-center rounded-lg text-[9px] font-bold"
                          style={{ background: `var(--platform-${p.number})`, color: `var(--platform-${p.number}-ink)` }}
                        >
                          {p.number}
                        </span>
                        {p.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </section>
          )}

          {/* Thread timeline */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <SectionHead>Thread · {thread.length} message{thread.length === 1 ? "" : "s"}</SectionHead>
              {thread.length > 3 && (
                <button
                  onClick={() => setShowFullThread((s) => !s)}
                  className="flex items-center gap-1 text-xs text-ink-tertiary hover:text-ink"
                >
                  {showFullThread ? (
                    <>
                      Show recent <ChevronUp size={12} />
                    </>
                  ) : (
                    <>
                      Show all <ChevronDown size={12} />
                    </>
                  )}
                </button>
              )}
            </div>
            <ol className="space-y-2.5 border-l-2 border-rule pl-4">
              {visibleThread.map((t) => (
                <li key={t.id} className="text-sm leading-relaxed">
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold text-ink">{t.authorIsYou ? "You" : t.authorName}</span>
                    <span className="tabular text-[11px] text-ink-tertiary">{formatFullDateTime(t.at)}</span>
                  </div>
                  <p className="text-ink-secondary">{t.gist}</p>
                </li>
              ))}
            </ol>
          </section>

          {/* Extracted entities */}
          {message.ai && (
            <section>
              <div className="mb-2"><SectionHead>Extracted</SectionHead></div>
              <dl className="grid grid-cols-[104px_1fr] gap-x-4 gap-y-2 text-sm">
                {message.ai.entities.dates.length > 0 && (
                  <>
                    <dt className="text-ink-tertiary">Dates</dt>
                    <dd className="tabular text-ink">{message.ai.entities.dates.map((d) => d.text).join(" · ")}</dd>
                  </>
                )}
                {message.ai.entities.amounts.length > 0 && (
                  <>
                    <dt className="text-ink-tertiary">Amounts</dt>
                    <dd className="tabular text-ink">{message.ai.entities.amounts.map((a) => a.text).join(" · ")}</dd>
                  </>
                )}
                {message.ai.entities.people.length > 0 && (
                  <>
                    <dt className="text-ink-tertiary">People</dt>
                    <dd className="text-ink">{message.ai.entities.people.map((p) => p.name).join(" · ")}</dd>
                  </>
                )}
                <dt className="text-ink-tertiary">Links</dt>
                <dd className="tabular text-ink">{message.ai.entities.links.length}</dd>
                <dt className="text-ink-tertiary">Attachments</dt>
                <dd className="tabular text-ink">
                  {message.attachments.length > 0
                    ? message.attachments.map((a) => `${a.name} (${a.sizeKb} KB)`).join(", ")
                    : "0"}
                </dd>
              </dl>
            </section>
          )}

          {/* Action items */}
          {actionItems.length > 0 && (
            <section>
              <div className="mb-2 flex items-center justify-between">
                <SectionHead>Action items · {actionItems.length}</SectionHead>
                <button className="text-xs text-ink-tertiary hover:text-ink">+ add</button>
              </div>
              <ul className="space-y-1">
                {actionItems.map((a) => (
                  <li key={a.id} className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-sm hover:bg-surface-sunk">
                    <Checkbox checked={a.status === "done"} aria-label={a.text} />
                    <span className={a.status === "done" ? "flex-1 text-ink-tertiary line-through" : "flex-1 text-ink"}>
                      {a.text}
                    </span>
                    <span className="text-xs text-ink-tertiary">{a.owner === "you" ? "you" : a.owner.name}</span>
                    <PriorityAspect priority={a.priority} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Suggested reply — keyed by draft.id so its local tone/custom-text/
              error state resets by remounting on a new draft rather than via
              an effect (matches PendingDraftRow's pattern on the Drafts page). */}
          {draft && (
            <SuggestedReply
              key={draft.id}
              draft={draft}
              draftsStore={draftsStore}
              onReviewAndSend={() => setCommitting(true)}
              onSaveAsDraft={onClose}
              onDiscard={() => {
                draftsStore.setStatus(draft.id, "discarded");
                onClose();
              }}
            />
          )}

          {/* Sender context */}
          <section>
            <div className="mb-2"><SectionHead>Sender</SectionHead></div>
            <p className="text-sm text-ink">
              {message.sender.name} · {message.sender.email}
              {isVip && <span className="ml-1 font-semibold text-platform-1">· VIP</span>}
            </p>
            <p className="mt-1 text-sm text-ink-secondary tabular">
              {message.sender.messageCount} messages
              {message.sender.yourAvgReplyHours !== null && <> · your avg reply {message.sender.yourAvgReplyHours}h</>}
              {" "}· last contact {formatFullDateTime(message.sender.lastContactAt)}
            </p>
            {message.sender.openThreadIds.length > 0 && (
              <p className="mt-1 text-sm text-ink-secondary">{message.sender.openThreadIds.length} open threads</p>
            )}
          </section>

          <a
            href={message.gmailUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-ink underline decoration-1 underline-offset-2 hover:text-ink-secondary"
          >
            Open in Gmail <ExternalLink size={13} />
          </a>
        </div>
      </div>
    </div>
  );
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-narrow text-[11.5px] font-bold uppercase tracking-wider text-ink-secondary">{children}</h3>
  );
}

function SuggestedReply({
  draft,
  draftsStore,
  onReviewAndSend,
  onSaveAsDraft,
  onDiscard,
}: {
  draft: Draft;
  draftsStore: ReturnType<typeof useDrafts>;
  onReviewAndSend: () => void;
  onSaveAsDraft: () => void;
  onDiscard: () => void;
}) {
  const [regenerating, setRegenerating] = React.useState(false);
  const [regenerateError, setRegenerateError] = React.useState<string | null>(null);
  const [selectedTone, setSelectedTone] = React.useState<Draft["tone"]>(draft.tone);
  const [customText, setCustomText] = React.useState(draft.customInstruction ?? "");

  const usedThisHour = regenerationsUsedThisHour(draftsStore.drafts, draft.messageId);
  const capReached = usedThisHour >= REGEN_CAP_PER_HOUR;
  const controlsDisabled = regenerating || capReached;

  async function regenerate(overrides?: RegenerateOverrides) {
    setRegenerating(true);
    setRegenerateError(null);
    const result = await requestDraftRegeneration(draft, overrides);
    if (result.draft) {
      draftsStore.addDraft(result.draft);
    } else {
      setRegenerateError(result.error ?? "failed to regenerate draft");
    }
    setRegenerating(false);
  }

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <SectionHead>Suggested reply</SectionHead>
        <div className="flex items-center gap-1">
          <ToneSegmented
            value={selectedTone}
            disabled={controlsDisabled}
            onChange={(t) => {
              setSelectedTone(t);
              if (t === "custom") return; // reveal the box; wait for Generate
              draftsStore.setTone(draft.id, t);
              void regenerate({ tone: t });
            }}
          />
          <button
            className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-tertiary hover:bg-surface-sunk hover:text-ink disabled:opacity-50"
            aria-label="Regenerate"
            title="Regenerate"
            disabled={controlsDisabled || selectedTone === "custom"}
            onClick={() => void regenerate()}
          >
            <RefreshCcw size={14} className={regenerating ? "animate-spin" : undefined} />
          </button>
        </div>
      </div>

      <div className="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[11px] tabular text-ink-tertiary">
          {usedThisHour} of {REGEN_CAP_PER_HOUR} regenerations used this hour
        </span>
        {regenerateError && (
          <span className="text-[11px] font-medium" style={{ color: "var(--signal)" }}>
            {regenerateError}
          </span>
        )}
      </div>

      {selectedTone === "custom" && (
        <div className="mb-2.5 rounded-lg border border-rule-strong bg-surface-sunk p-2.5">
          <Textarea
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            placeholder='Describe the reply you want — e.g. "ask them to push the deadline to Monday, be apologetic"'
            className="min-h-16 w-full rounded-lg text-sm"
            disabled={regenerating}
            aria-label="Custom reply instruction"
          />
          <Button
            size="sm"
            className="mt-1.5 rounded-lg"
            disabled={controlsDisabled || customText.trim().length === 0}
            onClick={() => void regenerate({ tone: "custom", customInstruction: customText.trim() })}
          >
            Generate
          </Button>
        </div>
      )}

      <Textarea
        value={draft.body}
        onChange={(e) => draftsStore.updateBody(draft.id, e.target.value)}
        className="measure min-h-32 rounded-lg text-sm"
        aria-label="Suggested reply, editable"
      />
      <div className="mt-2 flex gap-2">
        <Button size="sm" className="rounded-lg" onClick={onReviewAndSend}>
          Review and send
        </Button>
        <Button size="sm" variant="secondary" className="rounded-lg" onClick={onSaveAsDraft}>
          Save as draft
        </Button>
        <Button size="sm" variant="ghost" className="rounded-lg text-ink-tertiary" onClick={onDiscard}>
          Discard
        </Button>
      </div>
    </section>
  );
}

function ToneSegmented({
  value,
  onChange,
  disabled = false,
}: {
  value: Draft["tone"];
  onChange: (v: Draft["tone"]) => void;
  disabled?: boolean;
}) {
  const options: Draft["tone"][] = ["formal", "friendly", "brief", "firm", "custom"];
  return (
    <div className="flex overflow-hidden rounded-full border border-rule">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          disabled={disabled}
          className={
            "px-2.5 py-1 text-[11px] capitalize transition-colors disabled:opacity-50 " +
            (value === o ? "bg-departure font-semibold text-departure-ink" : "text-ink-tertiary hover:bg-surface-sunk")
          }
        >
          {o}
        </button>
      ))}
    </div>
  );
}
