"use client";

// Full-width settings, following the section tab-bar convention app/guide/page.tsx
// already established (sticky anchor nav under the header, click-to-scroll, no
// forced centering). Two changes from the previous pass: the sticky tab bar
// replaces the left-gutter section labels, freeing the page to use its actual
// width instead of stopping at max-w-5xl with a wide dead margin on anything
// wider than a laptop; and independent fields that belong to one decision
// (Model/Summary length, digest toggle/schedule, timezone/hours, theme/density)
// now sit side by side in a two-column grid instead of each claiming a full row.
import * as React from "react";
import { useSyncState } from "@/lib/data/use-sync-state";
import { useSettings } from "@/lib/data/use-settings";
import { useActivityLog } from "@/lib/data/use-activity-log";
import { formatFullDateTime } from "@/lib/format/relative-time";
import { usePreferences } from "@/components/board/preferences-provider";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CONTROL = "h-8 w-64 rounded-lg text-[13px]";

const SECTIONS = [
  { id: "accounts", label: "Account" },
  { id: "ai", label: "AI configuration" },
  { id: "notifications", label: "Notifications" },
  { id: "hours", label: "Working hours" },
  { id: "appearance", label: "Appearance" },
  { id: "privacy", label: "Privacy" },
  { id: "activity", label: "Activity log" },
];

