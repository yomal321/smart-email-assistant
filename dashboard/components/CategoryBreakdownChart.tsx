"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { ChartCard } from "@/components/ChartCard";
import { CATEGORY_META } from "@/components/CategoryBadge";
import { computeCategoryBreakdown, type CategoryBreakdownEntry } from "@/lib/analytics";
import type { Email, EmailCategory } from "@/lib/types";

/**
 * Category → chart series color, keyed by category identity in a fixed
 * order — never reassigned by sort position. `computeCategoryBreakdown`
 * sorts rows by count descending, so which row is on top changes as data
 * changes; the color must not ("color follows the entity, never its rank").
 */
const CATEGORY_COLOR: Record<EmailCategory, string> = {
  needs_reply: "var(--chart-1)",
  fyi: "var(--chart-2)",
  waiting_on_someone_else: "var(--chart-3)",
  promotional: "var(--chart-4)",
  low_priority: "var(--chart-5)",
};

function CategoryTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const entry = payload[0]?.payload as CategoryBreakdownEntry | undefined;
  if (!entry) return null;
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-md">
      <p className="font-semibold tabular-nums text-foreground">
        {entry.count.toLocaleString()} {entry.count === 1 ? "email" : "emails"}
      </p>
      <p className="mt-0.5 text-muted-foreground">
        {CATEGORY_META[entry.category].label} · {Math.round(entry.percentage)}%
      </p>
    </div>
  );
}

function EmptyState() {
  return <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">No triaged emails yet.</div>;
}

function CategoryTable({ data }: { data: CategoryBreakdownEntry[] }) {
  return (
    <div className="overflow-hidden rounded-md border border-border">
      <table className="w-full text-left text-xs">
        <thead className="bg-muted text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">
              Category
            </th>
            <th scope="col" className="px-3 py-2 font-medium tabular-nums">
              Emails
            </th>
            <th scope="col" className="px-3 py-2 font-medium tabular-nums">
              Share
            </th>
          </tr>
        </thead>
        <tbody>
          {data.map((entry) => (
            <tr key={entry.category} className="border-t border-border">
              <td className="px-3 py-1.5 text-foreground">
                <span
                  aria-hidden
                  className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle"
                  style={{ backgroundColor: CATEGORY_COLOR[entry.category] }}
                />
                {CATEGORY_META[entry.category].label}
              </td>
              <td className="px-3 py-1.5 tabular-nums text-foreground">{entry.count.toLocaleString()}</td>
              <td className="px-3 py-1.5 tabular-nums text-foreground">{Math.round(entry.percentage)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Category breakdown: a horizontal bar chart (FR3) — one bar per category,
 * each in its own fixed categorical color. No separate legend box: every bar
 * already carries its category name as a y-axis row label, which is a
 * stronger identity link than a same-page legend would be (marks-and-anatomy.md's
 * "never rely on color-matching alone" is satisfied by the row label itself).
 */
export function CategoryBreakdownChart({ emails }: { emails: Email[] }) {
  const data = useMemo(() => computeCategoryBreakdown(emails), [emails]);
  const hasData = data.some((entry) => entry.count > 0);

  const chart = !hasData ? (
    <EmptyState />
  ) : (
    <div style={{ height: Math.max(data.length * 40, 160) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 36, left: 8, bottom: 4 }} barCategoryGap={12}>
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="category"
            tickFormatter={(category: EmailCategory) => CATEGORY_META[category].label}
            tick={{ fill: "var(--foreground)", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={96}
          />
          <Tooltip content={CategoryTooltip} cursor={{ fill: "var(--muted)" }} />
          <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false}>
            {data.map((entry) => (
              <Cell key={entry.category} fill={CATEGORY_COLOR[entry.category]} />
            ))}
            <LabelList
              dataKey="percentage"
              position="right"
              formatter={(value) => `${Math.round(Number(value))}%`}
              fill="var(--muted-foreground)"
              fontSize={12}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );

  return (
    <ChartCard
      id="category-breakdown-chart"
      title="Category breakdown"
      description="Share of triaged emails by category"
      chart={chart}
      table={<CategoryTable data={data} />}
    />
  );
}
