"use client";

// Phase 5 (PHASE-5-IMPLEMENTATION-PLAN.md Wave 3): every chart here now
// reads real data through the four analytics hooks instead of a fixture
// array/synthetic formula, and the volume chart is finally wired to
// /api/analytics/volume (built in an earlier pass, never called until now).
import {
  useVolumeTrend,
  useResponseTimes,
  useCategoryBreakdown,
  useBusiestHours,
  useAiPerformance,
} from "@/lib/data/use-analytics";
import { VolumeTrend } from "@/components/charts/volume-trend";
import { BusiestHoursHeatmap } from "@/components/charts/busiest-hours-heatmap";
import { CategoryBreakdown } from "@/components/charts/category-breakdown";
import { ResponseTimeHistogram } from "@/components/charts/response-time-histogram";

export default function AnalyticsPage() {
  const { data: volumeTrend, loading: volumeLoading } = useVolumeTrend();
  const { data: responseTimes, loading: responseTimesLoading } = useResponseTimes();
  const { data: categoryBreakdown, loading: categoryBreakdownLoading } = useCategoryBreakdown();
  const { data: busiestHours, loading: busiestHoursLoading } = useBusiestHours();
  const { data: aiPerformance } = useAiPerformance();

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="border-b border-rule px-4 py-4">
        <h1 className="text-lg font-semibold text-ink">Analytics</h1>
        <p className="text-sm text-ink-secondary">Volume, response time, and how well the AI is doing.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-2">
        <div className="card-surface p-3.5">
          {volumeLoading || !volumeTrend ? <ChartLoading /> : <VolumeTrend data={volumeTrend} />}
        </div>
        <div className="card-surface p-3.5">
          {responseTimesLoading || !responseTimes ? <ChartLoading /> : <ResponseTimeHistogram data={responseTimes} />}
        </div>
        <div className="card-surface p-3.5">
          {categoryBreakdownLoading || !categoryBreakdown ? (
            <ChartLoading />
          ) : (
            <CategoryBreakdown data={categoryBreakdown} />
          )}
        </div>
        <div className="card-surface p-3.5">
          {busiestHoursLoading || !busiestHours ? <ChartLoading /> : <BusiestHoursHeatmap data={busiestHours} />}
        </div>
      </div>

      <div className="px-4 pb-8">
        <h2 className="mb-2 font-narrow text-[11px] font-bold uppercase tracking-wider text-ink-tertiary">
          AI performance
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <PerfCell label="Classification accuracy" value={formatPercent(aiPerformance?.classificationAccuracy)} />
          <PerfCell label="Draft acceptance rate" value={formatPercent(aiPerformance?.draftAcceptanceRate)} />
          <PerfCell label="Drafts edited before send" value={formatPercent(aiPerformance?.draftsEditedBeforeSendRate)} />
          <PerfCell
            label="Est. time saved / week"
            value={aiPerformance ? `${(aiPerformance.timeSavedMinutes / 60).toFixed(1)}h` : "—"}
          />
        </div>
        <p className="mt-2 text-xs text-ink-tertiary">
          {aiPerformance
            ? `Measured over the last ${aiPerformance.windowDays} days. "Est. time saved" is a heuristic estimate, not a measured result — every other figure above is real.`
            : "Loading…"}
        </p>
      </div>
    </div>
  );
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${Math.round(value * 100)}%`;
}

function ChartLoading() {
  return <div className="flex h-40 items-center justify-center text-xs text-ink-tertiary">Loading…</div>;
}

function PerfCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="card-surface p-3.5">
      <div className="text-2xl font-extrabold tabular text-ink">{value}</div>
      <div className="font-narrow text-[10px] font-bold uppercase tracking-wider text-ink-tertiary">{label}</div>
    </div>
  );
}
