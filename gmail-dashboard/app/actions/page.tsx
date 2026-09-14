"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckSquare2 } from "lucide-react";
import type { ActionItem } from "@/lib/data";
import { getMessageById } from "@/lib/data";
import { NOW } from "@/lib/data/now";
import { useActionItems } from "@/components/board/action-items-provider";
import { PriorityAspect } from "@/components/station/priority-aspect";
import { EmptyState } from "@/components/board/empty-state";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.round((new Date(iso).getTime() - NOW.getTime()) / 86_400_000);
}

function group(items: ActionItem[]) {
  const overdue: ActionItem[] = [];
  const thisWeek: ActionItem[] = [];
  const later: ActionItem[] = [];
  const noDate: ActionItem[] = [];
  for (const item of items) {
    const d = daysUntil(item.dueDate);
    if (d === null) noDate.push(item);
    else if (d < 0) overdue.push(item);
    else if (d <= 7) thisWeek.push(item);
    else later.push(item);
  }
  return { overdue, thisWeek, later, noDate };
}

function ActionsContent() {
  const store = useActionItems();
  const router = useRouter();
  const params = useSearchParams();
  const view = params.get("view") === "kanban" ? "kanban" : "list";
  const [newText, setNewText] = React.useState("");
  const [exportOpen, setExportOpen] = React.useState(false);

  const open = store.items.filter((i) => i.status !== "done");
  const groups = group(open);

  function setView(v: "list" | "kanban") {
    router.push(`/actions?view=${v}`);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 rule-b px-4 py-3">
        <div>
          <h1 className="text-lg font-semibold text-ink">Action items</h1>
          <p className="text-sm text-ink-secondary">Everything the AI extracted across all mail, in one place.</p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={view} onValueChange={(v) => setView(v as "list" | "kanban")}>
            <TabsList className="rounded-lg">
              <TabsTrigger value="list" className="rounded-lg">
                List
              </TabsTrigger>
              <TabsTrigger value="kanban" className="rounded-lg">
                Kanban
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <DropdownMenu open={exportOpen} onOpenChange={setExportOpen}>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="secondary" className="rounded-lg">
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem disabled>Todoist — not connected in Settings</DropdownMenuItem>
              <DropdownMenuItem disabled>Notion — not connected in Settings</DropdownMenuItem>
              <DropdownMenuItem disabled>Jira — not connected in Settings</DropdownMenuItem>
              <DropdownMenuItem>Export as CSV</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Manual add — an inline row, not a modal */}
      <form
        className="flex items-center gap-2 rule-b px-4 py-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!newText.trim()) return;
          store.addManual(newText.trim(), null);
          setNewText("");
        }}
      >
        <Input
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          placeholder="Add an action item manually…"
          className="h-8 flex-1 rounded-lg"
        />
        <Button type="submit" size="sm" className="h-8 rounded-lg">
          Add
        </Button>
      </form>

      <div className="flex-1 overflow-y-auto">
        {open.length === 0 ? (
          <EmptyState
            icon={CheckSquare2}
            heading="No open action items."
            body="Items appear here as they are found in your mail. The last scan was at 14:22."
          />
        ) : view === "list" ? (
          <ListView groups={groups} onSetStatus={store.setStatus} />
        ) : (
          <KanbanView items={open} onSetStatus={store.setStatus} />
        )}
      </div>
    </div>
  );
}

function ListView({
  groups,
  onSetStatus,
}: {
  groups: ReturnType<typeof group>;
  onSetStatus: (id: string, status: ActionItem["status"]) => void;
}) {
  const sections: [string, ActionItem[]][] = [
    ["Overdue", groups.overdue],
    ["Due this week", groups.thisWeek],
    ["Later", groups.later],
    ["No date", groups.noDate],
  ];
  return (
    <div>
      {sections.map(
        ([label, items]) =>
          items.length > 0 && (
            <div key={label}>
              <div className="rule-b bg-surface px-4 py-1.5 font-narrow text-[11px] font-bold uppercase tracking-wider text-ink-tertiary">
                {label} <span className="tabular">· {items.length}</span>
              </div>
              {items.map((item) => (
                <ActionRow key={item.id} item={item} onSetStatus={onSetStatus} overdue={label === "Overdue"} />
              ))}
            </div>
          )
      )}
    </div>
  );
}

