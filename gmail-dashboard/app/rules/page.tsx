"use client";

import * as React from "react";
import { Pencil } from "lucide-react";
import { useRules } from "@/lib/data/use-rules";
import { useCategories } from "@/lib/data/use-categories";
import { useSettings } from "@/lib/data/use-settings";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const FIELDS = ["Sender domain", "Subject", "Category", "Confidence", "Has attachment"];
const OPERATORS = ["contains", "equals", "is above", "is below"];
const ACTIONS = ["Auto-label", "Auto-archive", "Auto-prioritise", "Auto-draft"];

export default function RulesPage() {
  const { data: rules, toggle } = useRules();
  const { data: categories, rename } = useCategories();
  const { data: settings, update: updateSettings } = useSettings();

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="rule-b px-4 py-3">
        <h1 className="text-lg font-semibold text-ink">Rules & automation</h1>
        <p className="text-sm text-ink-secondary">If sender, subject, keyword, or category matches — auto-label, archive, prioritise, or draft.</p>
      </div>

      {/* Rule list */}
      <div>
        {rules.map((r) => (
          <div key={r.id} className="flex items-center gap-3 rule-b px-4 py-2.5">
            <Switch checked={r.enabled} onCheckedChange={() => toggle(r.id)} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-ink">
                <span className="font-medium">If</span> {r.conditionSummary}
              </p>
              <p className="truncate text-xs text-ink-tertiary">→ {r.actionSummary}</p>
            </div>
            <span className="tabular text-xs text-ink-tertiary">{r.runCount30d} runs / 30d</span>
            <button className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-tertiary hover:bg-surface-sunk hover:text-ink">
              <Pencil size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* Inline builder */}
      <RuleBuilder />

      {/* Category management */}
      <div className="rule-t px-4 py-5">
        <h2 className="mb-2 font-narrow text-[11px] font-bold uppercase tracking-wider text-ink-tertiary">
          Category management
        </h2>
        <div className="space-y-1.5">
          {categories.map((c) => (
            <CategoryRow key={c.key} category={c} onRename={(label) => rename(c.key, label)} />
          ))}
        </div>
        <Button variant="secondary" size="sm" className="mt-2 rounded-lg">
          + Create custom category
        </Button>
      </div>

      {/* Priority weighting */}
      <div className="rule-t px-4 py-5">
        <h2 className="mb-3 font-narrow text-[11px] font-bold uppercase tracking-wider text-ink-tertiary">
          Priority weighting
        </h2>
        <div className="max-w-md space-y-4">
          <WeightSlider
            label="VIP sender"
            value={settings?.priorityWeights.vip ?? 80}
            onChange={(v) => updateSettings({ priorityWeights: { ...defaultWeights(settings), vip: v } })}
          />
          <WeightSlider
            label="Deadline mentioned"
            value={settings?.priorityWeights.deadline ?? 65}
            onChange={(v) => updateSettings({ priorityWeights: { ...defaultWeights(settings), deadline: v } })}
          />
          <WeightSlider
            label="Direct question awaiting answer"
            value={settings?.priorityWeights.directQuestion ?? 70}
            onChange={(v) => updateSettings({ priorityWeights: { ...defaultWeights(settings), directQuestion: v } })}
          />
          <WeightSlider
            label="Message age"
            value={settings?.priorityWeights.age ?? 40}
            onChange={(v) => updateSettings({ priorityWeights: { ...defaultWeights(settings), age: v } })}
          />
        </div>
      </div>

      {/* Auto-reply rules — a global on/off + cap/floor, distinct from the
          per-condition `rules` table above; not yet mapped onto a single
          persisted resource (would need a decision about whether this is
          itself a `rules` row or its own settings field), so this section
          stays local UI state, same as before this phase. */}
      <div className="rule-t px-4 py-5">
        <h2 className="mb-2 font-narrow text-[11px] font-bold uppercase tracking-wider text-ink-tertiary">
          Auto-reply rules
        </h2>
        <p className="mb-3 max-w-prose text-xs text-ink-tertiary">
          An auto-reply is the one irreversible action in the product — every rule requires a daily cap and a confidence floor.
        </p>
        <div className="flex flex-wrap items-center gap-4 rounded-lg border p-3" style={{ borderColor: "var(--rule)" }}>
          <label className="flex items-center gap-2 text-sm text-ink">
            <Switch defaultChecked={false} /> Auto-acknowledge automated notifications
          </label>
          <label className="flex items-center gap-2 text-xs text-ink-secondary">
            Daily cap
            <Input type="number" defaultValue={5} className="h-7 w-16 rounded-lg" />
          </label>
          <label className="flex items-center gap-2 text-xs text-ink-secondary">
            Confidence floor
            <Input type="number" defaultValue={90} className="h-7 w-16 rounded-lg" />
          </label>
        </div>
      </div>
    </div>
  );
}

function defaultWeights(settings: ReturnType<typeof useSettings>["data"]) {
  return (
    settings?.priorityWeights ?? { vip: 80, deadline: 65, directQuestion: 70, age: 40 }
  );
}

function CategoryRow({
  category,
  onRename,
}: {
  category: { key: string; label: string; number: number };
  onRename: (label: string) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(category.label);

  if (editing) {
    return (
      <div className="flex items-center gap-2 rounded-lg border px-3 py-1.5" style={{ borderColor: "var(--rule)" }}>
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-7 flex-1 rounded-lg"
          autoFocus
        />
        <button
          className="text-xs text-ink-tertiary hover:text-ink"
          onClick={() => {
            onRename(value);
            setEditing(false);
          }}
        >
          Save
        </button>
        <button className="text-xs text-ink-tertiary hover:text-ink" onClick={() => setEditing(false)}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border px-3 py-1.5" style={{ borderColor: "var(--rule)" }}>
      <span
        className="flex h-5 w-5 items-center justify-center rounded-lg text-[10px] font-bold"
        style={{ background: `var(--platform-${category.number})`, color: `var(--platform-${category.number}-ink)` }}
      >
        {category.number}
      </span>
      <span className="flex-1 text-sm text-ink">{category.label}</span>
      <button className="text-xs text-ink-tertiary hover:text-ink" onClick={() => setEditing(true)}>
        Rename
      </button>
      <button className="text-xs text-ink-tertiary hover:text-ink" disabled title="Merge semantics not yet decided">
        Merge
      </button>
    </div>
  );
}

function WeightSlider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const [local, setLocal] = React.useState(value);
  // Reset the in-drag local value when the committed prop changes (e.g. a
  // settings refetch) — adjusting state during render instead of an effect,
  // per React's guidance on syncing state to a changed prop.
  const [prevValue, setPrevValue] = React.useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setLocal(value);
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-ink-secondary">{label}</span>
        <span className="tabular font-semibold text-ink">{local}</span>
      </div>
      <Slider value={[local]} onValueChange={([v]) => setLocal(v)} onValueCommit={([v]) => onChange(v)} max={100} step={5} />
    </div>
  );
}

function RuleBuilder() {
  const { create } = useRules();
  const [field, setField] = React.useState(FIELDS[0]);
  const [operator, setOperator] = React.useState(OPERATORS[0]);
  const [value, setValue] = React.useState("");
  const [action, setAction] = React.useState(ACTIONS[0]);
  const [preview, setPreview] = React.useState<{ count: number; partial: boolean } | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  React.useEffect(() => {
    // Nothing to debounce with an empty value — render already shows the
    // "enter a value" prompt in that case regardless of stale `preview`
    // state, so there's no need to clear it here.
    if (!value) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      fetch("/api/rules/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ conditions: [{ field, operator, value }] }),
      })
        .then((res) => res.json())
        .then((body) => setPreview(body))
        .catch(() => {});
    }, 300);
    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [field, operator, value]);

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    const result = await create({
      conditions: [{ field, operator, value }],
      actions: [{ type: action }],
      conditionSummary: `${field} ${operator} "${value}"`,
      actionSummary: action,
    });
    setSaving(false);
    if (result.ok) {
      setValue("");
      setPreview(null);
    } else {
      setSaveError(result.error ?? "failed to save rule");
    }
  }

  return (
    <div className="rule-t px-4 py-5">
      <h2 className="mb-3 font-narrow text-[11px] font-bold uppercase tracking-wider text-ink-tertiary">
        New rule
      </h2>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium text-ink">IF</span>
        <Select value={field} onValueChange={setField}>
          <SelectTrigger size="sm" className="h-8 rounded-lg">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FIELDS.map((f) => (
              <SelectItem key={f} value={f}>
                {f}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={operator} onValueChange={setOperator}>
          <SelectTrigger size="sm" className="h-8 rounded-lg">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OPERATORS.map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="value" className="h-8 w-40 rounded-lg" />
        <Button variant="secondary" size="sm" className="h-8 rounded-lg">
          + and/or
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium text-ink">THEN</span>
        <Select value={action} onValueChange={setAction}>
          <SelectTrigger size="sm" className="h-8 rounded-lg">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ACTIONS.map((a) => (
              <SelectItem key={a} value={a}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <p className="text-xs text-ink-tertiary">
          {!value ? (
            "Enter a value to preview this rule against the last 30 days."
          ) : preview === null ? (
            "Checking…"
          ) : preview.partial ? (
            "Preview not available for this combination yet."
          ) : (
            <>
              Would have matched <span className="tabular font-semibold text-ink">{preview.count}</span> messages in the
              last 30 days.
            </>
          )}
        </p>
        <Button size="sm" className="rounded-lg" disabled={!value || saving} onClick={handleSave}>
          {saving ? "Saving…" : "Save rule"}
        </Button>
      </div>
      {saveError && <p className="mt-2 text-xs" style={{ color: "var(--signal)" }}>{saveError}</p>}
    </div>
  );
}
