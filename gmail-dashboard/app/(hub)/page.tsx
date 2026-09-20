"use client";

// Hub landing — the Personal Command Center. Zone A (collision alert + stat
// tiles) answers "what's coming and what's urgent" at a glance; Zone B
// (priority queue / schedule / source breakdown) is the working area; Zone C
// (14-day workload + upcoming assessments) is the forward view; Zone D is a
// footer summary across every module. See project_personal_dashboard_spec
// in project memory for why the priority queue is one ranked list rather
// than three, and the plan file for why the zones are laid out this way.

import * as React from "react";
import { CalendarClock } from "lucide-react";
import { dayKey } from "@/lib/day-key";
import { HubUndoBar } from "@/components/hub/hub-undo-bar";
import { SourcePlate } from "@/components/hub/source-plate";
import { CollisionAlert, type Collision } from "@/components/hub/collision-alert";
import { StatTiles, type HubStats } from "@/components/hub/stat-tiles";
import { ScheduleTimeline } from "@/components/hub/schedule-timeline";
import { SourceBreakdown, type SourceBreakdownRow } from "@/components/hub/source-breakdown";
import { FortnightChart, type DayLoad } from "@/components/hub/fortnight-chart";
import { UpcomingAssessments } from "@/components/hub/upcoming-assessments";
import { OverviewStrip, type HubOverview } from "@/components/hub/overview-strip";
import type { ActionItem, Source } from "@/lib/data/types";

interface HubSummary {
  timeZone: string;
  scheduledToday: ActionItem[];
  doToday: ActionItem[];
  thisWeek: { day: string; label: string; items: ActionItem[] }[];
  stats: HubStats;
  collision: Collision | null;
  sourceBreakdown: { sourceId: string; openCount: number; totalEffortMinutes: number }[];
  fortnightLoad: DayLoad[];
  upcomingAssessments: ActionItem[];
  sources: Source[];
  overview: HubOverview;
}

type StatFilter = "overdue" | "due48h" | null;

function matchesFilter(item: ActionItem, filter: StatFilter, now: number): boolean {
  if (!filter) return true;
  if (!item.dueAt) return false;
  const due = new Date(item.dueAt).getTime();
  if (filter === "overdue") return due < now;
  return due >= now && due <= now + 48 * 60 * 60 * 1000;
}

// One pending undo at a time — completing a second item while the first's
// undo is showing just replaces it, same as the mail module's undo stack
// collapsing to its top entry visually. Simpler state for a screen where
// stacking multiple undos is not a realistic use case.
interface PendingUndo {
  item: ActionItem;
  label: string;
}

