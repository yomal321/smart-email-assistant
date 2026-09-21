"use client";

// Hub Bot page — everything the /bot page can honestly show about the
// assistant bot, per BOT-PAGE-PLAN.md. The bot itself runs in n8n and talks
// to Telegram directly; this page is built around three different kinds of
// "what can this page say" rather than one:
//
//   - What the bot can do (command reference, push schedule) — static,
//     sourced from 012-assistant-bot's spec and the workflows' own trigger
//     config, since nothing in Supabase describes bot *behaviour*.
//   - What it has done (activity log, stats) — real data from
//     bot_notifications, but only ever a log of the past, never a live
//     status.
//   - Whether it's actually working right now (health) — the one section
//     backed by a genuine check, via n8n's own API. Every other section on
//     this page could theoretically look fine while the bot is dead; this
//     one can't.
//
// See BOT-PAGE-PLAN.md §3 for why half of "what it has done" was invisible
// before 0018_bot_observability.sql, and why a fabricated "online" dot is
// deliberately not here.

import * as React from "react";
import Link from "next/link";
import {
  Bot as BotIcon,
  AlertTriangle,
  Clock3,
  Sunrise,
  Moon,
  MessageCircleQuestion,
  CheckCircle2,
  XCircle,
  HelpCircle,
  TrendingUp,
  CalendarRange,
} from "lucide-react";
import { EmptyState } from "@/components/board/empty-state";
import { formatFullDateTime, formatRelativeToNow } from "@/lib/format/relative-time";
import { StatCard, IconChip, StatusPill, type Tone } from "@/components/hub/primitives";
import { WorkflowDetailSheet } from "@/components/hub/workflow-detail-sheet";

type NotificationType = "urgent_alert" | "deadline_nudge" | "morning_brief" | "evening_review";

interface BotActivity {
  id: string;
  type: NotificationType;
  sentAt: string;
  label: string | null;
  href: string | null;
}

interface BotStats {
  totalAllTime: number;
  total7d: number;
  total30d: number;
  byType: Record<NotificationType, number>;
  busiestDay: { day: string; count: number } | null;
  freeText: { usedToday: number; cap: number };
}

interface WorkflowHealth {
  name: string;
  found: boolean;
  active: boolean | null;
  lastExecutionAt: string | null;
  lastStatus: string | null;
}

type BotHealth = { available: true; workflows: WorkflowHealth[] } | { available: false; reason?: string };

// Shared by HealthCard's checklist and WorkflowMap's node dots, so the two
// views of the same health data never silently disagree on what counts as
// healthy/failing/unknown.
function workflowTone(w: WorkflowHealth): Tone {
  if (!w.found) return "neutral";
  if (w.lastStatus === "success") return "success";
  if (w.lastStatus === "error") return "danger";
  return "neutral";
}

const TYPE_META: Record<NotificationType, { label: string; icon: React.ElementType; iconClass: string }> = {
  urgent_alert: { label: "Urgent/VIP alert", icon: AlertTriangle, iconClass: "text-signal" },
  deadline_nudge: { label: "Deadline nudge", icon: Clock3, iconClass: "text-ink-tertiary" },
  morning_brief: { label: "Morning Brief", icon: Sunrise, iconClass: "text-departure" },
  evening_review: { label: "Evening Review", icon: Moon, iconClass: "text-ink-tertiary" },
};

const ALL_TYPES: NotificationType[] = ["urgent_alert", "deadline_nudge", "morning_brief", "evening_review"];

// Push schedule (option A2). The four trigger hours below are read directly
// out of n8n/workflows/assistant-scheduler.json's Schedule Trigger nodes
// (triggerAtHour / minutesInterval) as of this build — they are not stored
// anywhere the dashboard can query, so this is a snapshot, not a live read.
// If the schedule is edited in n8n without updating this list, this page
// will quietly go stale; there's no way around that short of option C1
// reading trigger config too, which it currently doesn't.
const PUSH_SCHEDULE: { name: string; when: string; icon: React.ElementType; logged: boolean }[] = [
  { name: "Morning Brief", when: "Daily at 07:00", icon: Sunrise, logged: true },
  { name: "Deadline nudge", when: "Daily at 08:00, per overdue task", icon: Clock3, logged: true },
  { name: "Urgent/VIP alert", when: "Polled every 5 minutes", icon: AlertTriangle, logged: true },
  { name: "Evening Review", when: "Daily at 19:00", icon: Moon, logged: true },
];

