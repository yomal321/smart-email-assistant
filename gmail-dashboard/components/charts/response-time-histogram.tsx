"use client";

// Bucketed response times (hours) — fixture distribution skewed toward fast replies with a long tail.
const BUCKETS = [
  { label: "0-2h", count: 22 },
  { label: "2-6h", count: 31 },
  { label: "6-12h", count: 18 },
  { label: "12-24h", count: 11 },
  { label: "1-2d", count: 7 },
  { label: "2-4d", count: 4 },
  { label: "4d+", count: 3 },
];

const TARGET_HOURS_LABEL = "12-24h"; // your reply-time target band

export function ResponseTimeHistogram() {
  const max = Math.max(...BUCKETS.map((b) => b.count));

  return (
    <div>
      <h3 className="mb-3 font-narrow text-[11px] font-bold uppercase tracking-wider text-ink-tertiary">
        Response time distribution
      </h3>
      <div className="relative h-28" role="img" aria-label="Histogram of your reply times, bucketed in hours">
        <div className="absolute inset-0 flex items-end gap-1.5">
          {BUCKETS.map((b) => {
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
        {BUCKETS.map((b) => (
          <span key={b.label} className="flex-1 text-center text-[10px] tabular text-ink-tertiary">
            {b.label}
          </span>
        ))}
      </div>
      <p className="mt-2 text-xs text-ink-tertiary">
        Your average: <span className="tabular font-semibold text-ink">6.4h</span> · Target:{" "}
        <span className="tabular font-semibold text-departure">within 24h</span>
      </p>
    </div>
  );
}
