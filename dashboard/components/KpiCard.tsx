import type { SVGProps } from "react";

type IconComponent = (props: SVGProps<SVGSVGElement>) => React.JSX.Element;

export interface KpiTrend {
  /** Percent change vs. the fixture data's prior period (from `percentChange` in `lib/analytics.ts`). */
  percent: number;
}

export interface KpiCardProps {
  label: string;
  /** Already-formatted current value (e.g. "24", "68%", "3h 20m", "—" when there's no data yet). */
  value: string;
  icon: IconComponent;
  /**
   * `null` when there's no comparable prior-period value to compare against
   * (e.g. zero drafts overall) — renders `emptyTrendLabel` instead of a
   * percentage so the card never shows `NaN`/`Infinity`.
   */
  trend: KpiTrend | null;
  emptyTrendLabel?: string;
}

function TrendArrowIcon({
  direction,
  ...props
}: SVGProps<SVGSVGElement> & { direction: "up" | "down" }) {
  return (
    <svg viewBox="0 0 12 12" fill="none" aria-hidden {...props}>
      {direction === "up" ? (
        <path
          d="M6 10V2M2.5 5.5 6 2l3.5 3.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <path
          d="M6 2v8M2.5 6.5 6 10l3.5-3.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

/**
 * A single KPI card: label, current value, and a trend indicator against the
 * fixture data's own prior period. The trend is never color-only — an arrow
 * icon (shape differs by direction) and a signed percentage carry the same
 * information as the color.
 */
export function KpiCard({ label, value, icon: Icon, trend, emptyTrendLabel = "No prior-period data" }: KpiCardProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      {trend === null ? (
        <p className="mt-1 text-xs text-muted-foreground">{emptyTrendLabel}</p>
      ) : trend.percent === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">No change vs prior period</p>
      ) : (
        <p
          className={`mt-1 inline-flex items-center gap-1 text-xs font-medium tabular-nums ${
            trend.percent > 0 ? "text-trend-up" : "text-trend-down"
          }`}
        >
          <TrendArrowIcon direction={trend.percent > 0 ? "up" : "down"} className="h-3 w-3" />
          {trend.percent > 0 ? "+" : ""}
          {Math.round(trend.percent)}% vs prior period
        </p>
      )}
    </div>
  );
}
