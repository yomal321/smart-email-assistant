"use client";

import * as React from "react";
import type { Draft } from "@/lib/data";

// Fire-and-forget mutation helper — mirrors board-provider.tsx's
// fireMutation: fires a request in the background after the reducer/setState
// has already applied the optimistic update. A failed call is logged, not
// retried or rolled back.
async function fireMutation(path: string, init: RequestInit): Promise<void> {
  try {
    const res = await fetch(path, init);
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(
        (body && typeof body.error === "string" && body.error) || `request failed with status ${res.status}`
      );
    }
  } catch (err) {
    console.error(`[drafts-provider] ${path} failed`, err);
  }
}

function patchDraft(id: string, payload: Record<string, unknown>): void {
  void fireMutation(`/api/drafts/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function postDraftStatus(id: string, status: Draft["status"]): void {
  void fireMutation(`/api/drafts/${id}/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
}

interface DraftsContextValue {
  drafts: Draft[];
  // A regenerated draft is a new `drafts` row, not an edit of the old one —
  // POST /api/drafts returns it fully mapped, so it goes straight into state.
  // The Drafts page renders only the newest draft per message, so the
  // superseded one stops showing without being deleted.
  addDraft: (draft: Draft) => void;
  updateBody: (id: string, body: string) => void;
  setTone: (id: string, tone: Draft["tone"]) => void;
  setLength: (id: string, length: Draft["length"]) => void;
  setStatus: (id: string, status: Draft["status"]) => void;
}

const DraftsContext = React.createContext<DraftsContextValue | null>(null);

export function DraftsProvider({ children }: { children: React.ReactNode }) {
  const [drafts, setDrafts] = React.useState<Draft[]>([]);

  // Fetch-on-mount, replacing the getDrafts() fixture seed. Follows
  // board-provider.tsx's read-hook pattern: AbortController to cancel on
  // unmount, parse body.error on failure.
  React.useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        let res = await fetch("/api/drafts", { signal: controller.signal });
        if (res.status === 401) {
          // Transient race: the very first fetch right after login can land
          // before the just-set session cookie is recognized server-side.
          // One short retry clears it every time observed live; a genuinely
          // unauthorized session still fails the same way on the retry.
          await new Promise((r) => setTimeout(r, 400));
          res = await fetch("/api/drafts", { signal: controller.signal });
        }
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(
            (body && typeof body.error === "string" && body.error) || `request failed with status ${res.status}`
          );
        }
        setDrafts(body as Draft[]);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("[drafts-provider] failed to load drafts", err);
      }
    }

    load();

    return () => controller.abort();
  }, []);

  const patch = React.useCallback((id: string, fields: Partial<Draft>) => {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...fields } : d)));
  }, []);

  const addDraft = React.useCallback((draft: Draft) => {
    setDrafts((prev) => [draft, ...prev]);
  }, []);

  const value: DraftsContextValue = {
    drafts,
    addDraft,
    updateBody: (id, body) => {
      patch(id, { body });
      patchDraft(id, { body });
    },
    setTone: (id, tone) => {
      patch(id, { tone });
      patchDraft(id, { tone });
    },
    setLength: (id, length) => {
      patch(id, { length });
      patchDraft(id, { length });
    },
    setStatus: (id, status) => {
      // Optimistic approvedAt stamp for instant feedback only — the server
      // is the source of truth (it won't move the timestamp on a repeat
      // approval, a rule this client doesn't need to replicate).
      patch(id, { status, approvedAt: status === "approved" ? new Date().toISOString() : undefined });
      postDraftStatus(id, status);
    },
  };

  return <DraftsContext.Provider value={value}>{children}</DraftsContext.Provider>;
}

export function useDrafts(): DraftsContextValue {
  const ctx = React.useContext(DraftsContext);
  if (!ctx) throw new Error("useDrafts must be used within DraftsProvider");
  return ctx;
}
