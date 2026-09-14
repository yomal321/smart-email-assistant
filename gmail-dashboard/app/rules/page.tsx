"use client";

import * as React from "react";
import { Pencil } from "lucide-react";
import { getRules, getMessages, PLATFORMS } from "@/lib/data";
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
  const [rules, setRules] = React.useState(() => getRules());
  const messages = getMessages();

  function toggle(id: string) {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)));
  }

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
      <RuleBuilder totalMessages={messages.length} />

      {/* Category management */}
      <div className="rule-t px-4 py-5">
        <h2 className="mb-2 font-narrow text-[11px] font-bold uppercase tracking-wider text-ink-tertiary">
          Category management
        </h2>
        <div className="space-y-1.5">
          {PLATFORMS.map((p) => (
            <div key={p.platform} className="flex items-center gap-3 rounded-lg border px-3 py-1.5" style={{ borderColor: "var(--rule)" }}>
              <span
                className="flex h-5 w-5 items-center justify-center rounded-lg text-[10px] font-bold"
                style={{ background: `var(--platform-${p.number})`, color: `var(--platform-${p.number}-ink)` }}
              >
                {p.number}
              </span>
              <span className="flex-1 text-sm text-ink">{p.label}</span>
              <button className="text-xs text-ink-tertiary hover:text-ink">Rename</button>
              <button className="text-xs text-ink-tertiary hover:text-ink">Merge</button>
            </div>
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
          <WeightSlider label="VIP sender" defaultValue={80} />
          <WeightSlider label="Deadline mentioned" defaultValue={65} />
          <WeightSlider label="Direct question awaiting answer" defaultValue={70} />
          <WeightSlider label="Message age" defaultValue={40} />
        </div>
      </div>

      {/* Auto-reply rules */}
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

function WeightSlider({ label, defaultValue }: { label: string; defaultValue: number }) {
  const [value, setValue] = React.useState(defaultValue);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-ink-secondary">{label}</span>
        <span className="tabular font-semibold text-ink">{value}</span>
      </div>
      <Slider value={[value]} onValueChange={([v]) => setValue(v)} max={100} step={5} />
    </div>
  );
}

function RuleBuilder({ totalMessages }: { totalMessages: number }) {
  const [field, setField] = React.useState(FIELDS[0]);
  const [operator, setOperator] = React.useState(OPERATORS[0]);
  const [value, setValue] = React.useState("");
  const [action, setAction] = React.useState(ACTIONS[0]);

  // A deterministic, illustrative preview count derived from the current inputs.
  const previewCount = value ? Math.max(1, Math.round((value.length * 7 + field.length) % totalMessages)) : 0;

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
          {value ? (
            <>
              Would have matched <span className="tabular font-semibold text-ink">{previewCount}</span> messages in the
              last 30 days.
            </>
          ) : (
            "Enter a value to preview this rule against the last 30 days."
          )}
        </p>
        <Button size="sm" className="rounded-lg" disabled={!value}>
          Save rule
        </Button>
      </div>
    </div>
  );
}
