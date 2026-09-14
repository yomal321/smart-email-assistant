"use client";

import { useBoard } from "./board-provider";

/** Every destructive action is reversible. design-spec.md §6.4 */
export function UndoBar() {
  const { undoStack, runUndo, dismissUndo } = useBoard();
  const item = undoStack[undoStack.length - 1];

  if (!item) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-4 sm:justify-start sm:pl-[248px]">
      <div
        className="pointer-events-auto flex w-full max-w-sm items-center gap-3 overflow-hidden rounded-lg bg-ink px-4 py-2.5 text-ground shadow-sheet"
        role="status"
      >
        <span className="flex-1 text-sm">{item.label}</span>
        <button
          onClick={() => runUndo(item.id)}
          className="shrink-0 text-sm font-semibold underline decoration-1 underline-offset-2 hover:opacity-80"
        >
          Undo (U)
        </button>
        <button
          onClick={() => dismissUndo(item.id)}
          aria-label="Dismiss"
          className="shrink-0 text-ground/60 hover:text-ground"
        >
          ×
        </button>
      </div>
    </div>
  );
}
