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
import { SourcePlate } from "@/components/hub/source-plate";
import { StatusPill, type Tone } from "@/components/hub/primitives";
import { CreateTaskForm, TYPE_LABEL } from "@/components/hub/create-task-form";
import type { ActionItem, Course, Source } from "@/lib/data/types";

const STATUS_LABEL: Record<ActionItem["status"], string> = {
  todo: "To do",
  "in-progress": "In progress",
  done: "Done",
};

const STATUS_TONE: Record<ActionItem["status"], Tone> = {
  todo: "neutral",
  "in-progress": "info",
  done: "success",
};

export default function HubTasksPage() {
  const [items, setItems] = React.useState<ActionItem[]>([]);
  const [sources, setSources] = React.useState<Source[]>([]);
  const [courses, setCourses] = React.useState<Course[]>([]);
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
      fetch("/api/courses", { signal: controller.signal }).then((r) => r.json()),
    ])
      .then(([taskBody, sourceBody, courseBody]) => {
        setItems(Array.isArray(taskBody) ? taskBody : []);
        setSources(Array.isArray(sourceBody) ? sourceBody : []);
        setCourses(Array.isArray(courseBody) ? courseBody : []);
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
    <div className="flex h-full flex-col overflow-y-auto bg-ground">
      <div className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-ink">Tasks</h1>
            <p className="text-sm text-ink-secondary">Every commitment in the system — work, both degrees, or typed by hand.</p>
          </div>
          <label className="flex items-center gap-1.5 text-xs text-ink-secondary">
            <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} className="accent-departure" />
            Show done
          </label>
        </div>

        <div className="card-surface p-4">
          <CreateTaskForm sources={sources} courses={courses} onCreated={(item) => setItems((prev) => [item, ...prev])} />
        </div>

        <div className="card-surface overflow-hidden">
          {loading && <p className="px-4 py-6 text-sm text-ink-secondary">Loading tasks…</p>}

          {!loading && visible.length === 0 && (
            <EmptyState icon={CheckSquare} heading="Nothing here." body="Tasks extracted from mail or added above will show up here." />
          )}

          {!loading &&
            visible.map((item) => {
              const source = item.sourceId ? sourceById.get(item.sourceId) : undefined;
              return (
                <div key={item.id} className="flex items-center gap-3 rule-b px-4 py-2.5 last:border-b-0">
                  {item.status !== "done" && (
                    <label className="-mx-2.5 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center">
                      <input
                        type="checkbox"
                        checked={false}
                        onChange={() => markDone(item.id)}
                        className="h-4 w-4 accent-departure"
                        aria-label="Mark done"
                      />
                    </label>
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
                  <StatusPill tone={STATUS_TONE[item.status]}>{STATUS_LABEL[item.status]}</StatusPill>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
