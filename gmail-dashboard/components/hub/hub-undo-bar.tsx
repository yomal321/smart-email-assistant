"use client";

// The hub's own undo bar. Visually the same ink-on-ground pill as the mail
// module's components/board/undo-bar.tsx, but driven by props instead of
// useBoard() — the hub never mounts BoardProvider, and coupling it to the
// mail board's undo stack just to reuse 20 lines of markup would undo the
// shell separation that app/mail/layout.tsx exists to enforce.

export function HubUndoBar({
  label,
  onUndo,
  onDismiss,
}: {
  label: string;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-4 md:justify-start md:pl-[248px]">
      <div
        className="pointer-events-auto flex w-full max-w-sm items-center gap-3 overflow-hidden rounded-lg bg-ink px-4 py-2.5 text-ground shadow-sheet"
        role="status"
      >
        <span className="flex-1 truncate text-sm">{label}</span>
        <button
          onClick={onUndo}
          className="shrink-0 text-sm font-semibold underline decoration-1 underline-offset-2 hover:opacity-80"
        >
          Undo
        </button>
        <button onClick={onDismiss} aria-label="Dismiss" className="shrink-0 text-ground/60 hover:text-ground">
          ×
        </button>
      </div>
    </div>
  );
}
