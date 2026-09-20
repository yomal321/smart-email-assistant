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
} from "lucide-react";
import { EmptyState } from "@/components/board/empty-state";
import { formatFullDateTime, formatRelativeToNow } from "@/lib/format/relative-time";

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

const TYPE_META: Record<NotificationType, { label: string; icon: React.ElementType; iconClass: string }> = {
  urgent_alert: { label: "Urgent/VIP alert", icon: AlertTriangle, iconClass: "text-signal" },
  deadline_nudge: { label: "Deadline nudge", icon: Clock3, iconClass: "text-ink-tertiary" },
  morning_brief: { label: "Morning Brief", icon: Sunrise, iconClass: "text-departure" },
  evening_review: { label: "Evening Review", icon: Moon, iconClass: "text-ink-tertiary" },
};

const ALL_TYPES: NotificationType[] = ["urgent_alert", "deadline_nudge", "morning_brief", "evening_review"];

// Command reference (option A1). Sourced from .specclaw/changes/
// 012-assistant-bot/spec.md FR5/FR6 — not read from anywhere at runtime,
// since the commands are fixed n8n logic, not data. Update this list by
// hand if the Brain workflow's command set ever changes.
const COMMANDS: { command: string; description: string }[] = [
  { command: "/today", description: "Tasks due today, plus any open commitments (either direction)." },
  { command: "/urgent", description: "Unhandled emails with priority = urgent." },
  { command: "/deadlines", description: "Every open task with a deadline, soonest first." },
  { command: "/vip", description: "Unhandled emails from a contact flagged VIP." },
  { command: "/help", description: "Lists these commands, from the bot itself." },
];

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
  const [health, setHealth] = React.useState<BotHealth | null>(null);
  const [typeFilter, setTypeFilter] = React.useState<NotificationType | null>(null);

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
      .then((res) => res.json())
      .then((body) => setStats(body))
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
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
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="rule-b px-4 py-3">
        <h1 className="text-lg font-semibold text-ink">Assistant bot</h1>
        <p className="text-sm text-ink-secondary">
          Telegram, reading the same data as everything else. What it can do, what it&apos;s sent, and whether it&apos;s actually running.
        </p>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-2">
        <CommandReferenceCard />
        <PushScheduleCard />
      </div>

      <div className="px-4 pb-2">
        <HealthCard health={health} />
      </div>

      <div className="px-4 pb-4">
        <StatsCard stats={stats} />
      </div>

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

function CommandReferenceCard() {
  return (
    <div className="rounded-xl border border-rule bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <MessageCircleQuestion size={15} className="text-ink-tertiary" />
        <h2 className="font-narrow text-[11px] font-bold uppercase tracking-wider text-ink-tertiary">Commands</h2>
      </div>
      <dl className="space-y-2.5">
        {COMMANDS.map((c) => (
          <div key={c.command} className="flex flex-col gap-0.5">
            <dt className="font-mono text-sm font-medium text-ink">{c.command}</dt>
            <dd className="text-xs text-ink-secondary">{c.description}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 border-t border-rule pt-3">
        <p className="text-xs text-ink-secondary">
          Anything else is treated as a free-text question, answered from a shortlist of your own data by one LLM
          call — capped so it can never starve the triage/extraction pipeline of its own daily quota.
        </p>
      </div>
    </div>
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

function StatsCard({ stats }: { stats: BotStats | null }) {
  if (!stats) {
    return <div className="rounded-xl border border-rule bg-surface p-4 text-sm text-ink-secondary">Loading stats…</div>;
  }

  const budgetUsed = stats.freeText.usedToday >= stats.freeText.cap;

  return (
    <div className="rounded-xl border border-rule bg-surface p-4">
      <h2 className="mb-3 font-narrow text-[11px] font-bold uppercase tracking-wider text-ink-tertiary">Stats</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Last 7 days" value={formatCount(stats.total7d)} />
        <Stat label="Last 30 days" value={formatCount(stats.total30d)} />
        <Stat label="All time" value={formatCount(stats.totalAllTime)} />
        <Stat
          label="Free-text today"
          value={`${stats.freeText.usedToday} / ${stats.freeText.cap}`}
          tone={budgetUsed ? "signal" : undefined}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-rule pt-3">
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
        <p className="mt-3 text-xs text-ink-tertiary">
          Busiest day in the last 30: <span className="tabular font-medium text-ink">{stats.busiestDay.day}</span> with{" "}
          <span className="tabular font-medium text-ink">{stats.busiestDay.count}</span> push
          {stats.busiestDay.count === 1 ? "" : "es"}.
        </p>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "signal" }) {
  return (
    <div>
      <p className={`tabular text-lg font-semibold ${tone === "signal" ? "text-signal" : "text-ink"}`}>{value}</p>
      <p className="text-xs text-ink-tertiary">{label}</p>
    </div>
  );
}

function HealthCard({ health }: { health: BotHealth | null }) {
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

  return (
    <div className="rounded-xl border border-rule bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <CheckCircle2 size={15} className="text-cleared" />
        <h2 className="font-narrow text-[11px] font-bold uppercase tracking-wider text-ink-tertiary">
          Live status — the four bot workflows in n8n
        </h2>
      </div>
      <ul className="space-y-2">
        {health.workflows.map((w) => (
          <li key={w.name} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2 text-ink">
              {!w.found ? (
                <HelpCircle size={14} className="shrink-0 text-ink-tertiary" />
              ) : w.lastStatus === "success" ? (
                <CheckCircle2 size={14} className="shrink-0 text-cleared" />
              ) : w.lastStatus === "error" ? (
                <XCircle size={14} className="shrink-0 text-signal" />
              ) : (
                <HelpCircle size={14} className="shrink-0 text-ink-tertiary" />
              )}
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
          </li>
        ))}
      </ul>
    </div>
  );
}
