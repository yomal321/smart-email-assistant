import { getVolumeTrend } from "@/lib/data";
import { VolumeTrend } from "@/components/charts/volume-trend";
import { BusiestHoursHeatmap } from "@/components/charts/busiest-hours-heatmap";
import { CategoryBreakdown } from "@/components/charts/category-breakdown";
import { ResponseTimeHistogram } from "@/components/charts/response-time-histogram";

export default function AnalyticsPage() {
  const volumeTrend = getVolumeTrend();

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="border-b border-rule px-4 py-4">
        <h1 className="text-lg font-semibold text-ink">Analytics</h1>
        <p className="text-sm text-ink-secondary">Volume, response time, and how well the AI is doing.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-2">
        <div className="card-surface p-3.5">
          <VolumeTrend data={volumeTrend} />
        </div>
        <div className="card-surface p-3.5">
          <ResponseTimeHistogram />
        </div>
        <div className="card-surface p-3.5">
          <CategoryBreakdown />
        </div>
        <div className="card-surface p-3.5">
          <BusiestHoursHeatmap />
        </div>
      </div>

      {/* AI performance — every figure here is fixture data, footnoted per PRODUCT.md */}
      <div className="px-4 pb-8">
        <h2 className="mb-2 font-narrow text-[11px] font-bold uppercase tracking-wider text-ink-tertiary">
          AI performance
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <PerfCell label="Classification accuracy" value="91%" />
          <PerfCell label="Draft acceptance rate" value="68%" />
          <PerfCell label="Drafts edited before send" value="74%" />
          <PerfCell label="Est. time saved / week" value="3.2h" />
        </div>
        <p className="mt-2 text-xs text-ink-tertiary">
          Prototype figures from fixture data, not measured results.
        </p>
      </div>
    </div>
  );
}

function PerfCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="card-surface p-3.5">
      <div className="text-2xl font-extrabold tabular text-ink">{value}</div>
      <div className="font-narrow text-[10px] font-bold uppercase tracking-wider text-ink-tertiary">{label}</div>
    </div>
  );
}
