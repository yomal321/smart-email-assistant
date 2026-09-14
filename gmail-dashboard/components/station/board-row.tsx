"use client";

import * as React from "react";
import { Star, Paperclip, CheckSquare, Archive, Clock, ExternalLink, Undo2 } from "lucide-react";
import type { Message } from "@/lib/data";
import { cn } from "@/lib/utils";
import { formatRowTime } from "@/lib/format/relative-time";
import { PriorityAspect } from "./priority-aspect";
import { PlatformBadge } from "./platform-badge";
import { TonePill } from "./tone-pill";
import { DelayFigure } from "./delay-figure";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Column headings for the desktop row layout below — widths must match BoardRow exactly. */
export function BoardRowHeader({ bulkMode }: { bulkMode: boolean }) {
  const head = "font-narrow text-[10.5px] font-bold uppercase tracking-wider text-ink-tertiary";
  return (
    <div className="hidden min-h-8 items-center gap-3 border-b border-rule bg-surface-sunk/60 px-4 py-2 min-[900px]:flex">
      {bulkMode && <span className="h-4 w-4 shrink-0" aria-hidden="true" />}
      <span className="w-4 shrink-0" aria-hidden="true" />
      <span className={cn(head, "w-43 shrink-0")}>From</span>
      <span className={cn(head, "flex-1")}>Summary</span>
      <span className={cn(head, "w-16 shrink-0")}>Tone</span>
      <span className={cn(head, "w-19 shrink-0")}>Platform</span>
      <span className={cn(head, "w-14 shrink-0")}>Items</span>
      <span className={cn(head, "w-14 shrink-0 text-right")}>Received</span>
      <span className={cn(head, "w-16 shrink-0 text-right")}>Delay</span>
    </div>
  );
}

export interface BoardRowProps {
  message: Message;
  isSelected: boolean;
  isFocused: boolean;
  isVip: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
  onArchive: () => void;
  onMarkDone: () => void;
  onSnooze: () => void;
  onToggleStar: () => void;
  onRestore?: () => void;
  bulkMode: boolean;
  /** Overview's priority queue shows the AI's "why this was prioritised" note
      inside the row, under the summary it explains. Off everywhere else so the
      triage board stays one scannable line per message. */
  showReason?: boolean;
}

