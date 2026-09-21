"use client";

// Zone B2 — today's scheduled items (meetings/calls/lectures/exams) laid out
// on a 07:00-22:00 axis instead of a plain list, so the gaps between blocks
// — where the priority-queue work has to fit — are visually obvious
// (personal-dashboard-spec §7 B2).
//
// Div/CSS positioning rather than the SVG idiom used elsewhere (week-strip.tsx):
// blocks here carry variable-length text labels, which SVG <text> can't wrap.
// Geometry (gridlines, the now-line) still follows the same percentage-of-track
// scaling convention as load-rule.tsx.
//
// nowMinutes is computed by the caller via a timezone-aware Intl call, never
// Date.now() in here — see lib/day-key.ts's own rationale for why this
// codebase treats raw local-time reads as a bug class.
import * as React from "react";
import { SourcePlate } from "@/components/hub/source-plate";
import type { ActionItem, Source } from "@/lib/data/types";

const WINDOW_START_MIN = 7 * 60; // 07:00
const WINDOW_END_MIN = 22 * 60; // 22:00
const WINDOW_SPAN_MIN = WINDOW_END_MIN - WINDOW_START_MIN;
const HOUR_MARKS = [7, 10, 13, 16, 19, 22];
const MIN_BLOCK_PCT = 3.5; // a 15-minute standup must still be clickable

function minutesOfDay(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

function clampToWindowPct(minutes: number): number {
  return Math.min(100, Math.max(0, ((minutes - WINDOW_START_MIN) / WINDOW_SPAN_MIN) * 100));
}

function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function ScheduleTimeline({
  items,
  sourceById,
  nowMinutes,
}: {
  items: ActionItem[];
  sourceById: Map<string, Source>;
  nowMinutes: number | null;
}) {
  const [showTable, setShowTable] = React.useState(false);
  const scheduled = items.filter((i) => i.startsAt !== null);

  if (scheduled.length === 0) {
    return <p className="text-sm text-ink-tertiary">Nothing scheduled today.</p>;
  }

  const showNowLine = nowMinutes !== null && nowMinutes >= WINDOW_START_MIN && nowMinutes <= WINDOW_END_MIN;

  return (
    <div>
      <div className="relative rounded-lg border border-rule bg-surface" style={{ height: 420 }}>
        {HOUR_MARKS.map((hour) => {
          const topPct = clampToWindowPct(hour * 60);
          return (
            <div key={hour} className="absolute left-0 right-0 border-t border-rule" style={{ top: `${topPct}%` }}>
              <span className="tabular absolute -top-2 left-1 bg-surface px-0.5 text-[10px] text-ink-tertiary">
                {String(hour).padStart(2, "0")}:00
              </span>
            </div>
          );
        })}

        {showNowLine && (
          <div className="absolute left-0 right-0 z-10 flex items-center gap-1" style={{ top: `${clampToWindowPct(nowMinutes!)}%` }}>
            <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-signal" />
            <div className="h-px flex-1 bg-signal" />
          </div>
        )}

        {scheduled.map((item) => {
          const start = minutesOfDay(item.startsAt!);
          const duration = item.durationMinutes ?? item.effortMinutes ?? 30;
          const topPct = clampToWindowPct(start);
          const heightPct = Math.max(MIN_BLOCK_PCT, (duration / WINDOW_SPAN_MIN) * 100);
          const source = item.sourceId ? sourceById.get(item.sourceId) : undefined;

          return (
            <div
              key={item.id}
              className="absolute left-8 right-1 overflow-hidden rounded-lg border-l-[3px] bg-surface-raised px-2 py-1 shadow-card"
              style={{
                top: `${topPct}%`,
                height: `${heightPct}%`,
                borderLeftColor: source?.color ?? "var(--ink-tertiary)",
              }}
              title={`${formatClock(item.startsAt!)} · ${item.text}`}
            >
              <p className="truncate text-[11px] font-medium text-ink">{item.text}</p>
              {/* The border carries the source color, but never color alone —
                  the code is the paired channel (same rule SourcePlate
                  enforces everywhere else this codebase shows a source). */}
              <p className="tabular truncate text-[10px] text-ink-tertiary">
                {formatClock(item.startsAt!)}
                {source && ` · ${source.code}`}
              </p>
            </div>
          );
        })}
      </div>

      <button
        onClick={() => setShowTable((v) => !v)}
        className="mt-1 text-xs text-ink-tertiary underline decoration-dotted underline-offset-2 hover:text-ink"
      >
        {showTable ? "Hide data" : "Show data"}
      </button>

      {showTable && (
        <table className="tabular mt-2 w-full text-left text-xs text-ink-secondary">
          <thead>
            <tr className="text-ink-tertiary">
              <th className="pr-3 font-normal">Time</th>
              <th className="pr-3 font-normal">Item</th>
              <th className="font-normal">Source</th>
            </tr>
          </thead>
          <tbody>
            {scheduled
              .slice()
              .sort((a, b) => (a.startsAt! < b.startsAt! ? -1 : 1))
              .map((item) => (
                <tr key={item.id}>
                  <td className="pr-3">{formatClock(item.startsAt!)}</td>
                  <td className="pr-3">{item.text}</td>
                  <td>{item.sourceId ? <SourcePlate source={sourceById.get(item.sourceId)!} /> : "—"}</td>
                </tr>
              ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
