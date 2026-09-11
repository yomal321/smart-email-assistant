import type { Task } from "@/lib/types";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDeadline } from "@/lib/format";

export function TaskCard({
  task,
  onChangeStatus,
}: {
  task: Task;
  onChangeStatus: (status: Task["status"]) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <p
          className={`text-sm font-medium ${
            task.status === "dismissed" ? "text-muted-foreground line-through" : "text-foreground"
          }`}
        >
          {task.task_text}
        </p>
        <StatusBadge status={task.status} />
      </div>
      {task.deadline && (
        <p className="mt-1 text-xs text-muted-foreground">Due {formatDeadline(task.deadline)}</p>
      )}
      <div className="mt-2 flex gap-3">
        {task.status !== "done" && (
          <button
            type="button"
            onClick={() => onChangeStatus("done")}
            className="cursor-pointer text-xs font-medium text-success transition-colors hover:text-success/80"
          >
            Mark done
          </button>
        )}
        {task.status !== "dismissed" && (
          <button
            type="button"
            onClick={() => onChangeStatus("dismissed")}
            className="cursor-pointer text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Dismiss
          </button>
        )}
        {task.status !== "open" && (
          <button
            type="button"
            onClick={() => onChangeStatus("open")}
            className="cursor-pointer text-xs font-medium text-primary transition-colors hover:text-primary/80"
          >
            Reopen
          </button>
        )}
      </div>
    </div>
  );
}
