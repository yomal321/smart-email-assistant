"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * The one Committed colour surface — design-spec.md §5.6. These are the
 * largest figures anywhere in the product, and nothing else may use this
 * scale.
 */
export function BalanceBand({
  you,
  them,
}: {
  you: { count: number; overdue: number; withinSla: number };
  them: { count: number; overAWeek: number; recent: number };
}) {
  return (
    <div className="grid grid-cols-1 gap-3 p-4 pb-0 sm:grid-cols-2" role="group" aria-label="Waiting balance">
      <Link
        href="/inbox?platform=needs-reply"
        className="group flex flex-col justify-center gap-1 rounded-2xl px-5 py-4 text-left shadow-card transition-transform hover:-translate-y-0.5"
        style={{ background: "var(--departure)", color: "var(--departure-ink)" }}
      >
        <span className="font-narrow text-[11px] font-bold uppercase tracking-wider opacity-80">Waiting on you</span>
        <span className="font-sans text-3xl font-extrabold tabular leading-none tracking-tight">{you.count}</span>
        <span className="text-xs opacity-80">
          {you.overdue} overdue · {you.withinSla} within SLA
        </span>
      </Link>
      <Link
        href="/follow-ups"
        className="group flex flex-col justify-center gap-1 rounded-2xl border border-rule bg-surface-raised px-5 py-4 text-left shadow-card transition-transform hover:-translate-y-0.5"
      >
        <span className="font-narrow text-[11px] font-bold uppercase tracking-wider text-ink-tertiary">
          Waiting on them
        </span>
        <span className="text-3xl font-extrabold tabular leading-none tracking-tight text-ink">{them.count}</span>
        <span className="text-xs text-ink-secondary">
          {them.overAWeek} over a week · {them.recent} recent
        </span>
      </Link>
    </div>
  );
}
