import type { TaskStatus, DraftStatus } from "@/lib/types";

type Status = TaskStatus | DraftStatus;

const STATUS_META: Record<Status, { label: string; bg: string; fg: string }> = {
  open: { label: "Open", bg: "bg-status-open-bg", fg: "text-status-open-fg" },
  done: { label: "Done", bg: "bg-status-done-bg", fg: "text-status-done-fg" },
  dismissed: { label: "Dismissed", bg: "bg-status-dismissed-bg", fg: "text-status-dismissed-fg" },
  pending: { label: "Pending review", bg: "bg-status-pending-bg", fg: "text-status-pending-fg" },
  sent: { label: "Sent", bg: "bg-status-sent-bg", fg: "text-status-sent-fg" },
  discarded: { label: "Discarded", bg: "bg-status-discarded-bg", fg: "text-status-discarded-fg" },
};

export function StatusBadge({ status }: { status: Status }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.bg} ${meta.fg}`}
    >
      {meta.label}
    </span>
  );
}
