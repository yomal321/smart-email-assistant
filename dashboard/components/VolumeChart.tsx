"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { ChartCard } from "@/components/ChartCard";
import { computeVolumeOverTime, type VolumeDataPoint } from "@/lib/analytics";
import type { Email } from "@/lib/types";

/**
 * `date` is a UTC calendar-day string (`YYYY-MM-DD`, see `computeVolumeOverTime`).
 * Format it pinned to UTC so the label never shifts a day for viewers west of
 * UTC (a plain `new Date(date).toLocaleDateString()` would render in the
 * viewer's local zone and could show the previous day).
 */
function formatDay(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function VolumeTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as VolumeDataPoint | undefined;
  if (!point) return null;
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-md">
      <p className="font-semibold tabular-nums text-foreground">
        {point.count.toLocaleString()} {point.count === 1 ? "email" : "emails"}
      </p>
      <p className="mt-0.5 text-muted-foreground">{formatDay(point.date)}</p>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return <div className="flex h-64 items-center justify-center text-xs text-muted-foreground">{label}</div>;
}

function VolumeTable({ data }: { data: VolumeDataPoint[] }) {
  if (data.length === 0) return <EmptyState label="No email activity yet." />;
  return (
    <div className="max-h-64 overflow-y-auto rounded-md border border-border">
      <table className="w-full text-left text-xs">
        <thead className="sticky top-0 bg-muted text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">
              Date
            </th>
            <th scope="col" className="px-3 py-2 font-medium tabular-nums">
              Emails
            </th>
          </tr>
        </thead>
        <tbody>
          {data.map((point) => (
            <tr key={point.date} className="border-t border-border">
              <td className="px-3 py-1.5 text-foreground">{formatDay(point.date)}</td>
              <td className="px-3 py-1.5 tabular-nums text-foreground">{point.count.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Email volume over time: a single-series area/line chart (FR3) with an
 * accessible table fallback. One series, so no legend box is needed — the
 * card title already names what's plotted (marks-and-anatomy.md).
 */
export function VolumeChart({ emails }: { emails: Email[] }) {
  const data = useMemo(() => computeVolumeOverTime(emails), [emails]);
  const last = data[data.length - 1];

  const chart =
    data.length === 0 ? (
      <EmptyState label="No email activity yet." />
    ) : (
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="volume-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.1} />
                <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="date"
              tickFormatter={formatDay}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              axisLine={{ stroke: "var(--border)" }}
              tickLine={false}
              minTickGap={24}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={32}
            />
            <Tooltip content={VolumeTooltip} cursor={{ stroke: "var(--border)", strokeWidth: 1 }} />
            <Area
              type="monotone"
              dataKey="count"
              stroke="var(--chart-1)"
              strokeWidth={2}
              fill="url(#volume-fill)"
              dot={false}
              activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }}
              isAnimationActive={false}
            />
            {/* Direct label on the endpoint only (marks-and-anatomy.md: "lines →
                value at the end"); every other point stays reachable via the
                hover tooltip and the table view rather than labeling every dot. */}
            {last ? (
              <ReferenceDot
                x={last.date}
                y={last.count}
                r={4}
                fill="var(--chart-1)"
                stroke="var(--card)"
                strokeWidth={2}
                label={{
                  value: last.count,
                  position: "top",
                  fill: "var(--foreground)",
                  fontSize: 11,
                  fontWeight: 600,
                }}
              />
            ) : null}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );

  return (
    <ChartCard
      id="volume-chart"
      title="Email volume over time"
      description="Emails received per day"
      chart={chart}
      table={<VolumeTable data={data} />}
    />
  );
}
