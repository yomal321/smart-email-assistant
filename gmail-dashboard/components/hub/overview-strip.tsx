// Zone D — the "everything at a glance" summary across every domain the hub
// covers, replacing the old sidebar's thin module link-cards with a footer
// strip: reference info you check occasionally, not centerpiece content
// competing with the Zone B/C panels for space.
import type { ComponentType } from "react";
import Link from "next/link";
import { CheckSquare, Target, StickyNote, Mail, Bot } from "lucide-react";
import { formatRelativeToNow } from "@/lib/format/relative-time";

export interface HubOverview {
  tasks: { openCount: number; overdueCount: number; doneThisWeekCount: number };
  plans: { activeCount: number; totalCount: number; avgProgressPct: number };
  notes: { count: number; lastCapturedAt: string | null };
  mail: { needsReplyCount: number; waitingOnOthersCount: number; connected: boolean; lastSyncAt: string | null };
  bot: { notifications7d: number; lastNotificationAt: string | null };
}

function Cell({
  href,
  icon: Icon,
  label,
  primary,
  secondary,
}: {
  href: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  label: string;
  primary: string;
  secondary?: string;
}) {
  return (
    <Link
      href={href}
      className="card-surface flex flex-col gap-1.5 px-3.5 py-3 transition-colors hover:border-departure"
    >
      <span className="flex items-center gap-1.5 text-ink-tertiary">
        <Icon size={14} />
        <span className="font-narrow text-[11px] font-bold uppercase tracking-wider">{label}</span>
      </span>
      <span className="tabular text-lg font-semibold text-ink">{primary}</span>
      {secondary && <span className="text-xs text-ink-tertiary">{secondary}</span>}
    </Link>
  );
}

export function OverviewStrip({ overview }: { overview: HubOverview }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <Cell
        href="/tasks"
        icon={CheckSquare}
        label="Tasks"
        primary={`${overview.tasks.openCount} open`}
        secondary={
          overview.tasks.overdueCount > 0
            ? `${overview.tasks.overdueCount} overdue`
            : `${overview.tasks.doneThisWeekCount} done this week`
        }
      />
      <Cell
        href="/plans"
        icon={Target}
        label="Plans"
        primary={`${overview.plans.activeCount} active`}
        secondary={overview.plans.totalCount > 0 ? `${overview.plans.avgProgressPct}% avg progress` : "None yet"}
      />
      <Cell
        href="/notes"
        icon={StickyNote}
        label="Notes"
        primary={`${overview.notes.count} total`}
        secondary={overview.notes.lastCapturedAt ? `Last ${formatRelativeToNow(overview.notes.lastCapturedAt)}` : "None yet"}
      />
      <Cell
        href="/mail"
        icon={Mail}
        label="Mail"
        primary={overview.mail.connected ? `${overview.mail.needsReplyCount} needs reply` : "Not connected"}
        secondary={
          overview.mail.connected
            ? `${overview.mail.waitingOnOthersCount} waiting on others`
            : undefined
        }
      />
      <Cell
        href="/bot"
        icon={Bot}
        label="Bot"
        primary={`${overview.bot.notifications7d} pushes / 7d`}
        secondary={overview.bot.lastNotificationAt ? `Last ${formatRelativeToNow(overview.bot.lastNotificationAt)}` : "No activity yet"}
      />
    </div>
  );
}
