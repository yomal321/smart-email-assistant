"use client";

// Sources settings — rename, recolour, re-plate, and (0019_calendar_ingestion.sql)
// set each source's ICS feed URL. Previously SQL-only (GET /api/sources was
// read-only); this is the screen that makes the calendar sync self-service.

import * as React from "react";
import { useSources } from "@/lib/data/use-sources";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SourcePlate } from "@/components/hub/source-plate";
import type { Source } from "@/lib/data/types";

export default function SettingsPage() {
  const { data: sources, loading, update } = useSources();

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-ground">
      <div className="space-y-4 p-4">
        <div>
          <h1 className="text-lg font-semibold text-ink">Settings</h1>
          <p className="text-sm text-ink-secondary">
            Names, colours, and calendar feeds for the three sources the hub ranks across.
          </p>
        </div>

        {loading && <p className="px-1 text-sm text-ink-secondary">Loading sources…</p>}

        {!loading && (
          <div className="space-y-3">
            {sources.map((source) => (
              <SourceCard key={source.id} source={source} onUpdate={update} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SourceCard({ source, onUpdate }: { source: Source; onUpdate: ReturnType<typeof useSources>["update"] }) {
  const [name, setName] = React.useState(source.name);
  const [code, setCode] = React.useState(source.code);
  const [color, setColor] = React.useState(source.color);
  const [icsUrl, setIcsUrl] = React.useState(source.icsUrl ?? "");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [savedAt, setSavedAt] = React.useState<number | null>(null);

  const dirty =
    name !== source.name || code !== source.code || color !== source.color || icsUrl !== (source.icsUrl ?? "");

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result = await onUpdate(source.id, { name, code, color, icsUrl: icsUrl.trim() || null });
    setSaving(false);
    if (result.ok) setSavedAt(Date.now());
    else setError(result.error ?? "failed to save");
  }

  return (
    <div className="card-surface space-y-3 p-4">
      <div className="flex items-center gap-2">
        <SourcePlate source={{ ...source, name, code, color }} size="md" />
        <span className="text-xs uppercase tracking-wider text-ink-tertiary">{source.kind}</span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 rounded-lg" />
        </Field>
        <Field label="Plate (1–3 letters)">
          <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={3} className="h-8 rounded-lg" />
        </Field>
        <Field label="Colour">
          <Input value={color} onChange={(e) => setColor(e.target.value)} placeholder="#4f46e5" className="h-8 rounded-lg" />
        </Field>
        <Field label="ICS feed URL">
          <Input
            value={icsUrl}
            onChange={(e) => setIcsUrl(e.target.value)}
            placeholder="https://…/calendar.ics"
            className="h-8 rounded-lg"
          />
        </Field>
      </div>

      {source.lastSyncedAt && (
        <p className="text-xs text-ink-tertiary">Last synced {new Date(source.lastSyncedAt).toLocaleString()}</p>
      )}

      <div className="flex items-center gap-2">
        <Button size="sm" className="h-8 rounded-lg" disabled={!dirty || saving} onClick={handleSave}>
          {saving ? "Saving…" : "Save"}
        </Button>
        {!dirty && savedAt && <span className="text-xs text-ink-tertiary">Saved</span>}
        {error && (
          <span className="text-xs" style={{ color: "var(--signal)" }}>
            {error}
          </span>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block font-narrow text-[10.5px] font-bold uppercase tracking-wider text-ink-tertiary">
        {label}
      </span>
      {children}
    </label>
  );
}
