"use client";

import { useMemo, type SVGProps } from "react";
import { emails } from "@/lib/data/fixtures";
import { useAppState } from "@/components/AppStateProvider";
import { KpiCard, type KpiTrend } from "@/components/KpiCard";
import { VolumeChart } from "@/components/VolumeChart";
import { CategoryBreakdownChart } from "@/components/CategoryBreakdownChart";
import {
  countTriagedEmails,
  countOpenTasks,
  computeDraftAcceptanceRate,
  computeAvgTimeToDraftMs,
  percentChange,
} from "@/lib/analytics";
import { formatDuration } from "@/lib/format";

function MailIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden {...props}>
      <rect x="2.5" y="4.5" width="15" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 5.5 10 11l7-5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TaskIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden {...props}>
      <rect x="3" y="3" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6.5 10.2 8.7 12.4 13.5 7.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AcceptanceIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden {...props}>
      <path
        d="M6 10.5 8.5 13 14 6.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="10" r="7.25" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function ClockIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden {...props}>
      <circle cx="10" cy="10" r="7.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 5.75V10l3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** `null` if either side of the comparison has no value to compare (see `KpiCard`'s `trend` doc). */
function trendFrom(current: number | null, previous: number | null): KpiTrend | null {
  if (current === null || previous === null) return null;
  const percent = percentChange(current, previous);
  return percent === null ? null : { percent };
}

export default function OverviewPage() {
  const { tasks, drafts } = useAppState();

  // Prior-period comparison: split the fixture emails in half by received_at
  // (oldest half = "previous period", newest half = "current period"), then
  // bucket tasks/drafts into the same two periods via their source email —
  // neither Task nor Draft carries its own independent "period" concept, so
  // this keeps every KPI's trend comparing the same two windows.
  const { currentPeriod, previousPeriod } = useMemo(() => {
    const sorted = [...emails].sort(
      (a, b) => new Date(a.received_at).getTime() - new Date(b.received_at).getTime()
    );
    const splitIndex = Math.ceil(sorted.length / 2);
    const previousEmails = sorted.slice(0, splitIndex);
    const currentEmails = sorted.slice(splitIndex);
    const previousIds = new Set(previousEmails.map((email) => email.id));
    const currentIds = new Set(currentEmails.map((email) => email.id));

    return {
      previousPeriod: {
        emails: previousEmails,
        tasks: tasks.filter((task) => previousIds.has(task.email_id)),
        drafts: drafts.filter((draft) => previousIds.has(draft.email_id)),
      },
      currentPeriod: {
        emails: currentEmails,
        tasks: tasks.filter((task) => currentIds.has(task.email_id)),
        drafts: drafts.filter((draft) => currentIds.has(draft.email_id)),
      },
    };
  }, [tasks, drafts]);

  const totalTriaged = countTriagedEmails(emails);
  const openTasks = countOpenTasks(tasks);
  const acceptanceRate = computeDraftAcceptanceRate(drafts);
  const avgTimeToDraftMs = computeAvgTimeToDraftMs(emails, drafts);

  const totalTriagedTrend = trendFrom(
    countTriagedEmails(currentPeriod.emails),
    countTriagedEmails(previousPeriod.emails)
  );
  const openTasksTrend = trendFrom(countOpenTasks(currentPeriod.tasks), countOpenTasks(previousPeriod.tasks));
  const acceptanceRateTrend = trendFrom(
    computeDraftAcceptanceRate(currentPeriod.drafts),
    computeDraftAcceptanceRate(previousPeriod.drafts)
  );
  // Full `emails` array passed for id lookup both times — only the drafts
  // side is scoped to a period, matching `computeAvgTimeToDraftMs`'s contract.
  const avgTimeToDraftTrend = trendFrom(
    computeAvgTimeToDraftMs(emails, currentPeriod.drafts),
    computeAvgTimeToDraftMs(emails, previousPeriod.drafts)
  );

  return (
    <div className="mx-auto w-full max-w-6xl p-4 sm:p-6">
      <header>
        <h1 className="text-lg font-semibold text-foreground">Overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A snapshot of triage, action items, and draft activity across the fixture inbox.
        </p>
      </header>

      <section
        aria-label="Key metrics"
        className="mt-4 grid grid-cols-1 divide-y divide-border rounded-lg border border-border bg-card lg:grid-cols-4 lg:divide-x lg:divide-y-0"
      >
        <KpiCard
          label="Emails triaged"
          value={totalTriaged.toLocaleString()}
          icon={MailIcon}
          trend={totalTriagedTrend}
        />
        <KpiCard label="Open tasks" value={openTasks.toLocaleString()} icon={TaskIcon} trend={openTasksTrend} />
        <KpiCard
          label="Draft acceptance rate"
          value={acceptanceRate === null ? "—" : `${Math.round(acceptanceRate * 100)}%`}
          icon={AcceptanceIcon}
          trend={acceptanceRateTrend}
          emptyTrendLabel="No drafts yet"
        />
        <KpiCard
          label="Avg. time to draft"
          value={avgTimeToDraftMs === null ? "—" : formatDuration(avgTimeToDraftMs)}
          icon={ClockIcon}
          trend={avgTimeToDraftTrend}
          emptyTrendLabel="No drafts yet"
        />
      </section>

      <div className="mt-6">
        <VolumeChart emails={emails} />
      </div>

      <div className="mt-6">
        <CategoryBreakdownChart emails={emails} />
      </div>
    </div>
  );
}
