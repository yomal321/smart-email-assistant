"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Inbox as InboxIcon,
  LayoutDashboard,
  CheckSquare,
  FileEdit,
  Clock,
  Users,
  BarChart3,
  SlidersHorizontal,
  Settings,
  Compass,
} from "lucide-react";
import { PLATFORMS, type Platform } from "@/lib/data";
import { useSavedViews } from "@/lib/data/use-saved-views";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// The mail module's own rail — Board (email surfaces) and Insight (email
// analytics), unchanged since 007-web-dashboard. Plans/Notes/Life moved out
// to the hub entirely (see hub-shell.tsx) rather than living as a section in
// here — mixing a non-email domain into this rail is exactly what got
// reverted; see feedback_module_separation in project memory.
const BOARD_ROUTES = [
  { href: "/mail", label: "Overview", icon: LayoutDashboard, countKey: null },
  { href: "/mail/inbox", label: "Inbox", icon: InboxIcon, countKey: "inbox" as const },
  { href: "/mail/actions", label: "Action items", icon: CheckSquare, countKey: "actions" as const },
  { href: "/mail/drafts", label: "Drafts", icon: FileEdit, countKey: "drafts" as const },
  { href: "/mail/follow-ups", label: "Follow-ups", icon: Clock, countKey: "followUps" as const },
  { href: "/mail/contacts", label: "Contacts", icon: Users, countKey: null },
  { href: "/mail/analytics", label: "Analytics", icon: BarChart3, countKey: null },
];

export interface RailCounts {
  overview: number;
  inbox: number;
  actions: number;
  drafts: number;
  followUps: number;
  reviewQueue: number;
  platforms: Record<Platform, number>;
}