export default function SettingsPage() {
  const { data: sync, loading: syncLoading } = useSyncState();
  const { data: settings, update: updateSettings } = useSettings();
  const { data: activity } = useActivityLog();
  const { theme, setTheme, density, setDensity } = usePreferences();
  const [purgeConfirm, setPurgeConfirm] = React.useState("");
  const [purging, setPurging] = React.useState(false);
  const [purgeError, setPurgeError] = React.useState<string | null>(null);
  const [resyncing, setResyncing] = React.useState(false);

  async function handleResync() {
    setResyncing(true);
    try {
      await fetch("/api/sync/resync", { method: "POST" });
    } finally {
      setResyncing(false);
    }
  }

  async function handlePurge() {
    setPurging(true);
    setPurgeError(null);
    try {
      const res = await fetch("/api/settings/purge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: purgeConfirm }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error((body && body.error) || "purge failed");
      setPurgeConfirm("");
    } catch (err) {
      setPurgeError(err instanceof Error ? err.message : "purge failed");
    } finally {
      setPurging(false);
    }
  }

  const syncLabel = sync
    ? sync.status === "synced"
      ? `Synced ${sync.lastSyncAt ? formatFullDateTime(sync.lastSyncAt) : "never"}`
      : sync.status
    : syncLoading
      ? "Loading…"
      : "Unavailable";

  return (
    <div className="flex-1 overflow-y-auto scroll-smooth">
      <header className="rule-b px-6 py-4">
        <h1 className="text-[1.0625rem] font-semibold tracking-tight text-ink">Settings</h1>
      </header>

      <nav
        aria-label="Settings sections"
        className="rule-b sticky top-0 z-10 flex gap-1 overflow-x-auto scrollbar-none bg-surface/95 px-6 py-2 backdrop-blur"
      >
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="shrink-0 rounded-lg px-2.5 py-1 font-narrow text-[11px] font-bold uppercase tracking-wide text-ink-tertiary transition-colors hover:bg-surface-raised hover:text-ink"
          >
            {s.label}
          </a>
        ))}
      </nav>

      <div className="space-y-8 px-6 py-8">
        <Section id="accounts" title="Account" note="The mailbox this assistant reads from.">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg bg-surface-sunk px-4 py-3">
            <div>
              <p className="text-[13px] font-medium text-ink">Gmail account</p>
              <p className="tabular mt-0.5 text-xs text-ink-secondary">{syncLabel}</p>
            </div>
            <Button size="sm" variant="secondary" className="rounded-lg" onClick={handleResync} disabled={resyncing}>
              {resyncing ? "Resyncing…" : "Resync"}
            </Button>
          </div>
        </Section>

        <Section id="ai" title="AI configuration" note="How the assistant reads your mail and sounds when it writes.">
          <FieldGrid>
            <Field label="Model" description="Not connected in this prototype.">
              <Select defaultValue="fixture">
                <SelectTrigger className={CONTROL}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixture">Prototype fixture model</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Summary length" description="How much each message gets condensed to.">
              <Select
                value={settings?.summaryLength ?? "one-line"}
                onValueChange={(v) => updateSettings({ summaryLength: v as "one-line" | "short" })}
              >
                <SelectTrigger className={CONTROL}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="one-line">One line</SelectItem>
                  <SelectItem value="short">Short paragraph</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Signature" description="Appended to generated replies.">
              <Textarea
                value={settings?.signature ?? ""}
                onChange={(e) => updateSettings({ signature: e.target.value })}
                className="rounded-lg text-[13px]"
                rows={4}
              />
            </Field>
            <Field label="Writing style samples" description="Paste a few emails you've written, so replies sound like you.">
              <Textarea
                value={settings?.styleSamples ?? ""}
                onChange={(e) => updateSettings({ styleSamples: e.target.value })}
                placeholder="Hi Sam — thanks for the quick turnaround on this…"
                className="rounded-lg text-[13px]"
                rows={4}
              />
            </Field>
          </FieldGrid>
        </Section>

        <Section id="notifications" title="Notifications" note="When the assistant is allowed to interrupt you.">
          <FieldGrid>
            <Field label="Daily digest" description="One summary email instead of per-message alerts." inline>
              <Switch
                checked={settings?.digestEnabled ?? false}
                onCheckedChange={(v) => updateSettings({ digestEnabled: v })}
              />
            </Field>
            <Field label="Digest schedule" description="When the digest is sent.">
              <Select value={settings?.digestTime ?? "0800"} onValueChange={(v) => updateSettings({ digestTime: v })}>
                <SelectTrigger className={CONTROL}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0700">7:00 AM</SelectItem>
                  <SelectItem value="0800">8:00 AM</SelectItem>
                  <SelectItem value="1800">6:00 PM</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </FieldGrid>
        </Section>

        <Section id="hours" title="Working hours" note="Used to judge how urgent a deadline really is.">
          <FieldGrid>
            <Field label="Timezone" description="All times on the board are shown in this zone.">
              <Select value={settings?.timezone ?? "Asia/Colombo"} onValueChange={(v) => updateSettings({ timezone: v })}>
                <SelectTrigger className={CONTROL}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Asia/Colombo">Asia/Colombo (GMT+5:30)</SelectItem>
                  <SelectItem value="Europe/London">Europe/London</SelectItem>
                  <SelectItem value="America/New_York">America/New_York</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Hours" description="Mail arriving outside these hours is not treated as overdue overnight.">
              <div className="flex w-64 items-center gap-2">
                <Input
                  value={settings?.workHoursStart ?? "09:00"}
                  onChange={(e) => updateSettings({ workHoursStart: e.target.value })}
                  className="tabular h-8 rounded-lg text-[13px]"
                  aria-label="Work hours start"
                />
                <span className="text-ink-tertiary">–</span>
                <Input
                  value={settings?.workHoursEnd ?? "18:00"}
                  onChange={(e) => updateSettings({ workHoursEnd: e.target.value })}
                  className="tabular h-8 rounded-lg text-[13px]"
                  aria-label="Work hours end"
                />
              </div>
            </Field>
          </FieldGrid>
        </Section>

        <Section id="appearance" title="Appearance" note="How the board is drawn. Stored on this device only.">
          <FieldGrid>
            <Field label="Theme" description="Light, dark, or follow the system.">
              <Select value={theme} onValueChange={(v) => setTheme(v as typeof theme)}>
                <SelectTrigger className={CONTROL}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="dark">Dark</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Row density" description="How tightly board rows are packed.">
              <Select value={density} onValueChange={(v) => setDensity(v as typeof density)}>
                <SelectTrigger className={CONTROL}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="comfortable">Comfortable</SelectItem>
                  <SelectItem value="dense">Dense</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </FieldGrid>
        </Section>

        <Section id="privacy" title="Privacy" note="What the assistant keeps, and how to get rid of it.">
          <div className="space-y-3">
            <Link
              href="/settings/cleanup"
              className="group flex items-center justify-between gap-6 rounded-lg bg-surface-sunk px-4 py-3 transition-colors hover:bg-muted"
            >
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-ink">Inbox Cleanup</p>
                <p className="mt-0.5 text-xs text-ink-secondary">
                  <span className="tabular">{settings?.exclusionRules?.length ?? 0}</span> exclusion rule
                  {(settings?.exclusionRules?.length ?? 0) === 1 ? "" : "s"} · Auto-cleanup{" "}
                  {settings?.retentionDays == null ? "off" : `after ${settings.retentionDays} days`}
                </p>
              </div>
              <ArrowRight
                size={16}
                className="shrink-0 text-ink-tertiary transition-transform group-hover:translate-x-0.5"
              />
            </Link>
            <div className="rounded-lg px-4 py-3" style={{ background: "var(--signal-field)" }}>
              <p className="text-[13px] font-medium text-ink">Purge all processed data</p>
              <p className="mt-0.5 text-xs text-ink-secondary">
                Deletes every email, task, draft, commitment and contact this assistant has stored. Your actual Gmail
                mailbox is untouched. This cannot be undone.
              </p>
              <div className="mt-2.5 flex items-center gap-2">
                <Input
                  value={purgeConfirm}
                  onChange={(e) => setPurgeConfirm(e.target.value)}
                  placeholder='Type "PURGE" to confirm'
                  aria-label='Type "PURGE" to confirm'
                  className="h-8 w-52 rounded-lg text-[13px]"
                />
                <Button
                  size="sm"
                  variant="destructive"
                  className="rounded-lg"
                  disabled={purgeConfirm !== "PURGE" || purging}
                  onClick={handlePurge}
                >
                  {purging ? "Purging…" : "Purge"}
                </Button>
              </div>
              {purgeError && (
                <p className="mt-2 text-xs" style={{ color: "var(--signal)" }}>
                  {purgeError}
                </p>
              )}
            </div>
          </div>
        </Section>

        <Section
          id="activity"
          title="Activity log"
          note="What the assistant did on its own, and why. Handled work leaves a trace."
        >
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-130 text-[13px]">
              <thead>
                <tr className="rule-b bg-surface-sunk text-left">
                  <th className="px-3 py-2 font-narrow text-[10.5px] font-bold uppercase tracking-widest text-ink-tertiary">When</th>
                  <th className="px-3 py-2 font-narrow text-[10.5px] font-bold uppercase tracking-widest text-ink-tertiary">Action</th>
                  <th className="px-3 py-2 font-narrow text-[10.5px] font-bold uppercase tracking-widest text-ink-tertiary">Target</th>
                  <th className="px-3 py-2 font-narrow text-[10.5px] font-bold uppercase tracking-widest text-ink-tertiary">Cause</th>
                </tr>
              </thead>
              <tbody>
                {activity.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-xs text-ink-tertiary">
                      Nothing logged yet — this fills in as the assistant (or you) act on mail.
                    </td>
                  </tr>
                )}
                {activity.map((a) => (
                  <tr key={a.id} className="rule-b last:border-b-0">
                    <td className="tabular whitespace-nowrap px-3 py-2 text-ink-secondary">{formatFullDateTime(a.at)}</td>
                    <td className="px-3 py-2 text-ink">{a.action}</td>
                    <td className="px-3 py-2 text-ink-secondary">{a.target}</td>
                    <td className="px-3 py-2 text-ink-tertiary">{a.cause}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({
  id,
  title,
  note,
  children,
}: {
  id: string;
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-14 rounded-lg border border-border bg-surface-raised p-5">
      <h2 className="text-sm font-semibold tracking-tight text-ink">{title}</h2>
      <p className="mt-1 text-xs leading-relaxed text-ink-secondary">{note}</p>
      <div className="mt-5">{children}</div>
    </section>
  );
}

// Independent fields that belong to the same decision sit side by side once
// there's room; below md they stack, same as every other reflow in this app.
function FieldGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-x-8 gap-y-6 md:grid-cols-2">{children}</div>;
}

function Field({
  label,
  description,
  children,
  inline,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
  inline?: boolean;
}) {
  if (inline) {
    return (
      <div className="flex items-center justify-between gap-4 rounded-lg bg-surface-sunk px-4 py-3">
        <div className="min-w-0">
          <Label className="text-[13px] font-medium text-ink">{label}</Label>
          {description && <p className="mt-0.5 text-xs text-ink-secondary">{description}</p>}
        </div>
        <div className="shrink-0">{children}</div>
      </div>
    );
  }

  return (
    <div>
      <Label className="text-[13px] font-medium text-ink">{label}</Label>
      {description && <p className="mb-2 mt-0.5 text-xs text-ink-secondary">{description}</p>}
      {children}
    </div>
  );
}