function formatCount(n: number): string {
  return n.toLocaleString();
}

export default function HubBotPage() {
  const [activity, setActivity] = React.useState<BotActivity[]>([]);
  const [activityLoading, setActivityLoading] = React.useState(true);
  const [stats, setStats] = React.useState<BotStats | null>(null);
  const [statsError, setStatsError] = React.useState(false);
  const [health, setHealth] = React.useState<BotHealth | null>(null);
  const [typeFilter, setTypeFilter] = React.useState<NotificationType | null>(null);
  const [selectedWorkflow, setSelectedWorkflow] = React.useState<string | null>(null);

  const loadActivity = React.useCallback((filter: NotificationType | null, signal?: AbortSignal) => {
    const qs = filter ? `?type=${filter}` : "";
    fetch(`/api/hub/bot-activity${qs}`, { signal })
      .then((res) => res.json())
      .then((body) => setActivity(Array.isArray(body) ? body : []))
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
      })
      .finally(() => setActivityLoading(false));
  }, []);

  React.useEffect(() => {
    const controller = new AbortController();
    loadActivity(typeFilter, controller.signal);
    return () => controller.abort();
  }, [typeFilter, loadActivity]);

  React.useEffect(() => {
    const controller = new AbortController();
    fetch("/api/hub/bot-stats", { signal: controller.signal })
      .then(async (res) => {
        const body = await res.json();
        // The route returns { error: string } with a non-2xx status on
        // failure (a Supabase hiccup, a cold start) — setting that
        // error-shaped body as `stats` directly was the actual bug here:
        // BotStatRow's `!stats` guard treats any truthy object as real
        // data and reads straight into `stats.freeText`, which an error
        // body doesn't have. Reproduced live via a hard refresh, not
        // hypothetical.
        if (!res.ok || !body || typeof body.freeText !== "object") {
          setStatsError(true);
          return;
        }
        setStats(body);
        setStatsError(false);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setStatsError(true);
      });
    fetch("/api/hub/bot-health", { signal: controller.signal })
      .then((res) => res.json())
      .then((body) => setHealth(body))
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
      });
    return () => controller.abort();
  }, []);

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-ground">
      <div className="rule-b space-y-4 bg-surface px-4 py-3">
        <div>
          <h1 className="text-lg font-semibold text-ink">Assistant bot</h1>
          <p className="text-sm text-ink-secondary">
            Telegram, reading the same data as everything else. What it&apos;s sent, and whether it&apos;s actually running.
          </p>
        </div>
        <BotStatRow stats={stats} error={statsError} />
      </div>

      <div className="space-y-4 p-4">
        {/* Both columns stretch to the row's tallest (grid default) so the
            two bottoms land flush. The earlier dead-space problem was a
            single short card stretching in isolation; now the right column
            has two cards worth distributing the leftover height *between*
            (justify-between + gap, so the gap grows rather than either
            card's own content getting padded out and looking sparse again). */}
        <div className="grid gap-4 lg:grid-cols-2">
          <PushScheduleCard />
          <div className="flex h-full flex-col justify-between gap-4">
            <HealthCard health={health} onSelectWorkflow={setSelectedWorkflow} />
            <BreakdownCard stats={stats} error={statsError} />
          </div>
        </div>
      </div>

      <WorkflowDetailSheet workflowName={selectedWorkflow} onClose={() => setSelectedWorkflow(null)} />

      <div className="rule-b flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <h2 className="font-narrow text-[11px] font-bold uppercase tracking-wider text-ink-tertiary">Activity</h2>
        <div className="flex flex-wrap gap-1.5">
          <FilterChip
            label="All"
            active={typeFilter === null}
            onClick={() => {
              setActivityLoading(true);
              setTypeFilter(null);
            }}
          />
          {ALL_TYPES.map((t) => (
            <FilterChip
              key={t}
              label={TYPE_META[t].label}
              active={typeFilter === t}
              onClick={() => {
                setActivityLoading(true);
                setTypeFilter(t);
              }}
            />
          ))}
        </div>
      </div>

      {activityLoading && <p className="px-4 py-6 text-sm text-ink-secondary">Loading…</p>}

      {!activityLoading && activity.length === 0 && (
        <EmptyState
          icon={BotIcon}
          heading="No activity yet."
          body={
            typeFilter
              ? `No ${TYPE_META[typeFilter].label.toLowerCase()} pushes recorded.`
              : "Urgent/VIP alerts, deadline nudges, and daily digests the bot sends will show up here."
          }
        />
      )}

      {!activityLoading &&
        activity.map((a) => {
          const meta = TYPE_META[a.type];
          const Icon = meta.icon;
          const row = (
            <div className="flex items-center gap-3 rule-b px-4 py-2.5">
              <Icon size={14} className={`shrink-0 ${meta.iconClass}`} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-ink">{a.label ?? meta.label}</p>
                <p className="text-xs text-ink-tertiary">{meta.label}</p>
              </div>
              <span className="shrink-0 text-xs text-ink-tertiary">{formatFullDateTime(a.sentAt)}</span>
            </div>
          );
          return a.href ? (
            <Link key={a.id} href={a.href} className="block transition-colors hover:bg-surface-sunk">
              {row}
            </Link>
          ) : (
            <div key={a.id}>{row}</div>
          );
        })}
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-pill border px-2.5 py-1 text-xs transition-colors ${
        active
          ? "border-departure bg-departure-field text-departure-field-ink font-medium"
          : "border-rule bg-surface text-ink-secondary hover:bg-surface-sunk"
      }`}
    >
      {label}
    </button>
  );
}

function PushScheduleCard() {
  return (
    <div className="rounded-xl border border-rule bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <BotIcon size={15} className="text-ink-tertiary" />
        <h2 className="font-narrow text-[11px] font-bold uppercase tracking-wider text-ink-tertiary">
          What it sends unprompted
        </h2>
      </div>
      <ul className="space-y-2.5">
        {PUSH_SCHEDULE.map((p) => {
          const Icon = p.icon;
          return (
            <li key={p.name} className="flex items-start gap-2.5">
              <Icon size={14} className="mt-0.5 shrink-0 text-ink-tertiary" />
              <div>
                <p className="text-sm text-ink">{p.name}</p>
                <p className="text-xs text-ink-tertiary">{p.when}</p>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 border-t border-rule pt-3 text-xs text-ink-tertiary">
        All four are logged below as of this build — Morning Brief and Evening Review weren&apos;t recorded before
        0018_bot_observability.sql, since the daily schedule needed no dedup key to protect against re-firing.
      </p>
    </div>
  );
}

// The stat bar, split into individual cards (matching the Today page's
// StatTiles) and shown at the top of the page rather than buried below the
// static reference cards — these numbers are what you actually open this
// page to check.
function BotStatRow({ stats, error }: { stats: BotStats | null; error: boolean }) {
  if (error) {
    return <p className="rounded-xl border border-rule bg-surface p-4 text-sm text-ink-secondary">Stats unavailable right now — try refreshing.</p>;
  }
  if (!stats) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-surface-sunk" />
        ))}
      </div>
    );
  }

  const budgetUsed = stats.freeText.usedToday >= stats.freeText.cap;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard icon={TrendingUp} tone="info" label="Last 7 days" value={formatCount(stats.total7d)} sublabel="alerts and nudges" />
      <StatCard icon={CalendarRange} tone="neutral" label="Last 30 days" value={formatCount(stats.total30d)} sublabel="alerts and nudges" />
      <StatCard icon={BotIcon} tone="primary" label="All time" value={formatCount(stats.totalAllTime)} sublabel="alerts and nudges" />
      <StatCard
        icon={MessageCircleQuestion}
        tone={budgetUsed ? "danger" : "neutral"}
        label="Free-text today"
        value={`${stats.freeText.usedToday} / ${stats.freeText.cap}`}
        sublabel={budgetUsed ? "budget used" : "questions asked"}
      />
    </div>
  );
}

// The by-type breakdown and busiest day, kept but demoted to a slim
// secondary card now that the headline numbers above are the stat bar.
function BreakdownCard({ stats, error }: { stats: BotStats | null; error: boolean }) {
  if (error || !stats) return null;

  return (
    <div className="rounded-xl border border-rule bg-surface p-4">
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {ALL_TYPES.map((t) => {
          const meta = TYPE_META[t];
          const Icon = meta.icon;
          return (
            <span key={t} className="flex items-center gap-1.5 text-xs text-ink-secondary">
              <Icon size={12} className={meta.iconClass} />
              {meta.label} <span className="tabular font-medium text-ink">{stats.byType[t] ?? 0}</span>
            </span>
          );
        })}
      </div>

      {stats.busiestDay && (
        <p className="mt-2 border-t border-rule pt-2 text-xs text-ink-tertiary">
          Busiest day in the last 30: <span className="tabular font-medium text-ink">{stats.busiestDay.day}</span> with{" "}
          <span className="tabular font-medium text-ink">{stats.busiestDay.count}</span> push
          {stats.busiestDay.count === 1 ? "" : "es"}.
        </p>
      )}
    </div>
  );
}

function HealthCard({ health, onSelectWorkflow }: { health: BotHealth | null; onSelectWorkflow: (name: string) => void }) {
  if (!health) {
    return <div className="rounded-xl border border-rule bg-surface p-4 text-sm text-ink-secondary">Checking live status…</div>;
  }

  if (!health.available) {
    return (
      <div className="rounded-xl border border-rule bg-surface p-4">
        <div className="flex items-center gap-2">
          <HelpCircle size={15} className="text-ink-tertiary" />
          <h2 className="font-narrow text-[11px] font-bold uppercase tracking-wider text-ink-tertiary">Live status</h2>
        </div>
        <p className="mt-2 text-sm text-ink-secondary">
          Unavailable{health.reason ? ` (${health.reason})` : ""} — the rest of this page still reflects real data,
          this section just can&apos;t reach n8n right now.
        </p>
      </div>
    );
  }

  const issueCount = health.workflows.filter((w) => !w.found || w.lastStatus === "error").length;
  const allHealthy = issueCount === 0;

  return (
    <div className="rounded-xl border border-rule bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CheckCircle2 size={15} className="text-accent-success" />
          <h2 className="font-narrow text-[11px] font-bold uppercase tracking-wider text-ink-tertiary">
            Live status — the four bot workflows in n8n
          </h2>
        </div>
        {/* An overall read at a glance, not just a checklist — this is what
            justifies the card existing at all, since "fine" should be
            visible without reading every row. */}
        <StatusPill tone={allHealthy ? "success" : "danger"}>
          {allHealthy ? "All operational" : `${issueCount} issue${issueCount === 1 ? "" : "s"}`}
        </StatusPill>
      </div>
      <ul className="space-y-1">
        {health.workflows.map((w) => {
          const tone = workflowTone(w);
          const Icon = !w.found ? HelpCircle : w.lastStatus === "success" ? CheckCircle2 : w.lastStatus === "error" ? XCircle : HelpCircle;
          const content = (
            <>
              <span className="flex items-center gap-2.5 text-ink">
                <IconChip icon={Icon} tone={tone} size="sm" />
                {w.name}
                {w.found && w.active === false && (
                  <span className="rounded-pill bg-surface-sunk px-1.5 py-0.5 text-[10px] font-medium text-ink-tertiary">
                    inactive
                  </span>
                )}
              </span>
              <span className="tabular shrink-0 text-xs text-ink-tertiary">
                {!w.found ? "not found in n8n" : w.lastExecutionAt ? `Last ran ${formatRelativeToNow(w.lastExecutionAt)}` : "No executions yet"}
              </span>
            </>
          );
          return (
            <li key={w.name}>
              {w.found ? (
                <button
                  onClick={() => onSelectWorkflow(w.name)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg px-1 py-1.5 text-left text-sm transition-colors hover:bg-surface-sunk"
                >
                  {content}
                </button>
              ) : (
                <div className="flex items-center justify-between gap-3 rounded-lg px-1 py-1.5 text-sm">{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