export const BoardRow = React.forwardRef<HTMLDivElement, BoardRowProps>(function BoardRow(
  { message, isSelected, isFocused, isVip, onToggleSelect, onOpen, onArchive, onMarkDone, onSnooze, onToggleStar, onRestore, bulkMode, showReason },
  ref
) {
  const handled = message.status === "archived" || message.status === "done" || message.status === "snoozed";
  const actionCount = message.ai?.actionItemIds.length ?? 0;
  const reasonText = showReason ? (message.ai?.reasons ?? []).join(" · ") : "";

  const rowLabel = [
    message.sender.name,
    message.ai ? message.ai.platform : "unclassified",
    message.ai?.priority,
    message.sla.state === "overdue" ? "overdue" : null,
    message.subject,
    reasonText ? `prioritised because ${reasonText}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div
      ref={ref}
      role="row"
      aria-selected={isSelected}
      aria-label={rowLabel}
      tabIndex={isFocused ? 0 : -1}
      data-focused={isFocused || undefined}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("[data-row-control]")) return;
        onOpen();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
      }}
      className={cn(
        "board-row group relative flex min-h-14 cursor-pointer items-center gap-3 rule-b px-4 py-2 transition-colors outline-none",
        isSelected ? "bg-departure-field" : isFocused ? "bg-surface-raised" : "hover:bg-surface-raised",
        handled && "opacity-55"
      )}
    >
      {bulkMode && (
        <Checkbox
          data-row-control
          checked={isSelected}
          onCheckedChange={onToggleSelect}
          className="shrink-0 rounded-lg"
          aria-label={`Select ${message.sender.name}`}
        />
      )}

      {/* Desktop / tablet: one ruled row. Below 900px the row reflows to two
          lines instead — the delay column and summary survive, meta moves
          into the sheet. design-spec.md §3.2 */}
      <div className="hidden min-w-0 flex-1 items-center gap-3 min-[900px]:flex">
        <div className="flex w-4 shrink-0 justify-center" aria-hidden="true">
          {handled ? (
            <CheckSquare size={14} style={{ color: "var(--cleared)" }} />
          ) : message.ai ? (
            <PriorityAspect priority={message.ai.priority} />
          ) : (
            <span className="text-ink-tertiary text-xs">?</span>
          )}
        </div>

        <div className="flex w-43 shrink-0 items-center gap-1.5 overflow-hidden">
          {message.isUnread && !handled && (
            <span className="h-2 w-2 shrink-0 rounded-full bg-departure" aria-hidden="true" />
          )}
          <span className={cn("truncate text-sm", message.isUnread && !handled ? "font-semibold text-ink" : "text-ink")}>
            {message.sender.name}
          </span>
          {isVip && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Star size={12} className="shrink-0 fill-current text-platform-1" aria-label="VIP sender" />
              </TooltipTrigger>
              <TooltipContent side="top">VIP sender</TooltipContent>
            </Tooltip>
          )}
        </div>

        <div className="min-w-0 flex-1 overflow-hidden">
          <p className={cn("truncate text-sm", message.isUnread && !handled ? "text-ink" : "text-ink-secondary")}>
            {message.ai ? message.ai.summary : <span className="italic text-ink-tertiary">{message.parseFailureReason ?? "Not yet processed"}</span>}
          </p>
          {reasonText && <ReasonLine text={reasonText} />}
          {handled && message.handledAt && (
            <p className="truncate font-narrow text-[10px] uppercase tracking-wide text-ink-tertiary">
              {message.handledAction === "archived" && "Archived"}
              {message.handledAction === "done" && "Done"}
              {message.handledAction === "snoozed" && "Snoozed"} {formatRowTime(message.handledAt)}
              {onRestore && (
                <button
                  data-row-control
                  onClick={onRestore}
                  className="ml-2 inline-flex items-center gap-0.5 underline decoration-1 underline-offset-2 hover:text-ink"
                >
                  <Undo2 size={10} /> Undo
                </button>
              )}
            </p>
          )}
        </div>

        {message.ai && <TonePill tone={message.ai.tone} evidence={message.ai.toneEvidence} />}

        {message.ai ? (
          <PlatformBadge platform={message.ai.platform} confidence={message.ai.confidence} />
        ) : (
          <span className="w-19 shrink-0" />
        )}

        <div className="flex w-14 shrink-0 items-center gap-2 text-xs text-ink-tertiary tabular">
          {actionCount > 0 && (
            <span className="flex items-center gap-0.5" title={`${actionCount} action item${actionCount === 1 ? "" : "s"}`}>
              <CheckSquare size={11} />
              {actionCount}
            </span>
          )}
          {message.attachments.length > 0 && (
            <span className="flex items-center gap-0.5" title={`${message.attachments.length} attachment(s)`}>
              <Paperclip size={11} />
              {message.attachments.length}
            </span>
          )}
        </div>

        <span className="w-14 shrink-0 text-right text-xs text-ink-tertiary tabular">
          {formatRowTime(message.receivedAt)}
        </span>

        <DelayFigure sla={message.sla} snoozedUntil={message.snoozedUntil} />
      </div>

      {/* Mobile: two lines. Line 1 — aspect, sender, badge, delay. Line 2 — summary. */}
      <div className="flex min-w-0 flex-1 flex-col gap-1 py-0.5 min-[900px]:hidden">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex w-4 shrink-0 justify-center" aria-hidden="true">
            {handled ? (
              <CheckSquare size={13} style={{ color: "var(--cleared)" }} />
            ) : message.ai ? (
              <PriorityAspect priority={message.ai.priority} />
            ) : (
              <span className="text-ink-tertiary text-xs">?</span>
            )}
          </div>
          {message.isUnread && !handled && (
            <span className="h-2 w-2 shrink-0 rounded-full bg-departure" aria-hidden="true" />
          )}
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-sm",
              message.isUnread && !handled ? "font-semibold text-ink" : "text-ink"
            )}
          >
            {message.sender.name}
          </span>
          {isVip && <Star size={12} className="shrink-0 fill-current text-platform-1" aria-label="VIP sender" />}
          {message.ai ? (
            <PlatformBadge platform={message.ai.platform} confidence={message.ai.confidence} className="shrink-0" />
          ) : (
            <span className="w-19 shrink-0" />
          )}
          <DelayFigure sla={message.sla} snoozedUntil={message.snoozedUntil} />
        </div>
        <p className={cn("truncate pl-6 text-sm", message.isUnread && !handled ? "text-ink" : "text-ink-secondary")}>
          {message.ai ? message.ai.summary : <span className="italic text-ink-tertiary">{message.parseFailureReason ?? "Not yet processed"}</span>}
        </p>
        {reasonText && <ReasonLine text={reasonText} className="pl-6" />}
        {handled && message.handledAt && (
          <p className="truncate pl-6 font-narrow text-[10px] uppercase tracking-wide text-ink-tertiary">
            {message.handledAction === "archived" && "Archived"}
            {message.handledAction === "done" && "Done"}
            {message.handledAction === "snoozed" && "Snoozed"} {formatRowTime(message.handledAt)}
            {onRestore && (
              <button
                data-row-control
                onClick={onRestore}
                className="ml-2 inline-flex items-center gap-0.5 underline decoration-1 underline-offset-2 hover:text-ink"
              >
                <Undo2 size={10} /> Undo
              </button>
            )}
          </p>
        )}
      </div>

      {!handled && (
        <div
          data-row-control
          className="absolute right-2 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 rounded-full border border-rule bg-surface-raised px-1 py-0.5 shadow-popover min-[900px]:group-hover:flex min-[900px]:group-focus-within:flex min-[900px]:group-data-focused:flex"
        >
          <RowActionButton label="Archive (E)" onClick={onArchive} icon={Archive} />
          <RowActionButton label="Snooze (S)" onClick={onSnooze} icon={Clock} />
          <RowActionButton label="Mark done (D)" onClick={onMarkDone} icon={CheckSquare} />
          <RowActionButton
            label={message.isStarred ? "Unstar (!)" : "Star (!)"}
            onClick={onToggleStar}
            icon={Star}
            active={message.isStarred}
          />
          <RowActionButton
            label="Open in Gmail"
            icon={ExternalLink}
            as="a"
            href={message.gmailUrl}
          />
        </div>
      )}
    </div>
  );
});

/**
 * The AI's "why this was prioritised" note.
 *
 * Rendered *inside* the row rather than after it: the row owns its own bottom
 * rule, so a child can never be cut across by that rule the way a sibling was.
 * It also sits in the summary column, so it reads as a continuation of the line
 * it explains instead of a caption for the next row.
 *
 * Truncated by design — uniform row height is what makes the board scannable,
 * and the full reasoning is the Board Sheet's job.
 */
function ReasonLine({ text, className }: { text: string; className?: string }) {
  return (
    <p
      className={cn(
        // ink-secondary, not ink-tertiary: tertiary is 3.58:1 on white and fails
        // the AA floor. Hierarchy comes from size and the label, never from
        // dropping contrast below the threshold.
        "mt-0.5 flex items-baseline gap-1.5 text-[11px] leading-4 text-ink-secondary",
        className
      )}
      title={text}
    >
      <span className="font-narrow shrink-0 font-bold uppercase tracking-[0.08em]">Why</span>
      <span className="min-w-0 truncate">{text}</span>
    </p>
  );
}

function RowActionButton({
  label,
  onClick,
  icon: Icon,
  active,
  as = "button",
  href,
}: {
  label: string;
  onClick?: () => void;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  active?: boolean;
  as?: "button" | "a";
  href?: string;
}) {
  const cls = cn(
    "flex h-7 w-7 items-center justify-center rounded-full text-ink-tertiary transition-colors hover:bg-surface-sunk hover:text-ink",
    active && "bg-departure-field text-departure hover:bg-departure-field hover:text-departure"
  );
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {as === "a" ? (
          <a href={href} target="_blank" rel="noreferrer" className={cls} aria-label={label} onClick={(e) => e.stopPropagation()}>
            <Icon size={14} />
          </a>
        ) : (
          <button
            type="button"
            className={cls}
            aria-label={label}
            onClick={(e) => {
              e.stopPropagation();
              onClick?.();
            }}
          >
            <Icon size={14} />
          </button>
        )}
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}
