"use client";

import * as React from "react";
import type { ActionItem } from "@/lib/data";

// Fire-and-forget mutation helper: fires a mutation route in the background
// after local state has already applied the optimistic update. Mirrors
// board-provider.tsx's fireMutation/postIds shape — a failed background
// call is logged, not retried or rolled back, and (for addManual) the
// temporary id is not reconciled with the server-assigned one in this phase.
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
    console.error(`[action-items-provider] ${path} failed`, err);
  }
}

function postItems(path: string, payload: Record<string, unknown>): void {
  void fireMutation(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function patchItem(path: string, payload: Record<string, unknown>): void {
  void fireMutation(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

interface ActionItemsContextValue {
  items: ActionItem[];
  addManual: (text: string, dueDate: string | null) => void;
  setStatus: (id: string, status: ActionItem["status"]) => void;
}

const ActionItemsContext = React.createContext<ActionItemsContextValue | null>(null);

export function ActionItemsProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ActionItem[]>([]);

  // Fetch-on-mount, replacing the getActionItems() fixture seed. Follows
  // board-provider.tsx's read-hook pattern: AbortController to cancel on
  // unmount, parse body.error on failure, no UI-blocking loading state.
  React.useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const res = await fetch("/api/action-items", { signal: controller.signal });
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(
            (body && typeof body.error === "string" && body.error) || `request failed with status ${res.status}`
          );
        }
        setItems(body as ActionItem[]);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("[action-items-provider] failed to load action items", err);
      }
    }

    load();

    return () => controller.abort();
  }, []);

  const addManual = React.useCallback((text: string, dueDate: string | null) => {
    setItems((prev) => [
      {
        id: `ai-manual-${Date.now()}`,
        text,
        sourceMessageId: "",
        owner: "you",
        dueDate,
        priority: "normal",
        status: "todo",
        origin: "manual",
        confidence: null,
      },
      ...prev,
    ]);
    postItems("/api/action-items", { text, dueDate });
  }, []);

  const setStatus = React.useCallback((id: string, status: ActionItem["status"]) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
    patchItem(`/api/action-items/${id}`, { status });
  }, []);

  return (
    <ActionItemsContext.Provider value={{ items, addManual, setStatus }}>{children}</ActionItemsContext.Provider>
  );
}

export function useActionItems(): ActionItemsContextValue {
  const ctx = React.useContext(ActionItemsContext);
  if (!ctx) throw new Error("useActionItems must be used within ActionItemsProvider");
  return ctx;
}
