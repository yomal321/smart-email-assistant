"use client";

// Phase 7 Wave 2 — a single-line capture box plus the list of not-yet-typed
// items it created. Lives on the Today page itself, not behind a nav door
// (spec.md §7's "capture must take under 10 seconds" — no navigation at
// all). Resolves through the same /api/action-items and /api/notes routes
// every other write already uses — no new backend route for this wave.
// See PHASE-7-IMPLEMENTATION-PLAN.md Wave 2.

import * as React from "react";
import { Inbox } from "lucide-react";
import type { ActionItem } from "@/lib/data/types";

export function QuickCapture({ items, onChange }: { items: ActionItem[]; onChange: () => void }) {
  const [text, setText] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/action-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value, type: "capture" }),
      });
      if (res.ok) {
        setText("");
        onChange();
      }
    } finally {
      setSubmitting(false);
    }
  }

  // 'note' does two existing writes (POST /api/notes, then PATCH the task
  // to 'dismissed') rather than a new convert-to-note route — the task row
  // is dismissed, not deleted, so nothing is lost if the second call fails
  // mid-sequence. 'task'/'meeting' are a single PATCH; the schema already
  // accepts either type with no other field required, so an event created
  // this way starts with no startsAt — set one from the Tasks page same as
  // any other scheduled item.
  async function resolve(item: ActionItem, kind: "task" | "meeting" | "note") {
    if (kind === "note") {
      await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: item.text }),
      });
      await fetch(`/api/action-items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "dismissed" }),
      });
    } else {
      await fetch(`/api/action-items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: kind }),
      });
    }
    onChange();
  }

  return (
    <div className="card-surface p-4">
      <form onSubmit={submit} className="flex items-center gap-2">
        <Inbox size={16} className="shrink-0 text-ink-tertiary" />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Quick capture — decide what it is later…"
          className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-ink-tertiary focus:outline-none"
        />
      </form>

      {items.length > 0 && (
        <div className="mt-3 space-y-1 border-t border-rule pt-3">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-2 py-1">
              <p className="min-w-0 flex-1 truncate text-sm text-ink">{item.text}</p>
              <div className="flex shrink-0 gap-1">
                <button
                  onClick={() => resolve(item, "task")}
                  className="rounded-lg px-2 py-1 text-xs text-ink-secondary hover:bg-surface-sunk"
                >
                  Task
                </button>
                <button
                  onClick={() => resolve(item, "meeting")}
                  className="rounded-lg px-2 py-1 text-xs text-ink-secondary hover:bg-surface-sunk"
                >
                  Event
                </button>
                <button
                  onClick={() => resolve(item, "note")}
                  className="rounded-lg px-2 py-1 text-xs text-ink-secondary hover:bg-surface-sunk"
                >
                  Note
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
