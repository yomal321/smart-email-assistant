"use client";

import * as React from "react";
import type { Message, Platform } from "@/lib/data";

// Fire-and-forget mutation helper: fires a T5 mutation route in the
// background after the reducer has already applied the optimistic update
// (spec FR10). Mirrors lib/data/use-sync-state.ts's response-parsing shape
// (read body, surface `body.error` on failure) but does not gate any UI —
// a failed background call is logged, not retried or rolled back.
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
    console.error(`[board-provider] ${path} failed`, err);
  }
}

function postIds(path: string, payload: Record<string, unknown>): void {
  void fireMutation(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function patchMessage(path: string, payload: Record<string, unknown>): void {
  void fireMutation(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

interface UndoAction {
  id: string;
  label: string;
  undo: () => void;
}

interface BoardState {
  messages: Message[];
  selectedIds: Set<string>;
  vipOverrides: Record<string, boolean>;
}

type BoardAction =
  | { type: "hydrate"; messages: Message[] }
  | { type: "archive"; ids: string[] }
  | { type: "done"; ids: string[] }
  | { type: "snooze"; ids: string[]; until: string }
  | { type: "reassign"; id: string; platform: Platform }
  | { type: "star"; id: string; value: boolean }
  | { type: "toggleVip"; contactId: string }
  | { type: "restore"; ids: string[] }
  | { type: "select"; id: string }
  | { type: "selectRange"; ids: string[] }
  | { type: "clearSelection" }
  | { type: "selectAll"; ids: string[] };

function reducer(state: BoardState, action: BoardAction): BoardState {
  switch (action.type) {
    case "hydrate":
      return { ...state, messages: action.messages };
    case "archive":
      return {
        ...state,
        messages: state.messages.map((m) =>
          action.ids.includes(m.id)
            ? { ...m, status: "archived", handledAt: new Date().toISOString(), handledAction: "archived" }
            : m
        ),
      };
    case "done":
      return {
        ...state,
        messages: state.messages.map((m) =>
          action.ids.includes(m.id)
            ? { ...m, status: "done", handledAt: new Date().toISOString(), handledAction: "done" }
            : m
        ),
      };
    case "snooze":
      return {
        ...state,
        messages: state.messages.map((m) =>
          action.ids.includes(m.id)
            ? {
                ...m,
                status: "snoozed",
                snoozedUntil: action.until,
                handledAt: new Date().toISOString(),
                handledAction: "snoozed",
              }
            : m
        ),
      };
    case "restore":
      return {
        ...state,
        messages: state.messages.map((m) =>
          action.ids.includes(m.id)
            ? { ...m, status: "open", handledAt: null, handledAction: null, snoozedUntil: null }
            : m
        ),
      };
    case "reassign":
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === action.id && m.ai ? { ...m, ai: { ...m.ai, platform: action.platform, confidence: 100 } } : m
        ),
      };
    case "star":
      return {
        ...state,
        messages: state.messages.map((m) => (m.id === action.id ? { ...m, isStarred: action.value } : m)),
      };
    case "toggleVip":
      return {
        ...state,
        vipOverrides: {
          ...state.vipOverrides,
          [action.contactId]: !(state.vipOverrides[action.contactId] ?? undefined),
        },
      };
    case "select": {
      const next = new Set(state.selectedIds);
      if (next.has(action.id)) next.delete(action.id);
      else next.add(action.id);
      return { ...state, selectedIds: next };
    }
    case "selectRange":
      return { ...state, selectedIds: new Set(action.ids) };
    case "selectAll":
      return { ...state, selectedIds: new Set(action.ids) };
    case "clearSelection":
      return { ...state, selectedIds: new Set() };
    default:
      return state;
  }
}

interface BoardContextValue {
  messages: Message[];
  selectedIds: Set<string>;
  isVip: (contactId: string, fallback: boolean) => boolean;
  archive: (ids: string[]) => void;
  markDone: (ids: string[]) => void;
  snooze: (ids: string[], until: string) => void;
  restore: (ids: string[]) => void;
  reassign: (id: string, platform: Platform) => void;
  toggleStar: (id: string, value: boolean) => void;
  toggleVip: (contactId: string) => void;
  toggleSelect: (id: string) => void;
  clearSelection: () => void;
  selectAll: (ids: string[]) => void;
  pushUndo: (label: string, undo: () => void) => void;
  undoStack: UndoAction[];
  runUndo: (id: string) => void;
  dismissUndo: (id: string) => void;
}

const BoardContext = React.createContext<BoardContextValue | null>(null);

export function BoardProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = React.useReducer(reducer, undefined, (): BoardState => ({
    messages: [],
    selectedIds: new Set<string>(),
    vipOverrides: {},
  }));
  const [undoStack, setUndoStack] = React.useState<UndoAction[]>([]);
  const timers = React.useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Fetch-on-mount, replacing the getMessages() fixture seed (spec FR10).
  // Follows lib/data/use-sync-state.ts's established read-hook pattern:
  // AbortController to cancel on unmount, parse body.error on failure.
  // Called with no query params — matches what getMessages() returned
  // (everything); filtering/sorting stays client-side (spec FR7).
  React.useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        let res = await fetch("/api/messages", { signal: controller.signal });
        if (res.status === 401) {
          // Transient race: the very first fetch right after login can land
          // before the just-set session cookie is recognized server-side.
          // One short retry clears it every time observed live; a genuinely
          // unauthorized session still fails the same way on the retry.
          await new Promise((r) => setTimeout(r, 400));
          res = await fetch("/api/messages", { signal: controller.signal });
        }
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(
            (body && typeof body.error === "string" && body.error) || `request failed with status ${res.status}`
          );
        }
        dispatch({ type: "hydrate", messages: body as Message[] });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("[board-provider] failed to load messages", err);
      }
    }

    load();

    return () => controller.abort();
  }, []);

  const pushUndo = React.useCallback((label: string, undo: () => void) => {
    const id = `undo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setUndoStack((s) => [...s, { id, label, undo }]);
    const t = setTimeout(() => {
      setUndoStack((s) => s.filter((u) => u.id !== id));
      timers.current.delete(id);
    }, 8000);
    timers.current.set(id, t);
  }, []);

  const dismissUndo = React.useCallback((id: string) => {
    setUndoStack((s) => s.filter((u) => u.id !== id));
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
  }, []);

  const runUndo = React.useCallback(
    (id: string) => {
      const item = undoStack.find((u) => u.id === id);
      if (item) item.undo();
      dismissUndo(id);
    },
    [undoStack, dismissUndo]
  );

  // Shared by the `restore` action and by archive/markDone/snooze's undo
  // callbacks below, so clicking undo also fires the real restore route
  // (spec FR10) instead of only reverting local state.
  const restore = (ids: string[]) => {
    dispatch({ type: "restore", ids });
    postIds("/api/messages/restore", { ids });
  };

  const value: BoardContextValue = {
    messages: state.messages,
    selectedIds: state.selectedIds,
    isVip: (contactId, fallback) => state.vipOverrides[contactId] ?? fallback,
    archive: (ids) => {
      dispatch({ type: "archive", ids });
      pushUndo(ids.length > 1 ? `${ids.length} archived` : "Archived", () => restore(ids));
      postIds("/api/messages/archive", { ids });
    },
    markDone: (ids) => {
      dispatch({ type: "done", ids });
      pushUndo(ids.length > 1 ? `${ids.length} marked done` : "Marked done", () => restore(ids));
      postIds("/api/messages/done", { ids });
    },
    snooze: (ids, until) => {
      dispatch({ type: "snooze", ids, until });
      pushUndo(ids.length > 1 ? `${ids.length} snoozed` : "Snoozed", () => restore(ids));
      postIds("/api/messages/snooze", { ids, until });
    },
    restore,
    reassign: (id, platform) => {
      dispatch({ type: "reassign", id, platform });
      patchMessage(`/api/messages/${id}/platform`, { platform });
    },
    toggleStar: (id, value) => {
      dispatch({ type: "star", id, value });
      patchMessage(`/api/messages/${id}/star`, { value });
    },
    toggleVip: (contactId) => dispatch({ type: "toggleVip", contactId }),
    toggleSelect: (id) => dispatch({ type: "select", id }),
    clearSelection: () => dispatch({ type: "clearSelection" }),
    selectAll: (ids) => dispatch({ type: "selectAll", ids }),
    pushUndo,
    undoStack,
    runUndo,
    dismissUndo,
  };

  return <BoardContext.Provider value={value}>{children}</BoardContext.Provider>;
}

export function useBoard(): BoardContextValue {
  const ctx = React.useContext(BoardContext);
  if (!ctx) throw new Error("useBoard must be used within BoardProvider");
  return ctx;
}