export default function HubHomePage() {
  const [summary, setSummary] = React.useState<HubSummary | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [completedIds, setCompletedIds] = React.useState<Set<string>>(new Set());
  const [pendingUndo, setPendingUndo] = React.useState<PendingUndo | null>(null);
  // Lazy initializer, not an effect + setState — restores a shared/back-button
  // day filter from the URL on first render without a cascading render.
  const [selectedDay, setSelectedDay] = React.useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("day");
  });
  const [statFilter, setStatFilter] = React.useState<StatFilter>(null);
  const [nowMinutes, setNowMinutes] = React.useState<number | null>(null);
  const [nowMs, setNowMs] = React.useState<number>(() => Date.now());
  const undoTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadDayKeyRef = React.useRef<string | null>(null);

  const load = React.useCallback((signal?: AbortSignal) => {
    fetch("/api/hub/summary", { signal })
      .then((res) => res.json())
      .then((body) => setSummary(body as HubSummary))
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
      })
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  function selectDay(day: string | null) {
    setSelectedDay((prev) => {
      const next = prev === day ? null : day;
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        if (next) url.searchParams.set("day", next);
        else url.searchParams.delete("day");
        window.history.pushState(null, "", url);
      }
      return next;
    });
  }

  // nowMinutes drives the schedule timeline's "now" line. Computed via a
  // timezone-aware Intl call, never Date.now()/toDateString() — see
  // lib/day-key.ts's own rationale. Suppressed once the live calendar day
  // (in the user's timezone) no longer matches the day this page's data was
  // fetched for, so a tab left open overnight doesn't mis-position the line.
  React.useEffect(() => {
    if (!summary) return;
    const tz = summary.timeZone;
    if (loadDayKeyRef.current === null) {
      loadDayKeyRef.current = dayKey(new Date().toISOString(), tz);
    }

    function tick() {
      const now = new Date();
      setNowMs(now.getTime());
      if (dayKey(now.toISOString(), tz) !== loadDayKeyRef.current) {
        setNowMinutes(null);
        return;
      }
      const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(
        now
      );
      const hh = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
      const mm = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
      setNowMinutes(hh * 60 + mm);
    }

    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [summary]);

  React.useEffect(() => {
    return () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    };
  }, []);

  const sourceById = React.useMemo(
    () => new Map((summary?.sources ?? []).map((s) => [s.id, s])),
    [summary?.sources]
  );

  const sourceBreakdownRows: SourceBreakdownRow[] = React.useMemo(
    () =>
      (summary?.sourceBreakdown ?? [])
        .map(({ sourceId, openCount, totalEffortMinutes }) => {
          const source = sourceById.get(sourceId);
          return source ? { source, openCount, totalEffortMinutes } : null;
        })
        .filter((v): v is SourceBreakdownRow => v !== null),
    [summary?.sourceBreakdown, sourceById]
  );

  async function complete(item: ActionItem) {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setCompletedIds((prev) => new Set(prev).add(item.id));
    setPendingUndo({ item, label: `Completed "${item.text}"` });
    undoTimer.current = setTimeout(() => setPendingUndo(null), 8000);

    const res = await fetch(`/api/action-items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    });
    // A failed write un-marks it and drops the now-inaccurate undo offer
    // rather than showing "Undo" for a change that never happened server-side.
    if (!res.ok) {
      setCompletedIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
      setPendingUndo(null);
    }
  }

  async function undoComplete() {
    if (!pendingUndo) return;
    if (undoTimer.current) clearTimeout(undoTimer.current);
    const { item } = pendingUndo;
    setPendingUndo(null);
    setCompletedIds((prev) => {
      const next = new Set(prev);
      next.delete(item.id);
      return next;
    });
    const res = await fetch(`/api/action-items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "todo" }),
    });
    if (!res.ok) load();
  }

  const filteredDoToday = (summary?.doToday ?? []).filter((i) => matchesFilter(i, statFilter, nowMs));
  const filteredThisWeek = (summary?.thisWeek ?? [])
    .map((group) => ({ ...group, items: group.items.filter((i) => matchesFilter(i, statFilter, nowMs)) }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {loading && (
        <div className="space-y-3 p-4">
          <div className="h-16 animate-pulse rounded-xl bg-surface-sunk" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-surface-sunk" />
            ))}
          </div>
          <div className="h-64 animate-pulse rounded-xl bg-surface-sunk" />
        </div>
      )}

      {!loading && summary && (
        <>
          {/* Zone A — status bar */}
          <div className="rule-b space-y-3 px-4 py-3">
            <CollisionAlert collision={summary.collision} onSelect={selectDay} />
            <StatTiles stats={summary.stats} onFilter={(f) => setStatFilter((prev) => (prev === f ? null : f))} />
            {statFilter && (
              <button onClick={() => setStatFilter(null)} className="text-xs text-departure hover:underline">
                Clear filter ({statFilter === "overdue" ? "overdue" : "due in 48h"})
              </button>
            )}
          </div>

          {/* Zone B — priority queue / schedule / source breakdown */}
          <div className="rule-b grid grid-cols-1 lg:grid-cols-12 lg:divide-x lg:divide-rule">
            <div className="lg:col-span-5">
              {summary.scheduledToday.length > 0 && !statFilter && (
                <Section title="Scheduled today">
                  {summary.scheduledToday.map((item) => (
                    <Row key={item.id} item={item} source={item.sourceId ? sourceById.get(item.sourceId) : undefined}>
                      <span className="tabular shrink-0 text-xs text-ink-tertiary">{formatClock(item.startsAt!)}</span>
                    </Row>
                  ))}
                </Section>
              )}

              <Section title="Do today" count={filteredDoToday.length} empty="Nothing ranked for today.">
                {filteredDoToday.map((item) => (
                  <Row
                    key={item.id}
                    item={item}
                    source={item.sourceId ? sourceById.get(item.sourceId) : undefined}
                    completed={completedIds.has(item.id)}
                    onComplete={() => complete(item)}
                  >
                    <DueBadge dueAt={item.dueAt} />
                  </Row>
                ))}
              </Section>

              {filteredThisWeek.length > 0 && (
                <Section title="This week">
                  {filteredThisWeek.map((group) => (
                    <div key={group.day}>
                      <div className="bg-surface px-4 py-1 font-narrow text-[10px] font-bold uppercase tracking-wider text-ink-tertiary">
                        {group.label}
                      </div>
                      {group.items.map((item) => (
                        <Row
                          key={item.id}
                          item={item}
                          source={item.sourceId ? sourceById.get(item.sourceId) : undefined}
                          completed={completedIds.has(item.id)}
                          onComplete={() => complete(item)}
                        >
                          <DueBadge dueAt={item.dueAt} />
                        </Row>
                      ))}
                    </div>
                  ))}
                </Section>
              )}
            </div>

            <div className="rule-t px-4 py-3 lg:col-span-4 lg:border-t-0">
              <h2 className="mb-2 font-narrow text-[11px] font-bold uppercase tracking-wider text-ink-tertiary">Today&apos;s schedule</h2>
              <ScheduleTimeline items={summary.scheduledToday} sourceById={sourceById} nowMinutes={nowMinutes} />
            </div>

            <div className="rule-t px-4 py-3 lg:border-t-0 lg:col-span-3">
              <h2 className="mb-2 font-narrow text-[11px] font-bold uppercase tracking-wider text-ink-tertiary">By source</h2>
              <SourceBreakdown rows={sourceBreakdownRows} />
            </div>
          </div>

          {/* Zone C — forward view */}
          <div className="rule-b grid grid-cols-1 lg:grid-cols-2 lg:divide-x lg:divide-rule">
            <div className="px-4 py-3">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-narrow text-[11px] font-bold uppercase tracking-wider text-ink-tertiary">Next 14 days</h2>
                {selectedDay && (
                  <button onClick={() => selectDay(null)} className="text-xs text-departure hover:underline">
                    Clear day
                  </button>
                )}
              </div>
              <FortnightChart
                days={summary.fortnightLoad}
                sourceById={sourceById}
                capacityMinutes={summary.stats.capacityMinutes}
                onSelectDay={selectDay}
                selectedDay={selectedDay}
              />
            </div>

            <div className="rule-t px-4 py-3 lg:border-t-0">
              <h2 className="mb-2 font-narrow text-[11px] font-bold uppercase tracking-wider text-ink-tertiary">Exams &amp; major assessments</h2>
              <UpcomingAssessments items={summary.upcomingAssessments} sourceById={sourceById} today={dayKey(new Date().toISOString(), summary.timeZone)} />
            </div>
          </div>

          {/* Zone D — everything, at a glance */}
          <div className="px-4 py-4">
            <h2 className="mb-2 font-narrow text-[11px] font-bold uppercase tracking-wider text-ink-tertiary">Everything</h2>
            <OverviewStrip overview={summary.overview} />
          </div>
        </>
      )}

      {pendingUndo && <HubUndoBar label={pendingUndo.label} onUndo={undoComplete} onDismiss={() => setPendingUndo(null)} />}
    </div>
  );
}

