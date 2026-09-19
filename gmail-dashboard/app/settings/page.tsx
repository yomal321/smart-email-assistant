"use client";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="rule-b px-4 py-3">
        <h1 className="text-lg font-semibold text-ink">Settings</h1>
      </div>

      <div className="measure space-y-8 px-4 py-5">
        <SettingsSection title="Connected accounts">
          <div className="flex items-center justify-between rounded-lg border p-3" style={{ borderColor: "var(--rule)" }}>
            <div>
              <p className="text-sm font-medium text-ink">Connected Gmail account</p>
              <p className="tabular text-xs text-ink-tertiary">
                {sync
                  ? sync.status === "synced"
                    ? `Synced ${sync.lastSyncAt ? formatFullDateTime(sync.lastSyncAt) : "Never"}`
                    : sync.status
                  : syncLoading
                    ? "Loading…"
                    : "Unavailable"}
              </p>
            </div>
            <Button size="sm" variant="secondary" className="rounded-lg" onClick={handleResync} disabled={resyncing}>
              {resyncing ? "Resyncing…" : "Resync"}
            </Button>
          </div>
        </SettingsSection>

        <SettingsSection title="AI configuration">
          <Field label="Model">
            <Select defaultValue="fixture">
              <SelectTrigger className="rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fixture">Prototype fixture model (not connected)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Summary length">
            <Select
              value={settings?.summaryLength ?? "one-line"}
              onValueChange={(v) => updateSettings({ summaryLength: v as "one-line" | "short" })}
            >
              <SelectTrigger className="rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="one-line">One line</SelectItem>
                <SelectItem value="short">Short paragraph</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Signature">
            <Textarea
              value={settings?.signature ?? ""}
              onChange={(e) => updateSettings({ signature: e.target.value })}
              className="rounded-lg"
              rows={3}
            />
          </Field>
          <Field label="Writing style samples">
            <Textarea
              value={settings?.styleSamples ?? ""}
              onChange={(e) => updateSettings({ styleSamples: e.target.value })}
              placeholder="Paste a few emails you've written, so replies sound like you."
              className="rounded-lg"
              rows={4}
            />
          </Field>
        </SettingsSection>

        <SettingsSection title="Notifications">
          <div className="flex items-center justify-between">
            <Label className="text-sm text-ink-secondary">Daily digest</Label>
            <Switch
              checked={settings?.digestEnabled ?? false}
              onCheckedChange={(v) => updateSettings({ digestEnabled: v })}
            />
          </div>
          <Field label="Digest schedule">
            <Select
              value={settings?.digestTime ?? "0800"}
              onValueChange={(v) => updateSettings({ digestTime: v })}
            >
              <SelectTrigger className="rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0700">7:00 AM</SelectItem>
                <SelectItem value="0800">8:00 AM</SelectItem>
                <SelectItem value="1800">6:00 PM</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </SettingsSection>

        <SettingsSection title="Privacy">
          <Field label="Exclusion rules — mail that never goes to the model">
            <Input
              value={settings?.exclusionRules?.[0] ?? ""}
              onChange={(e) => updateSettings({ exclusionRules: e.target.value ? [e.target.value] : [] })}
              placeholder={'e.g. from:legal@, subject contains "confidential"'}
              className="rounded-lg"
            />
          </Field>
          <Field label="Data retention period">
            <Select
              value={settings?.retentionDays == null ? "unset" : String(settings.retentionDays)}
              onValueChange={(v) => updateSettings({ retentionDays: v === "unset" ? null : Number(v) })}
            >
              <SelectTrigger className="rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unset">Not set</SelectItem>
                <SelectItem value="30">30 days</SelectItem>
                <SelectItem value="90">90 days</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <div className="rounded-lg border p-3" style={{ borderColor: "var(--signal)", background: "var(--signal-field)" }}>
            <p className="mb-2 text-sm text-ink">Purge all processed data. This cannot be undone.</p>
            <div className="flex items-center gap-2">
              <Input
                value={purgeConfirm}
                onChange={(e) => setPurgeConfirm(e.target.value)}
                placeholder='Type "PURGE" to confirm'
                className="h-8 max-w-48 rounded-lg"
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
            {purgeError && <p className="mt-2 text-xs" style={{ color: "var(--signal)" }}>{purgeError}</p>}
          </div>
        </SettingsSection>

        <SettingsSection title="Working hours & timezone">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Timezone">
              <Select
                value={settings?.timezone ?? "Asia/Colombo"}
                onValueChange={(v) => updateSettings({ timezone: v })}
              >
                <SelectTrigger className="rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Asia/Colombo">Asia/Colombo (GMT+5:30)</SelectItem>
                  <SelectItem value="Europe/London">Europe/London</SelectItem>
                  <SelectItem value="America/New_York">America/New_York</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Hours">
              <div className="flex items-center gap-2">
                <Input
                  value={settings?.workHoursStart ?? "09:00"}
                  onChange={(e) => updateSettings({ workHoursStart: e.target.value })}
                  className="h-9 rounded-lg"
                />
                <span className="text-ink-tertiary">–</span>
                <Input
                  value={settings?.workHoursEnd ?? "18:00"}
                  onChange={(e) => updateSettings({ workHoursEnd: e.target.value })}
                  className="h-9 rounded-lg"
                />
              </div>
            </Field>
          </div>
        </SettingsSection>

        <SettingsSection title="Appearance">
          <Field label="Theme">
            <Select value={theme} onValueChange={(v) => setTheme(v as typeof theme)}>
              <SelectTrigger className="rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
                <SelectItem value="system">System</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Row density">
            <Select value={density} onValueChange={(v) => setDensity(v as typeof density)}>
              <SelectTrigger className="rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="comfortable">Comfortable</SelectItem>
                <SelectItem value="dense">Dense</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </SettingsSection>

        {/* Activity log — a first-class surface, not a footnote */}
        <SettingsSection title="Activity log">
          <p className="mb-2 text-xs text-ink-tertiary">What the AI did automatically, and when. Handled work leaves a trace.</p>
          <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--rule)" }}>
            <table className="w-full min-w-130 text-sm">
              <thead>
                <tr className="rule-b bg-surface text-left text-ink-tertiary">
                  <th className="px-3 py-1.5 font-normal">When</th>
                  <th className="px-3 py-1.5 font-normal">Action</th>
                  <th className="px-3 py-1.5 font-normal">Target</th>
                  <th className="px-3 py-1.5 font-normal">Cause</th>
                </tr>
              </thead>
              <tbody>
                {activity.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-4 text-center text-ink-tertiary">
                      Nothing logged yet — this fills in as the assistant (or you) act on mail.
                    </td>
                  </tr>
                )}
                {activity.map((a) => (
                  <tr key={a.id} className="rule-b">
                    <td className="whitespace-nowrap px-3 py-1.5 tabular text-ink-secondary">{formatFullDateTime(a.at)}</td>
                    <td className="px-3 py-1.5 text-ink">{a.action}</td>
                    <td className="px-3 py-1.5 text-ink-secondary">{a.target}</td>
                    <td className="px-3 py-1.5 text-ink-tertiary">{a.cause}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SettingsSection>
      </div>
    </div>
  );
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 font-narrow text-[11px] font-bold uppercase tracking-wider text-ink-tertiary">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="mb-1.5 block text-xs text-ink-secondary">{label}</Label>
      {children}
    </div>
  );
}
