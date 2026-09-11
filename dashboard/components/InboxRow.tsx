import type { Email, Task, Draft } from "@/lib/types";
import { CategoryBadge } from "@/components/CategoryBadge";
import { TaskCard } from "@/components/TaskCard";
import { StatusBadge } from "@/components/StatusBadge";
import { formatRelativeTime, getInitials } from "@/lib/format";

export function InboxRow({
  email,
  task,
  draft,
  expanded,
  selected,
  onToggle,
  onSelectChange,
  onChangeTaskStatus,
  onOpenDraft,
}: {
  email: Email;
  task: Task | undefined;
  draft: Draft | undefined;
  expanded: boolean;
  /** Bulk-select checkbox state. Omit (with `onSelectChange`) to render the row without a checkbox. */
  selected?: boolean;
  onToggle: () => void;
  /** Bulk-select checkbox handler. When absent, no checkbox is rendered. */
  onSelectChange?: (selected: boolean) => void;
  onChangeTaskStatus: (status: Task["status"]) => void;
  onOpenDraft: () => void;
}) {
  const sender = email.participants.find((p) => p.role === "from");

  return (
    <div className="border-b border-border last:border-b-0">
      <div className="flex w-full items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50">
        {onSelectChange && (
          <input
            type="checkbox"
            checked={selected ?? false}
            onChange={(e) => onSelectChange(e.target.checked)}
            aria-label={`Select email: ${email.subject}`}
            className="h-4 w-4 shrink-0 cursor-pointer rounded border-border text-primary focus:ring-2 focus:ring-ring/30 focus:outline-none"
          />
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
        >
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground"
            aria-hidden
          >
            {sender ? getInitials(sender.name) : "?"}
          </span>

          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="truncate text-sm font-medium text-foreground">{sender?.name ?? "Unknown sender"}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{formatRelativeTime(email.received_at)}</span>
            </span>
            <span className="mt-0.5 flex items-center gap-2">
              <span className="truncate text-sm text-foreground">{email.subject}</span>
            </span>
            {email.summary && (
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">{email.summary}</span>
            )}
          </span>

          <span className="flex shrink-0 items-center gap-2">
            {task && <StatusBadge status={task.status} />}
            <CategoryBadge category={email.category} />
          </span>
        </button>
      </div>

      {expanded && (
        <div className="space-y-3 border-t border-border bg-muted/20 px-4 py-4 pl-11">
          <p className="whitespace-pre-wrap text-sm text-foreground">{email.body}</p>

          {task && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Action item</p>
              <TaskCard task={task} onChangeStatus={onChangeTaskStatus} />
            </div>
          )}

          <div className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Draft reply</p>
              <p className="text-sm text-foreground">
                {draft ? `Status: ${draft.status}` : "No draft generated yet"}
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenDraft}
              className="cursor-pointer rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {draft ? "Review draft" : "Generate draft"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