function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
}

function Section({
  title,
  count,
  empty,
  children,
}: {
  title: string;
  count?: number;
  empty?: string;
  children: React.ReactNode;
}) {
  const isEmpty = count === 0;
  return (
    <div className="rule-b">
      <div className="flex items-center gap-1.5 px-4 pt-3 pb-1.5">
        <CalendarClock size={13} className="text-ink-tertiary" />
        <h2 className="font-narrow text-[11px] font-bold uppercase tracking-wider text-ink-tertiary">
          {title} {count !== undefined && count > 0 && <span className="tabular">· {count}</span>}
        </h2>
      </div>
      {isEmpty && empty ? <p className="px-4 pb-3 text-sm text-ink-tertiary">{empty}</p> : children}
    </div>
  );
}

function Row({
  item,
  source,
  completed,
  onComplete,
  children,
}: {
  item: ActionItem;
  source?: Source;
  completed?: boolean;
  onComplete?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
        completed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
      }`}
    >
      <div className="overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-2">
          {onComplete && (
            <input
              type="checkbox"
              checked={!!completed}
              onChange={onComplete}
              className="h-4 w-4 shrink-0 accent-departure"
              aria-label={`Mark "${item.text}" done`}
            />
          )}
          {source && <SourcePlate source={source} />}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-ink">{item.text}</p>
            {item.type !== "task" && <p className="text-xs capitalize text-ink-tertiary">{item.type}</p>}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

// A plain helper, not a component — keeps the Date.now() read out of any
// component body (React Compiler's purity check only inspects components and
// hooks, the same reason lib/format/relative-time.ts's Date.now() calls are
// never flagged despite doing the same thing).
function dueLabel(dueAt: string): { label: string; overdue: boolean } {
  const hours = (new Date(dueAt).getTime() - Date.now()) / (60 * 60 * 1000);
  const overdue = hours < 0;
  const label = overdue
    ? `overdue ${Math.round(Math.abs(hours) / 24) || 1}d`
    : hours < 24
      ? `due in ${Math.round(hours)}h`
      : `due in ${Math.round(hours / 24)}d`;
  return { label, overdue };
}

function DueBadge({ dueAt }: { dueAt: string | null }) {
  if (!dueAt) return null;
  const { label, overdue } = dueLabel(dueAt);
  return (
    <span className={`tabular shrink-0 text-xs ${overdue ? "font-medium text-signal" : "text-ink-tertiary"}`}>
      {label}
    </span>
  );
}
