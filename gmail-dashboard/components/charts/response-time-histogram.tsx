"use client";

// Phase 5: data now comes from GET /api/analytics/response-times
// (app/analytics/page.tsx) instead of a hardcoded fixture distribution.
import type { ResponseTimesResult } from "@/lib/data/use-analytics";

const TARGET_HOURS_LABEL = "12-24h"; // your reply-time target band

export function ResponseTimeHistogram({ data }: { data: ResponseTimesResult }) {
  const { buckets, averageHours, sampleCount } = data;
  const max = Math.max(1, ...buckets.map((b) => b.count));

  return (
    <div>
      <h3 className="mb-3 font-narrow text-[11px] font-bold uppercase tracking-wider text-ink-tertiary">
        Response time distribution
      </h3>
      {sampleCount === 0 ? (
        <p className="py-8 text-center text-xs text-ink-tertiary">
          Not enough reply history yet — this fills in once outbound replies are ingested.
        </p>
      ) : (
        <>
          <div className="relative h-28" role="img" aria-label="Histogram of your reply times, bucketed in hours">
            <div className="absolute inset-0 flex items-end gap-1.5">
              {buckets.map((b) => {
                const isTarget = b.label === TARGET_HOURS_LABEL;
                return (
                  <div
                    key={b.label}
                    className="flex-1 rounded-t-sm"
                    style={{
                      height: `${Math.max(2, (b.count / max) * 100)}%`,
                      background: isTarget ? "var(--departure)" : "var(--rule-strong)",
                    }}
                  />
                );
              })}
            </div>
          </div>
          <div className="border-t border-rule-strong" />
          <div className="mt-1.5 flex gap-1.5">
            {buckets.map((b) => (
              <span key={b.label} className="flex-1 text-center text-[10px] tabular text-ink-tertiary">
                {b.label}
              </span>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-tertiary">
            Your average:{" "}
            <span className="tabular font-semibold text-ink">
              {averageHours === null ? "—" : `${averageHours.toFixed(1)}h`}
            </span>{" "}
            · Target: <span className="tabular font-semibold text-departure">within 24h</span>
          </p>
        </>
      )}
    </div>
  );
}
