"use client";

import { Archive, CheckSquare, Clock, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SelectionBar({
  count,
  onClear,
  onArchive,
  onMarkDone,
  onSnooze,
}: {
  count: number;
  onClear: () => void;
  onArchive: () => void;
  onMarkDone: () => void;
  onSnooze: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rule-b bg-departure-field px-4 py-2">
      <button onClick={onClear} aria-label="Clear selection (Esc)" className="text-ink-tertiary hover:text-ink">
        <X size={16} />
      </button>
      <span className="text-sm font-semibold text-ink tabular">{count} selected</span>
      <div className="ml-auto flex items-center gap-1.5">
        <Button size="sm" variant="ghost" className="h-7 gap-1.5 rounded-lg text-xs" onClick={onArchive}>
          <Archive size={13} /> Archive
        </Button>
        <Button size="sm" variant="ghost" className="h-7 gap-1.5 rounded-lg text-xs" onClick={onSnooze}>
          <Clock size={13} /> Snooze
        </Button>
        <Button size="sm" variant="ghost" className="h-7 gap-1.5 rounded-lg text-xs" onClick={onMarkDone}>
          <CheckSquare size={13} /> Mark done
        </Button>
      </div>
    </div>
  );
}
