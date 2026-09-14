"use client";

import * as React from "react";

/**
 * The board sheet overlays the board column only — rail and standing board
 * stay visible. The board behind it dims and locks scroll. design-spec §3.3
 */
export function SheetOverlay({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  React.useEffect(() => {
    const prev = document.body.style.overflow;
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="absolute inset-0 z-30 flex animate-in fade-in duration-150">
      <button
        className="flex-1 cursor-default bg-ink/12"
        style={{ backdropFilter: "blur(2px)" }}
        onClick={onClose}
        aria-label="Close sheet"
      />
      <div className="h-full w-full max-w-2xl overflow-hidden rounded-l-2xl shadow-sheet animate-in slide-in-from-right duration-200 ease-out">
        {children}
      </div>
    </div>
  );
}
