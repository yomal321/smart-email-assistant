"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SHORTCUT_GROUPS } from "@/lib/keyboard/registry";

export function ShortcutSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl rounded-lg">
        <DialogHeader>
          <DialogTitle className="font-narrow text-sm font-bold uppercase tracking-wider">
            Keyboard shortcuts
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {SHORTCUT_GROUPS.map((g) => (
            <div key={g.group}>
              <h3 className="mb-2 font-narrow text-[11px] font-bold uppercase tracking-wider text-ink-tertiary">
                {g.group}
              </h3>
              <ul className="space-y-1.5">
                {g.shortcuts.map((s) => (
                  <li key={s.description} className="flex items-center justify-between text-sm">
                    <span className="text-ink-secondary">{s.description}</span>
                    <span className="flex gap-1">
                      {s.keys.map((k, i) => (
                        <kbd
                          key={i}
                          className="rounded-lg border bg-surface-sunk px-1.5 py-0.5 font-narrow text-[11px] tabular"
                          style={{ borderColor: "var(--rule)" }}
                        >
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