export function PlatformRail({ counts, compact = false }: { counts: RailCounts; compact?: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activePlatform = searchParams.get("platform");
  const { data: savedViews } = useSavedViews();

  return (
    <nav
      className={cn(
        "flex h-full flex-col overflow-y-auto scrollbar-none border-r border-rule bg-surface-sunk py-4",
        compact ? "w-14 items-center px-1" : "w-56 px-3"
      )}
      aria-label="Primary"
    >
      {/* The door back to the hub — mirrors hub-shell.tsx's "Mail Assistant"
          door, so moving between the two rooms is symmetric. */}
      <Link
        href="/"
        className={cn(
          "mb-2 flex items-center gap-2.5 rounded-xl border border-rule bg-surface px-2.5 py-2 text-[13px] font-medium text-ink-secondary transition-colors hover:border-departure hover:bg-surface-raised hover:text-ink",
          compact && "justify-center px-0"
        )}
      >
        <ArrowLeft size={16} className="shrink-0" />
        {!compact && <span className="flex-1 truncate">Hub</span>}
      </Link>

      <RailSection title="Board" compact={compact}>
        {BOARD_ROUTES.map((r) => {
          const active = pathname === r.href;
          const count = r.countKey ? counts[r.countKey] : undefined;
          return (
            <RailLink key={r.href} href={r.href} label={r.label} icon={r.icon} active={active} count={count} compact={compact} />
          );
        })}
      </RailSection>

      <RailDivider compact={compact} />

      <RailSection title="Platforms" compact={compact}>
        {PLATFORMS.map((p) => {
          const active = pathname === "/mail/inbox" && activePlatform === p.platform;
          return (
            <RailPlatformLink
              key={p.platform}
              platform={p.platform}
              number={p.number}
              label={p.label}
              code={p.code}
              count={counts.platforms[p.platform] ?? 0}
              active={active}
              compact={compact}
            />
          );
        })}
      </RailSection>

      {!compact && savedViews.length > 0 && (
        <>
          <RailDivider compact={compact} />
          <RailSection title="Saved views" compact={compact}>
            {savedViews.map((v) => (
              <Link
                key={v.id}
                href={`/mail/inbox?view=${v.slug}`}
                className="flex items-center justify-between rounded-xl px-2.5 py-2 text-[13px] text-ink-secondary transition-colors hover:bg-surface-raised hover:text-ink"
              >
                <span className="truncate">{v.label}</span>
              </Link>
            ))}
          </RailSection>
        </>
      )}

      <RailDivider compact={compact} />

      <Link
        href="/mail/review"
        className={cn(
          "flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] font-semibold transition-colors",
          counts.reviewQueue > 0
            ? "bg-signal-field text-signal hover:brightness-95"
            : "text-ink-tertiary hover:bg-surface-raised hover:text-ink",
          compact && "justify-center px-0"
        )}
        title={`Review queue — ${counts.reviewQueue} messages`}
      >
        <AlertTriangle size={16} className="shrink-0" />
        {!compact && (
          <>
            <span className="flex-1 truncate font-narrow text-[11px] uppercase tracking-wide">Review queue</span>
            <span className="tabular">{counts.reviewQueue}</span>
          </>
        )}
      </Link>

      <RailDivider compact={compact} />

      <RailSection title="System" compact={compact}>
        <RailLink href="/mail/rules" label="Rules" icon={SlidersHorizontal} active={pathname === "/mail/rules"} compact={compact} />
        <RailLink href="/mail/settings" label="Settings" icon={Settings} active={pathname === "/mail/settings"} compact={compact} />
        <RailLink href="/mail/guide" label="Guide" icon={Compass} active={pathname === "/mail/guide"} compact={compact} />
      </RailSection>
    </nav>
  );
}

function RailSection({ title, children, compact }: { title?: string; children: React.ReactNode; compact: boolean }) {
  return (
    <div className="flex flex-col gap-1 py-1">
      {title && !compact && (
        <div className="px-2.5 pb-1.5 font-narrow text-[10.5px] font-bold uppercase tracking-widest text-ink-disabled">
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

function RailDivider({ compact }: { compact: boolean }) {
  return <div className={cn("my-2 border-t border-rule", compact ? "mx-1" : "mx-0")} />;
}

function RailLink({
  href,
  label,
  icon: Icon,
  active,
  count,
  compact,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  active: boolean;
  count?: number;
  compact: boolean;
}) {
  const content = (
    <Link
      href={href}
      className={cn(
        "group relative flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] transition-colors",
        active
          ? "bg-departure-field font-semibold text-departure-field-ink"
          : "text-ink-secondary hover:bg-surface-raised hover:text-ink",
        compact && "justify-center px-0"
      )}
    >
      {active && !compact && (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-full" style={{ background: "var(--departure)" }} />
      )}
      <Icon size={17} className={cn("shrink-0", active ? "text-departure" : "text-ink-tertiary group-hover:text-ink")} />
      {!compact && <span className="flex-1 truncate">{label}</span>}
      {!compact && count !== undefined && (
        <span className={cn("tabular text-xs", active ? "text-departure-field-ink" : "text-ink-tertiary")}>{count}</span>
      )}
    </Link>
  );

  if (!compact) return content;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{content}</TooltipTrigger>
      <TooltipContent side="right">
        {label}
        {count !== undefined ? ` · ${count}` : ""}
      </TooltipContent>
    </Tooltip>
  );
}

function RailPlatformLink({
  platform,
  number,
  label,
  code,
  count,
  active,
  compact,
}: {
  platform: Platform;
  number: number;
  label: string;
  code: string;
  count: number;
  active: boolean;
  compact: boolean;
}) {
  const badge = (
    <span
      className="flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold tabular font-narrow"
      style={{ background: `var(--platform-${number})`, color: `var(--platform-${number}-ink)` }}
    >
      {number}
    </span>
  );

  const content = (
    <Link
      href={`/mail/inbox?platform=${platform}`}
      className={cn(
        "group relative flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] transition-colors",
        active
          ? "bg-departure-field font-semibold text-departure-field-ink"
          : "text-ink-secondary hover:bg-surface-raised hover:text-ink",
        compact && "justify-center px-0"
      )}
    >
      {active && !compact && (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-full" style={{ background: "var(--departure)" }} />
      )}
      {badge}
      {!compact && <span className="flex-1 truncate">{label}</span>}
      {!compact && (
        <span className={cn("tabular text-xs", active ? "text-departure-field-ink" : "text-ink-tertiary")}>{count}</span>
      )}
    </Link>
  );

  if (!compact) return content;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{content}</TooltipTrigger>
      <TooltipContent side="right">
        {code} · {label} · {count}
      </TooltipContent>
    </Tooltip>
  );
}
