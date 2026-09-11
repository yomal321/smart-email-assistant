import type { Email, Task } from "@/lib/types";
import { TaskCard } from "@/components/TaskCard";

export function ActionItemSidebar({
  tasks,
  emailsById,
  onChangeStatus,
  onSelectEmail,
}: {
  tasks: Task[];
  emailsById: Map<string, Email>;
  onChangeStatus: (taskId: string, status: Task["status"]) => void;
  onSelectEmail: (emailId: string) => void;
}) {
  const open = tasks.filter((t) => t.status === "open");
  const done = tasks.filter((t) => t.status !== "open");

  return (
    <aside className="w-full shrink-0 border-border md:w-72 md:border-l">
      <div className="border-b border-border p-4">
        <h2 className="text-sm font-semibold text-foreground">Action items</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {open.length} open · linked to their source email
        </p>
      </div>

      <div className="space-y-3 p-4">
        {open.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-8 text-center">
            <svg viewBox="0 0 20 20" fill="none" aria-hidden className="h-5 w-5 text-success">
              <path
                d="M4 10.5 8 14.5 16 6"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <p className="text-sm text-muted-foreground">Nothing open — you&apos;re caught up.</p>
          </div>
        )}
        {open.map((task) => {
          const email = emailsById.get(task.email_id);
          return (
            <div key={task.id}>
              {email && (
                <button
                  type="button"
                  onClick={() => onSelectEmail(email.id)}
                  className="mb-1 block w-full cursor-pointer truncate text-left text-xs font-medium text-primary hover:underline"
                >
                  {email.subject}
                </button>
              )}
              <TaskCard task={task} onChangeStatus={(status) => onChangeStatus(task.id, status)} />
            </div>
          );
        })}

        {done.length > 0 && (
          <details className="pt-2">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
              {done.length} done or dismissed
            </summary>
            <div className="mt-3 space-y-3">
              {done.map((task) => {
                const email = emailsById.get(task.email_id);
                return (
                  <div key={task.id}>
                    {email && (
                      <button
                        type="button"
                        onClick={() => onSelectEmail(email.id)}
                        className="mb-1 block w-full cursor-pointer truncate text-left text-xs font-medium text-primary hover:underline"
                      >
                        {email.subject}
                      </button>
                    )}
                    <TaskCard task={task} onChangeStatus={(status) => onChangeStatus(task.id, status)} />
                  </div>
                );
              })}
            </div>
          </details>
        )}
      </div>
    </aside>
  );
}
