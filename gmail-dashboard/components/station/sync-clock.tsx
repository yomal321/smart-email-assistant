"use client";

import * as React from "react";
import Link from "next/link";
import type { SyncState } from "@/lib/data";
import { formatFullDateTime, formatRelativeToNow } from "@/lib/format/relative-time";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

const LABELS: Record<SyncState["status"], (s: SyncState) => string> = {
  synced: (s) => `Synced ${s.lastSyncAt ? formatFullDateTime(s.lastSyncAt) : "Never"}`,
  syncing: (s) => `Syncing · ${s.queueDepth} queued`,
  failed: () => "Sync failed · Retry",
  offline: (s) => `Offline · last synced ${s.lastSyncAt ? formatFullDateTime(s.lastSyncAt) : "Never"}`,
};

/**
 * The Mondaine station clock. Its stop-to-go pause is the sync
 * confirmation: the hand sweeps the interval and holds at 12 the moment a
 * sync completes. design-spec.md §5.8
 */
export function SyncClock({ state, onResync }: { state: SyncState; onResync?: () => void }) {
  const [open, setOpen] = React.useState(false);
  const faceColor =
    state.status === "failed" ? "var(--signal)" : state.status === "offline" ? "var(--ink-disabled)" : "var(--ink)";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-ink-secondary hover:bg-surface-sunk transition-colors"
          aria-label={LABELS[state.status](state)}
        >
          <ClockFace status={state.status} color={faceColor} />
          <span className="hidden sm:inline tabular">{LABELS[state.status](state)}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 rounded-lg p-4">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <ClockFace status={state.status} color={faceColor} size={20} />
            <span className="text-sm font-semibold">{LABELS[state.status](state)}</span>
          </div>
          <dl className="space-y-1.5 text-xs text-ink-secondary">
            <div className="flex justify-between">
              <dt>Last synced</dt>
              <dd className="tabular">{state.lastSyncAt ? formatRelativeToNow(state.lastSyncAt) : "Never"}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Queue depth</dt>
              <dd className="tabular">{state.queueDepth}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Failed items</dt>
              <dd className="tabular">
                {state.failedCount > 0 ? (
                  <Link href="/review" className="underline decoration-1 underline-offset-2 text-signal">
                    {state.failedCount} · review
                  </Link>
                ) : (
                  "0"
                )}
              </dd>
            </div>
            {state.error && (
              <div className="pt-1 text-signal">
                {state.error.message}
              </div>
            )}
          </dl>
          <Button size="sm" variant="secondary" className="w-full rounded-lg" onClick={onResync}>
            Resync now
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ClockFace({
  status,
  color,
  size = 16,
}: {
  status: SyncState["status"];
  color: string;
  size?: number;
}) {
  const sweeping = status === "syncing";
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <circle cx={12} cy={12} r={10.5} fill="none" stroke={color} strokeWidth={1.5} />
      {[...Array(12)].map((_, i) => {
        // Fixed to 3dp: raw sin/cos output can differ in its last float digit
        // between server and client math libraries, which reads as a
        // hydration mismatch even though the rendered position is identical.
        const angle = (i * 30 * Math.PI) / 180;
        const x1 = round3(12 + Math.sin(angle) * 8.4);
        const y1 = round3(12 - Math.cos(angle) * 8.4);
        const x2 = round3(12 + Math.sin(angle) * 9.6);
        const y2 = round3(12 - Math.cos(angle) * 9.6);
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={i % 3 === 0 ? 1.2 : 0.7} />;
      })}
      {status !== "offline" && (
        <line
          x1={12}
          y1={12}
          x2={12}
          y2={3.5}
          stroke={status === "failed" ? "var(--signal)" : "var(--signal)"}
          strokeWidth={1.4}
          strokeLinecap="round"
          className={cn(sweeping && "origin-[12px_12px] animate-[spin_2.5s_linear_infinite]")}
          style={!sweeping && status === "failed" ? { transform: "rotate(50deg)" } : undefined}
        />
      )}
      <circle cx={12} cy={12} r={1.1} fill={color} />
    </svg>
  );
}
