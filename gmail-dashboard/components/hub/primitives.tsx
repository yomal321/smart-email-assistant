// Shared hub visual language, extracted from two reference dashboards the
// user pinned (an ops "Live Agent Map" and a practice-management dashboard):
// tinted icon chips, big bold tabular numbers on white rounded cards, thin
// colored progress bars, pill tabs, and soft-tinted status badges. This
// replaces the flatter, denser look the hub had before — see DESIGN.md for
// the direction writeup.
//
// Tint strategy: every tone derives its own tint via color-mix() from a
// color the app already has a name for, drawn on top rather than a filled
// solid — so the same five values work as an icon color, a status-pill
// text color, and a progress-bar fill. success/warning use the new
// --accent-success/--accent-warning tokens (globals.css) rather than
// --cleared/--platform-1: those two fail WCAG's 4.5:1 text/icon contrast on
// white (3.77:1 and 2.15:1 respectively — verified) because they were tuned
// for field/badge fills elsewhere, not for drawing directly on a surface.
import * as React from "react";

export type Tone = "primary" | "danger" | "success" | "warning" | "info" | "neutral";

const TONE_COLOR: Record<Tone, string> = {
  primary: "var(--departure)",
  danger: "var(--signal)",
  success: "var(--accent-success)",
  warning: "var(--accent-warning)",
  info: "var(--platform-2)",
  neutral: "var(--ink-tertiary)",
};

function tint(color: string, pct = 14): string {
  return `color-mix(in srgb, ${color} ${pct}%, var(--surface-raised))`;
}

// Exposes the raw tone->color mapping for callers that need the color itself
// (e.g. a left accent border) rather than one of the pre-built primitives
// below.
export function toneColor(tone: Tone): string {
  return TONE_COLOR[tone];
}

// ---------------------------------------------------------------------------
// IconChip — a small tinted rounded-square carrying one icon in its own tone.
// ---------------------------------------------------------------------------
export function IconChip({
  icon: Icon,
  tone = "neutral",
  size = "md",
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  tone?: Tone;
  size?: "sm" | "md";
}) {
  const color = TONE_COLOR[tone];
  const box = size === "sm" ? "h-7 w-7" : "h-9 w-9";
  const iconSize = size === "sm" ? 14 : 16;
  return (
    <span
      className={`inline-flex ${box} shrink-0 items-center justify-center rounded-lg`}
      style={{ background: tint(color), color }}
    >
      <Icon size={iconSize} aria-hidden="true" />
    </span>
  );
}

// ---------------------------------------------------------------------------
// ProgressBar — thin rounded track + tone-colored fill, optionally
// overflowing into --signal past 100% (the "over capacity" case every load
// meter in this app needs).
// ---------------------------------------------------------------------------
export function ProgressBar({ pct, tone = "primary", overflowTone = "danger" }: { pct: number; tone?: Tone; overflowTone?: Tone }) {
  const over = pct > 100;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-pill bg-surface-sunk">
      <div
        className="h-full rounded-pill transition-[width]"
        style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: TONE_COLOR[over ? overflowTone : tone] }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatCard — the hero-metric pattern from both references: icon chip, a
// huge bold tabular number, a muted sub-label, an optional thin progress
// bar. `compact` drops the icon chip for the denser metric-grid variant
// (the reference's "SELECTED NODE" 2x3 tile grid).
// ---------------------------------------------------------------------------
export function StatCard({
  icon,
  tone = "neutral",
  label,
  value,
  sublabel,
  progressPct,
  progressTone,
  compact = false,
  onClick,
  disabled,
}: {
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  tone?: Tone;
  label: string;
  value: React.ReactNode;
  sublabel?: React.ReactNode;
  progressPct?: number;
  progressTone?: Tone;
  compact?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      onClick={onClick}
      disabled={onClick ? disabled : undefined}
      className={`card-surface flex w-full flex-col gap-2 text-left ${compact ? "p-3" : "p-4"} ${
        onClick ? "transition-shadow enabled:hover:shadow-popover disabled:cursor-default" : ""
      }`}
    >
      {icon && !compact && <IconChip icon={icon} tone={tone} />}
      <div>
        <p className="font-narrow text-[10.5px] font-bold uppercase tracking-wider text-ink-tertiary">{label}</p>
        <p className={`tabular font-bold text-ink ${compact ? "text-lg" : "text-2xl"}`}>{value}</p>
        {sublabel && <p className="mt-0.5 text-xs text-ink-tertiary">{sublabel}</p>}
      </div>
      {progressPct !== undefined && <ProgressBar pct={progressPct} tone={progressTone ?? tone} />}
    </Wrapper>
  );
}

// ---------------------------------------------------------------------------
// PillTabs — a segmented pill control with an optional count per tab. The
// active tab is a solid indigo fill (matching the reference's primary nav
// weight), distinct from the lighter FilterChip tint used for multi-select
// filters elsewhere (components/hub/source-plate.tsx-adjacent usage).
//
// Deliberately not tone-configurable: --departure/--departure-ink is a
// co-varying pair built for exactly this (solid fill + safe-contrast text
// in both themes — dark mode's --departure is a light pastel needing dark
// text, so --departure-ink flips to near-black there). The other four tones
// have no matching "-ink" partner, so pairing e.g. --signal with
// --departure-ink would silently break in dark mode; there is no current
// caller that needs a non-primary active tab, so this stays scoped to the
// one pairing that is actually verified.
// ---------------------------------------------------------------------------
export interface PillTab {
  key: string;
  label: string;
  count?: number;
}

export function PillTabs({ tabs, active, onChange }: { tabs: PillTab[]; active: string; onChange: (key: string) => void }) {
  return (
    <div role="tablist" className="flex flex-wrap gap-1 rounded-pill bg-surface-sunk p-1">
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.key)}
            className="tabular rounded-pill px-3 py-1.5 text-xs font-medium transition-colors"
            style={isActive ? { background: "var(--departure)", color: "var(--departure-ink)" } : { color: "var(--ink-secondary)" }}
          >
            {tab.label}
            {tab.count !== undefined && <span className="ml-1 opacity-80">{tab.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatusPill — a soft-tinted status badge (never color alone: always paired
// with the status word itself, per this codebase's existing convention on
// SourcePlate/PriorityAspect).
// ---------------------------------------------------------------------------
export function StatusPill({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  const color = TONE_COLOR[tone];
  return (
    <span
      className="tabular inline-flex shrink-0 items-center rounded-pill px-2 py-0.5 text-[11px] font-medium"
      style={{ background: tint(color, 16), color }}
    >
      {children}
    </span>
  );
}
