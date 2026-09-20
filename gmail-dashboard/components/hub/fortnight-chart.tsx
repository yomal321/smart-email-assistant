"use client";

// Zone C1 — "the most valuable panel in the app and the reason it's worth
// building at all" (personal-dashboard-spec §7 C1): a work deliverable and
// exams from both universities landing in the same week should read as a
// shape, three weeks out, while there's still time to do something about it.
//
// A direct generalization of the old 7-day week-strip.tsx (now deleted) to a
// 14-day window — same hand-authored SVG conventions (flat fills, square
// bars, tabular labels, viewBox-matched aspect-ratio, a data-table fallback),
// still no charting dependency.
import * as React from "react";
import type { Source } from "@/lib/data/types";

export interface DayLoad {
  day: string;
  label: string;
  bySource: { sourceId: string; minutes: number }[];
}

const WIDTH = 700;
const HEIGHT = 160;
const PAD_TOP = 8;
const PAD_BOTTOM = 28;
const BAR_GAP = 4;
const WEEKDAY_LABEL_CUTOFF = 7; // past one week, a weekday name reads as noise — switch to day-of-month

function hours(minutes: number): string {
  const h = minutes / 60;
  return h % 1 === 0 ? `${h}h` : `${h.toFixed(1)}h`;
}

// "Mon 22 Sep" -> "22" (date-of-month only, for columns past the first week).
function dayOfMonth(label: string): string {
  return label.split(" ")[1] ?? label;
}

export function FortnightChart({
  days,
  sourceById,
  capacityMinutes,
  onSelectDay,
  selectedDay,
}: {
  days: DayLoad[];
  sourceById: Map<string, Source>;
  capacityMinutes: number;
  onSelectDay?: (day: string) => void;
  selectedDay?: string | null;
}) {
  const [showTable, setShowTable] = React.useState(false);

  const totals = days.map((d) => d.bySource.reduce((sum, s) => sum + s.minutes, 0));
  const maxMinutes = Math.max(capacityMinutes, ...totals, 1);
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const barWidth = (WIDTH - BAR_GAP * (days.length - 1)) / days.length;
  const capacityY = PAD_TOP + plotHeight * (1 - capacityMinutes / maxMinutes);

  return (
    <div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        style={{ aspectRatio: `${WIDTH} / ${HEIGHT}` }}
        role="img"
        aria-label="Estimated hours per day for the next 14 days, by source"
      >
        {/* Capacity line across all fourteen days — the reference every column is read against. */}
        <line x1={0} x2={WIDTH} y1={capacityY} y2={capacityY} stroke="var(--rule-strong)" strokeWidth={1} strokeDasharray="3 3" />

        {days.map((day, i) => {
          const x = i * (barWidth + BAR_GAP);
          const total = totals[i];
          const overCapacity = total > capacityMinutes;
          let yCursor = HEIGHT - PAD_BOTTOM;

          return (
            <g key={day.day}>
              {/* Hit target for the whole column, wider than the bar itself so a thin day is still easy to click. */}
              <rect
                x={x}
                y={0}
                width={barWidth}
                height={HEIGHT}
                fill={selectedDay === day.day ? "var(--departure-field)" : "transparent"}
                className={onSelectDay ? "cursor-pointer" : undefined}
                onClick={() => onSelectDay?.(day.day)}
              />

              {day.bySource.map(({ sourceId, minutes }) => {
                const source = sourceById.get(sourceId);
                const segHeight = plotHeight * (minutes / maxMinutes);
                yCursor -= segHeight;
                return (
                  <rect
                    key={sourceId}
                    x={x + 2}
                    y={yCursor}
                    width={Math.max(0, barWidth - 4)}
                    height={segHeight}
                    fill={source?.color ?? "var(--ink-tertiary)"}
                  />
                );
              })}

              {/* Over-capacity gets both the translucent overlay AND a text
                  marker below — colour is never the only signal. */}
              {overCapacity && (
                <rect
                  x={x + 2}
                  y={PAD_TOP}
                  width={Math.max(0, barWidth - 4)}
                  height={Math.max(0, yCursor - PAD_TOP)}
                  fill="var(--signal)"
                  fillOpacity={0.16}
                />
              )}

              {total > 0 && (
                <text
                  x={x + barWidth / 2}
                  y={Math.max(PAD_TOP + 9, yCursor - 3)}
                  textAnchor="middle"
                  className="tabular"
                  fontSize={9}
                  fill={overCapacity ? "var(--signal)" : "var(--ink-tertiary)"}
                >
                  {overCapacity ? "!" : hours(total)}
                </text>
              )}

              <text
                x={x + barWidth / 2}
                y={HEIGHT - 12}
                textAnchor="middle"
                fontSize={9}
                fontWeight={selectedDay === day.day ? 700 : 400}
                fill={i === 0 ? "var(--ink)" : "var(--ink-tertiary)"}
              >
                {i === 0 ? "Today" : i < WEEKDAY_LABEL_CUTOFF ? day.label.split(" ")[0] : dayOfMonth(day.label)}
              </text>
            </g>
          );
        })}
      </svg>

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
              <th className="pr-3 font-normal">Day</th>
              <th className="pr-3 font-normal">Total</th>
              <th className="font-normal">By source</th>
            </tr>
          </thead>
          <tbody>
            {days.map((day, i) => (
              <tr key={day.day}>
                <td className="pr-3">{i === 0 ? "Today" : day.label}</td>
                <td className="pr-3">{hours(totals[i])}</td>
                <td>
                  {day.bySource.length === 0
                    ? "—"
                    : day.bySource
                        .map((s) => `${sourceById.get(s.sourceId)?.name ?? "Unknown"} ${hours(s.minutes)}`)
                        .join(", ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
