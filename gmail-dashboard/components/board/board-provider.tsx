"use client";

import * as React from "react";
import type { Message, Platform } from "@/lib/data";
import { getMessages } from "@/lib/data";
import { NOW } from "@/lib/data/now";

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
    case "archive":
      return {
        ...state,
        messages: state.messages.map((m) =>
          action.ids.includes(m.id)
            ? { ...m, status: "archived", handledAt: NOW.toISOString(), handledAction: "archived" }
            : m
        ),
      };
    case "done":
      return {
        ...state,
        messages: state.messages.map((m) =>
          action.ids.includes(m.id)
            ? { ...m, status: "done", handledAt: NOW.toISOString(), handledAction: "done" }
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
                handledAt: NOW.toISOString(),
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
    messages: getMessages(),
    selectedIds: new Set<string>(),
    vipOverrides: {},
  }));
  const [undoStack, setUndoStack] = React.useState<UndoAction[]>([]);
  const timers = React.useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

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

  const value: BoardContextValue = {
    messages: state.messages,
    selectedIds: state.selectedIds,
    isVip: (contactId, fallback) => state.vipOverrides[contactId] ?? fallback,
    archive: (ids) => {
      dispatch({ type: "archive", ids });
      pushUndo(ids.length > 1 ? `${ids.length} archived` : "Archived", () => dispatch({ type: "restore", ids }));
    },
    markDone: (ids) => {
      dispatch({ type: "done", ids });
      pushUndo(ids.length > 1 ? `${ids.length} marked done` : "Marked done", () =>
        dispatch({ type: "restore", ids })
      );
    },
    snooze: (ids, until) => {
      dispatch({ type: "snooze", ids, until });
      pushUndo(ids.length > 1 ? `${ids.length} snoozed` : "Snoozed", () => dispatch({ type: "restore", ids }));
    },
    restore: (ids) => dispatch({ type: "restore", ids }),
    reassign: (id, platform) => dispatch({ type: "reassign", id, platform }),
    toggleStar: (id, value) => dispatch({ type: "star", id, value }),
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
