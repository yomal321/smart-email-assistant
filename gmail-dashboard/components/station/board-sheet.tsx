"use client";

import * as React from "react";
import { X, ExternalLink, RefreshCcw, ChevronDown, ChevronUp } from "lucide-react";
import type { Message } from "@/lib/data";
import { platformMeta, PLATFORMS, type Platform } from "@/lib/data";
import { formatFullDateTime } from "@/lib/format/relative-time";
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
  const [regenerating, setRegenerating] = React.useState(false);
  const draftsStore = useDrafts();
  const actionItemsStore = useActionItems();

  const draft = draftsStore.drafts.find((d) => d.messageId === message.id);
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

          {/* Suggested reply */}
          {draft && (
            <section>
              <div className="mb-2 flex items-center justify-between">
                <SectionHead>Suggested reply</SectionHead>
                <div className="flex items-center gap-1">
                  <ToneSegmented value={draft.tone} onChange={(t) => draftsStore.setTone(draft.id, t)} />
                  <button
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-tertiary hover:bg-surface-sunk hover:text-ink disabled:opacity-50"
                    aria-label="Regenerate"
                    title="Regenerate"
                    disabled={regenerating}
                    onClick={() => {
                      setRegenerating(true);
                      setTimeout(() => setRegenerating(false), 900);
                    }}
                  >
                    <RefreshCcw size={14} className={regenerating ? "animate-spin" : undefined} />
                  </button>
                </div>
              </div>
              <Textarea
                value={draft.body}
                onChange={(e) => draftsStore.updateBody(draft.id, e.target.value)}
                className="measure min-h-32 rounded-lg text-sm"
                aria-label="Suggested reply, editable"
              />
              <div className="mt-2 flex gap-2">
                <Button size="sm" className="rounded-lg" onClick={() => setCommitting(true)}>
                  Review and send
                </Button>
                <Button size="sm" variant="secondary" className="rounded-lg" onClick={onClose}>
                  Save as draft
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="rounded-lg text-ink-tertiary"
                  onClick={() => {
                    draftsStore.setStatus(draft.id, "discarded");
                    onClose();
                  }}
                >
                  Discard
                </Button>
              </div>
            </section>
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

function ToneSegmented({
  value,
  onChange,
}: {
  value: "formal" | "friendly" | "brief" | "firm";
  onChange: (v: "formal" | "friendly" | "brief" | "firm") => void;
}) {
  const options: typeof value[] = ["formal", "friendly", "brief", "firm"];
  return (
    <div className="flex overflow-hidden rounded-full border border-rule">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className={
            "px-2.5 py-1 text-[11px] capitalize transition-colors " +
            (value === o ? "bg-departure font-semibold text-departure-ink" : "text-ink-tertiary hover:bg-surface-sunk")
          }
        >
          {o}
        </button>
      ))}
    </div>
  );
}
