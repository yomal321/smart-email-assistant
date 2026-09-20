"use client";

// Hub-wide Tasks — the same unified list the mail module's Action items page
// reads (tasks.origin extracted/manual, one table since 0009_tasks_enrichment
// — see architect/04-data-model.md "The FK that matters"), presented as a
// life-hub surface rather than an email one. Same data, different room.
//
// This is also where 0016_life_load.sql's ranking fields (type, source,
// weight, effort, due time) actually get set by hand — the hub's Today
// screen has nothing to rank without them.

import * as React from "react";
import { CheckSquare } from "lucide-react";
import { EmptyState } from "@/components/board/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SourcePlate } from "@/components/hub/source-plate";
import type { ActionItem, Source, TaskType } from "@/lib/data/types";

const STATUS_LABEL: Record<ActionItem["status"], string> = {
  todo: "To do",
  "in-progress": "In progress",
  done: "Done",
};

const TYPE_LABEL: Record<TaskType, string> = {
  task: "Task",
  meeting: "Meeting",
  call: "Call",
  assignment: "Assignment",
  quiz: "Quiz",
  ca: "CA",
  exam: "Exam",
  admin: "Admin",
};

export default function HubTasksPage() {
  const [items, setItems] = React.useState<ActionItem[]>([]);
  const [sources, setSources] = React.useState<Source[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showDone, setShowDone] = React.useState(false);

  const load = React.useCallback((signal?: AbortSignal) => {
    fetch("/api/action-items", { signal })
      .then((res) => res.json())
      .then((body) => setItems(Array.isArray(body) ? body : []))
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
      });
  }, []);

  React.useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch("/api/action-items", { signal: controller.signal }).then((r) => r.json()),
      fetch("/api/sources", { signal: controller.signal }).then((r) => r.json()),
    ])
      .then(([taskBody, sourceBody]) => {
        setItems(Array.isArray(taskBody) ? taskBody : []);
        setSources(Array.isArray(sourceBody) ? sourceBody : []);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const sourceById = React.useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources]);
  const visible = showDone ? items : items.filter((i) => i.status !== "done");

  async function markDone(id: string) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status: "done" } : i)));
    const res = await fetch(`/api/action-items/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    });
    if (!res.ok) load();
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 rule-b px-4 py-3">
        <div>
          <h1 className="text-lg font-semibold text-ink">Tasks</h1>
          <p className="text-sm text-ink-secondary">Every commitment in the system — work, both degrees, or typed by hand.</p>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-ink-secondary">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} className="accent-departure" />
          Show done
        </label>
      </div>

      <CreateTaskForm sources={sources} onCreated={(item) => setItems((prev) => [item, ...prev])} />

      {loading && <p className="px-4 py-6 text-sm text-ink-secondary">Loading tasks…</p>}

      {!loading && visible.length === 0 && (
        <EmptyState icon={CheckSquare} heading="Nothing here." body="Tasks extracted from mail or added above will show up here." />
      )}

      {!loading &&
        visible.map((item) => {
          const source = item.sourceId ? sourceById.get(item.sourceId) : undefined;
          return (
            <div key={item.id} className="flex items-center gap-3 rule-b px-4 py-2.5">
              {item.status !== "done" && (
                <input
                  type="checkbox"
                  checked={false}
                  onChange={() => markDone(item.id)}
                  className="accent-departure"
                  aria-label="Mark done"
                />
              )}
              {source && <SourcePlate source={source} />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-ink">{item.text}</p>
                <p className="text-xs text-ink-tertiary">
                  {TYPE_LABEL[item.type]}
                  {source && ` · ${source.name}`}
                  {item.planId && " · in a plan"}
                  {` · weight ${item.weight} · ${item.effortMinutes}m`}
                </p>
              </div>
              {item.dueAt && (
                <span className="tabular shrink-0 text-xs text-ink-tertiary">
                  {new Date(item.dueAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}
                </span>
              )}
              <span className="shrink-0 rounded-full bg-surface-sunk px-2 py-0.5 text-[11px] font-medium text-ink-secondary">
                {STATUS_LABEL[item.status]}
              </span>
            </div>
          );
        })}
    </div>
  );
}

function CreateTaskForm({ sources, onCreated }: { sources: Source[]; onCreated: (item: ActionItem) => void }) {
  const [text, setText] = React.useState("");
  const [type, setType] = React.useState<TaskType>("task");
  const [sourceId, setSourceId] = React.useState<string>("");
  const [dueAt, setDueAt] = React.useState("");
  const [weight, setWeight] = React.useState("3");
  const [effortMinutes, setEffortMinutes] = React.useState("30");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSaving(true);
    setError(null);
    const res = await fetch("/api/action-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        type,
        sourceId: sourceId || null,
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
        weight: Number(weight),
        effortMinutes: Number(effortMinutes),
      }),
    });
    const body = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) {
      setError((body && body.error) || "failed to create task");
      return;
    }
    onCreated(body as ActionItem);
    setText("");
    setDueAt("");
    setType("task");
    setWeight("3");
    setEffortMinutes("30");
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2 rule-b px-4 py-3">
      <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="What needs doing…" className="h-8 min-w-48 flex-1 rounded-lg" />
      <Select value={type} onValueChange={(v) => setType(v as TaskType)}>
        <SelectTrigger size="sm" className="h-8 w-32 rounded-lg">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(TYPE_LABEL) as TaskType[]).map((t) => (
            <SelectItem key={t} value={t}>
              {TYPE_LABEL[t]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={sourceId} onValueChange={setSourceId}>
        <SelectTrigger size="sm" className="h-8 w-36 rounded-lg">
          <SelectValue placeholder="Source…" />
        </SelectTrigger>
        <SelectContent>
          {sources.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="h-8 rounded-lg" />
      <label className="flex items-center gap-1 text-xs text-ink-secondary">
        Weight
        <Input
          type="number"
          min={1}
          max={5}
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          className="h-8 w-14 rounded-lg"
        />
      </label>
      <label className="flex items-center gap-1 text-xs text-ink-secondary">
        Effort (min)
        <Input
          type="number"
          min={0}
          value={effortMinutes}
          onChange={(e) => setEffortMinutes(e.target.value)}
          className="h-8 w-16 rounded-lg"
        />
      </label>
      <Button type="submit" size="sm" className="h-8 rounded-lg" disabled={!text.trim() || saving}>
        {saving ? "Adding…" : "+ Add"}
      </Button>
      {error && <p className="text-xs" style={{ color: "var(--signal)" }}>{error}</p>}
    </form>
  );
}
