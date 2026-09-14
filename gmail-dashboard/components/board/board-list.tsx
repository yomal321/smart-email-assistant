"use client";

import * as React from "react";
import type { Message, Platform } from "@/lib/data";
import { useBoard } from "./board-provider";
import { BoardRow, BoardRowHeader } from "@/components/station/board-row";
import { BoardSheet } from "@/components/station/board-sheet";
import { SheetOverlay } from "./sheet-overlay";
import { SelectionBar } from "./selection-bar";
import { daysFromNow } from "@/lib/data/now";

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

export function BoardList({
  messages,
  emptyState,
  allowRestore = false,
  initialOpenId,
}: {
  messages: Message[];
  emptyState?: React.ReactNode;
  allowRestore?: boolean;
  initialOpenId?: string | null;
}) {
  const board = useBoard();
  const initialIndex = Math.max(
    0,
    messages.findIndex((m) => m.id === initialOpenId)
  );
  const [focusedIndex, setFocusedIndex] = React.useState(initialIndex);
  const [openId, setOpenId] = React.useState<string | null>(initialOpenId ?? null);
  const rowRefs = React.useRef<Map<string, HTMLDivElement | null>>(new Map());
  const bulkMode = board.selectedIds.size > 0;

  // Clamp at read time rather than in an effect — the list can shrink (a
  // filter applied, a row archived) between renders, and focusedIndex may
  // momentarily point past the end.
  const safeFocusedIndex = Math.min(focusedIndex, Math.max(0, messages.length - 1));
  const focusedMessage = messages[safeFocusedIndex];

  const scrollToFocused = React.useCallback((id: string) => {
    const el = rowRefs.current.get(id);
    el?.scrollIntoView({ block: "nearest" });
  }, []);

  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) {
        if (e.key === "Escape") (e.target as HTMLElement).blur();
        return;
      }
      if (!focusedMessage) return;

      switch (e.key) {
        case "j":
        case "ArrowDown": {
          e.preventDefault();
          const next = Math.min(safeFocusedIndex + 1, messages.length - 1);
          setFocusedIndex(next);
          scrollToFocused(messages[next]?.id);
          break;
        }
        case "k":
        case "ArrowUp": {
          e.preventDefault();
          const prev = Math.max(safeFocusedIndex - 1, 0);
          setFocusedIndex(prev);
          scrollToFocused(messages[prev]?.id);
          break;
        }
        case "J": {
          const next = Math.min(safeFocusedIndex + 1, messages.length - 1);
          const ids = messages.slice(Math.min(safeFocusedIndex, next), Math.max(safeFocusedIndex, next) + 1).map((m) => m.id);
          board.selectAll(Array.from(new Set([...board.selectedIds, ...ids])));
          setFocusedIndex(next);
          break;
        }
        case "K": {
          const prev = Math.max(safeFocusedIndex - 1, 0);
          const ids = messages.slice(Math.min(safeFocusedIndex, prev), Math.max(safeFocusedIndex, prev) + 1).map((m) => m.id);
          board.selectAll(Array.from(new Set([...board.selectedIds, ...ids])));
          setFocusedIndex(prev);
          break;
        }
        case "Enter":
          e.preventDefault();
          setOpenId(focusedMessage.id);
          break;
        case "Escape":
          if (openId) setOpenId(null);
          else if (bulkMode) board.clearSelection();
          break;
        case "e":
        case "E":
          board.archive(bulkMode ? Array.from(board.selectedIds) : [focusedMessage.id]);
          if (bulkMode) board.clearSelection();
          break;
        case "d":
        case "D":
          board.markDone(bulkMode ? Array.from(board.selectedIds) : [focusedMessage.id]);
          if (bulkMode) board.clearSelection();
          break;
        case "s":
        case "S":
          board.snooze(bulkMode ? Array.from(board.selectedIds) : [focusedMessage.id], daysFromNow(1));
          if (bulkMode) board.clearSelection();
          break;
        case "r":
        case "R":
          setOpenId(focusedMessage.id);
          break;
        case "x":
        case "X":
          board.toggleSelect(focusedMessage.id);
          break;
        case "!":
          board.toggleVip(focusedMessage.sender.id);
          break;
        case "u":
        case "U": {
          const last = board.undoStack[board.undoStack.length - 1];
          if (last) board.runUndo(last.id);
          break;
        }
        default: {
          const n = Number(e.key);
          if (n >= 1 && n <= 7 && focusedMessage.ai) {
            const PLATFORM_BY_NUMBER: Record<number, Platform> = {
              1: "needs-reply",
              2: "meeting",
              3: "invoice",
              4: "fyi",
              5: "newsletter",
              6: "automated",
              7: "spam-ish",
            };
            board.reassign(focusedMessage.id, PLATFORM_BY_NUMBER[n]);
          }
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [safeFocusedIndex, focusedMessage, messages, board, bulkMode, openId, scrollToFocused]);

  const openMessage = messages.find((m) => m.id === openId) ?? board.messages.find((m) => m.id === openId);

  if (messages.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      {bulkMode && (
        <SelectionBar
          count={board.selectedIds.size}
          onClear={board.clearSelection}
          onArchive={() => {
            board.archive(Array.from(board.selectedIds));
            board.clearSelection();
          }}
          onMarkDone={() => {
            board.markDone(Array.from(board.selectedIds));
            board.clearSelection();
          }}
          onSnooze={() => {
            board.snooze(Array.from(board.selectedIds), daysFromNow(1));
            board.clearSelection();
          }}
        />
      )}
      <BoardRowHeader bulkMode={bulkMode} />
      <div role="grid" aria-rowcount={messages.length} className="flex-1 overflow-y-auto">
        {messages.map((m, i) => (
          <BoardRow
            key={m.id}
            ref={(el) => {
              rowRefs.current.set(m.id, el);
            }}
            message={m}
            isSelected={board.selectedIds.has(m.id)}
            isFocused={i === safeFocusedIndex}
            isVip={board.isVip(m.sender.id, m.sender.isVip)}
            bulkMode={bulkMode}
            onToggleSelect={() => board.toggleSelect(m.id)}
            onOpen={() => {
              setFocusedIndex(i);
              setOpenId(m.id);
            }}
            onArchive={() => board.archive([m.id])}
            onMarkDone={() => board.markDone([m.id])}
            onSnooze={() => board.snooze([m.id], daysFromNow(1))}
            onToggleStar={() => board.toggleStar(m.id, !m.isStarred)}
            onRestore={allowRestore ? () => board.restore([m.id]) : undefined}
          />
        ))}
      </div>

      {openMessage && (
        <SheetOverlay onClose={() => setOpenId(null)}>
          <BoardSheet
            message={openMessage}
            onClose={() => setOpenId(null)}
            onReassign={(p) => board.reassign(openMessage.id, p)}
            isVip={board.isVip(openMessage.sender.id, openMessage.sender.isVip)}
            onToggleVip={() => board.toggleVip(openMessage.sender.id)}
          />
        </SheetOverlay>
      )}
    </div>
  );
}