function ActionRow({
  item,
  onSetStatus,
  overdue,
}: {
  item: ActionItem;
  onSetStatus: (id: string, status: ActionItem["status"]) => void;
  overdue: boolean;
}) {
  const source = item.sourceMessageId ? getMessageById(item.sourceMessageId) : undefined;
  return (
    <div className="flex items-center gap-3 rule-b px-4 py-2.5">
      <input
        type="checkbox"
        checked={item.status === "done"}
        onChange={(e) => onSetStatus(item.id, e.target.checked ? "done" : "todo")}
        className="accent-departure"
        aria-label={`Mark "${item.text}" ${item.status === "done" ? "not done" : "done"}`}
      />
      <span className={item.status === "done" ? "flex-1 text-sm text-ink-tertiary line-through" : "flex-1 text-sm text-ink"}>
        {item.text}
      </span>
      {source && (
        <span className="hidden truncate text-xs text-ink-tertiary sm:inline max-w-40" title={source.subject}>
          {source.subject}
        </span>
      )}
      <span className="hidden text-xs text-ink-tertiary sm:inline">{item.owner === "you" ? "you" : item.owner.name}</span>
      <span className={overdue ? "text-xs font-semibold tabular text-signal" : "text-xs tabular text-ink-tertiary"}>
        {item.dueDate ? new Date(item.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—"}
      </span>
      <PriorityAspect priority={item.priority} />
    </div>
  );
}

function KanbanView({
  items,
  onSetStatus,
}: {
  items: ActionItem[];
  onSetStatus: (id: string, status: ActionItem["status"]) => void;
}) {
  const columns: { key: ActionItem["status"]; label: string }[] = [
    { key: "todo", label: "To do" },
    { key: "in-progress", label: "In progress" },
    { key: "done", label: "Done" },
  ];

  function move(item: ActionItem, dir: 1 | -1) {
    const order: ActionItem["status"][] = ["todo", "in-progress", "done"];
    const idx = order.indexOf(item.status);
    const next = order[Math.min(order.length - 1, Math.max(0, idx + dir))];
    onSetStatus(item.id, next);
  }

  return (
    <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
      {columns.map((col) => {
        const colItems = items.filter((i) => i.status === col.key);
        return (
          <div key={col.key} className="rounded-lg border" style={{ borderColor: "var(--rule)" }}>
            <div className="flex items-center justify-between rule-b bg-surface px-3 py-2 font-narrow text-[11px] font-bold uppercase tracking-wider text-ink-tertiary">
              {col.label} <span className="tabular">{colItems.length}</span>
            </div>
            <div className="flex flex-col gap-2 p-2">
              {colItems.map((item) => (
                <div
                  key={item.id}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowRight" && e.shiftKey) move(item, 1);
                    if (e.key === "ArrowLeft" && e.shiftKey) move(item, -1);
                  }}
                  className="rounded-lg border bg-surface-raised p-2.5 text-sm outline-none focus-visible:ring-2"
                  style={{ borderColor: "var(--rule)" }}
                >
                  <p className="text-ink">{item.text}</p>
                  <div className="mt-1.5 flex items-center justify-between text-xs text-ink-tertiary">
                    <span>{item.owner === "you" ? "you" : item.owner.name}</span>
                    <span className="tabular">
                      {item.dueDate ? new Date(item.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "No date"}
                    </span>
                  </div>
                </div>
              ))}
              {colItems.length === 0 && <p className="p-2 text-xs text-ink-tertiary">Nothing here.</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function ActionsPage() {
  return (
    <Suspense fallback={null}>
      <ActionsContent />
    </Suspense>
  );
}
