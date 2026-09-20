"use client";

// Client-side read+write hook for /api/notes, following use-rules.ts's
// template — {data, loading, error, ...mutators}, AbortController cleanup.
// Also takes an optional search query, re-fetching against the server-side
// `?q=` filter (spec.md FR10) rather than filtering client-side.

import { useEffect, useState } from "react";
import type { Note } from "./types";

export interface UseNotesResult {
  data: Note[];
  loading: boolean;
  error: string | null;
  create: (input: { body: string; title?: string | null }) => Promise<{ ok: boolean; error?: string }>;
  update: (id: string, patch: { title?: string | null; body?: string }) => Promise<{ ok: boolean; error?: string }>;
  remove: (id: string) => Promise<{ ok: boolean; error?: string }>;
}

export function useNotes(query: string = ""): UseNotesResult {
  const [data, setData] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const url = query.trim() ? `/api/notes?q=${encodeURIComponent(query.trim())}` : "/api/notes";
        const res = await fetch(url, { signal: controller.signal });
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(
            (body && typeof body.error === "string" && body.error) || `request failed with status ${res.status}`
          );
        }
        setData(body as Note[]);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "failed to load notes");
      } finally {
        setLoading(false);
      }
    }

    load();

    return () => controller.abort();
  }, [query]);

  async function create(input: { body: string; title?: string | null }) {
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) return { ok: false, error: (body && body.error) || "failed to create note" };
      setData((prev) => [body as Note, ...prev]);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "failed to create note" };
    }
  }

  async function update(id: string, patch: { title?: string | null; body?: string }) {
    const previous = data;
    setData((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));

    try {
      const res = await fetch(`/api/notes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error((body && body.error) || "failed to update note");
      setData((prev) => prev.map((n) => (n.id === id ? (body.updated as Note) : n)));
      return { ok: true };
    } catch (err) {
      setData(previous);
      const message = err instanceof Error ? err.message : "failed to update note";
      setError(message);
      return { ok: false, error: message };
    }
  }

  async function remove(id: string) {
    const previous = data;
    setData((prev) => prev.filter((n) => n.id !== id));

    try {
      const res = await fetch(`/api/notes/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("failed to delete note");
      return { ok: true };
    } catch (err) {
      setData(previous);
      const message = err instanceof Error ? err.message : "failed to delete note";
      setError(message);
      return { ok: false, error: message };
    }
  }

  return { data, loading, error, create, update, remove };
}
