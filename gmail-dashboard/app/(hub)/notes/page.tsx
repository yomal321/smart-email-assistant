"use client";

// Notes — quick capture, reverse-chronological list, search (spec.md
// FR2/FR9/FR10). Life Hub (013-life-hub).

import * as React from "react";
import { StickyNote, Trash2 } from "lucide-react";
import { useNotes } from "@/lib/data/use-notes";
import { EmptyState } from "@/components/board/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatFullDateTime } from "@/lib/format/relative-time";
import type { Note } from "@/lib/data/types";

export default function NotesPage() {
  const [query, setQuery] = React.useState("");
  const { data: notes, loading, create, update, remove } = useNotes(query);

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-ground">
      <div className="space-y-4 p-4">
        <div>
          <h1 className="text-lg font-semibold text-ink">Notes</h1>
          <p className="text-sm text-ink-secondary">Quick capture for anything that isn&apos;t an email.</p>
        </div>

        <div className="card-surface space-y-3 p-4">
          <CaptureForm onCreate={create} />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notes…"
            className="h-8 rounded-lg"
          />
        </div>

        <div className="card-surface overflow-hidden">
          {loading && <p className="px-4 py-6 text-sm text-ink-secondary">Loading notes…</p>}

          {!loading && notes.length === 0 && (
            <EmptyState
              icon={StickyNote}
              heading={query ? "No notes match." : "Nothing captured yet."}
              body={query ? "Try a different search term." : "An idea, a decision, a piece of reference material — capture it above."}
            />
          )}

          {!loading && notes.map((note) => <NoteRow key={note.id} note={note} onUpdate={update} onDelete={remove} />)}
        </div>
      </div>
    </div>
  );
}

function CaptureForm({ onCreate }: { onCreate: ReturnType<typeof useNotes>["create"] }) {
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setSaving(true);
    const result = await onCreate({ body, title: title.trim() || null });
    setSaving(false);
    if (result.ok) {
      setTitle("");
      setBody("");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)" className="h-8 rounded-lg" />
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Capture a thought…"
        className="min-h-16 rounded-lg text-sm"
      />
      <div className="flex justify-end">
        <Button type="submit" size="sm" className="rounded-lg" disabled={!body.trim() || saving}>
          {saving ? "Saving…" : "Capture"}
        </Button>
      </div>
    </form>
  );
}

function NoteRow({
  note,
  onUpdate,
  onDelete,
}: {
  note: Note;
  onUpdate: ReturnType<typeof useNotes>["update"];
  onDelete: ReturnType<typeof useNotes>["remove"];
}) {
  const [editing, setEditing] = React.useState(false);
  const [title, setTitle] = React.useState(note.title ?? "");
  const [body, setBody] = React.useState(note.body);

  if (editing) {
    return (
      <div className="space-y-2 rule-b px-4 py-3 last:border-b-0">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-8 rounded-lg" placeholder="Title (optional)" />
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} className="min-h-16 rounded-lg text-sm" />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" className="rounded-lg" onClick={() => setEditing(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="rounded-lg"
            onClick={async () => {
              await onUpdate(note.id, { title: title.trim() || null, body });
              setEditing(false);
            }}
          >
            Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 rule-b px-4 py-3 last:border-b-0 cursor-pointer hover:bg-surface-sunk" onClick={() => setEditing(true)}>
      <div className="min-w-0 flex-1">
        {note.title && <p className="truncate text-sm font-medium text-ink">{note.title}</p>}
        <p className="line-clamp-2 text-sm text-ink-secondary">{note.body}</p>
        <p className="mt-1 text-xs text-ink-tertiary">{formatFullDateTime(note.updatedAt)}</p>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete(note.id);
        }}
        aria-label="Delete note"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-ink-tertiary hover:bg-surface-raised hover:text-signal"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}
