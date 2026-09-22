"use client";

// Plans list — derived progress per plan, filterable by status, inline
// creation (spec.md FR7). Life Hub (013-life-hub).

import * as React from "react";
import Link from "next/link";
import { Target } from "lucide-react";
import { usePlans } from "@/lib/data/use-plans";
import { EmptyState } from "@/components/board/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusPill, ProgressBar, type Tone } from "@/components/hub/primitives";
import type { Plan, PlanCategory, PlanStatus } from "@/lib/data/types";

const STATUS_LABEL: Record<PlanStatus, string> = {
  active: "Active",
  paused: "Paused",
  done: "Done",
  archived: "Archived",
};

// 0021_life_layer.sql — the spec's Goal categories, optional.
const CATEGORY_LABEL: Record<PlanCategory, string> = {
  education: "Education",
  career: "Career",
  financial: "Financial",
  personal: "Personal",
  technical: "Technical",
  fitness: "Fitness",
  projects: "Projects",
};

// Radix Select rejects an empty-string item value — "none" stands in for
// "no category" and is translated back to null at the call site.
const NO_CATEGORY = "none";

const STATUS_FILTERS: Array<PlanStatus | "all"> = ["all", "active", "paused", "done", "archived"];

// Preserves the exact pre-redesign semantics (done=green, paused=red,
// active/archived=neutral) — just expressed via the shared StatusPill tone
// system instead of a bespoke inline style.
const STATUS_TONE: Record<PlanStatus, Tone> = {
  done: "success",
  paused: "danger",
  active: "neutral",
  archived: "neutral",
};

export default function PlansPage() {
  const { data: plans, loading, create } = usePlans();
  const [filter, setFilter] = React.useState<PlanStatus | "all">("all");

  const visible = filter === "all" ? plans : plans.filter((p) => p.status === filter);

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-ground">
      <div className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-ink">Plans</h1>
            <p className="text-sm text-ink-secondary">Goals and projects that group the tasks you already have.</p>
          </div>
          <div className="flex gap-1">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={
                  "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors " +
                  (filter === s ? "bg-departure-field text-departure-field-ink" : "text-ink-tertiary hover:bg-surface-sunk")
                }
              >
                {s === "all" ? "All" : STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        </div>

        <div className="card-surface p-4">
          <CreatePlanForm onCreate={create} />
        </div>

        <div className="card-surface overflow-hidden">
          {loading && <p className="px-4 py-6 text-sm text-ink-secondary">Loading plans…</p>}

          {!loading && visible.length === 0 && (
            <EmptyState
              icon={Target}
              heading="No plans yet."
              body="Create a plan to group the tasks that belong to the same effort — a task extracted from an email and one you typed by hand can both live under it."
            />
          )}

          {!loading && visible.map((plan) => <PlanRow key={plan.id} plan={plan} />)}
        </div>
      </div>
    </div>
  );
}

function PlanRow({ plan }: { plan: Plan }) {
  const hasTasks = plan.taskCount > 0;
  const pct = hasTasks ? Math.round((plan.doneCount / plan.taskCount) * 100) : 0;

  return (
    <Link
      href={`/plans/${plan.id}`}
      className="flex items-center gap-3 rule-b px-4 py-3 transition-colors last:border-b-0 hover:bg-surface-sunk"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-ink">{plan.title}</p>
          <StatusPill tone={STATUS_TONE[plan.status]}>{STATUS_LABEL[plan.status]}</StatusPill>
          {plan.category && <StatusPill tone="neutral">{CATEGORY_LABEL[plan.category]}</StatusPill>}
        </div>
        {plan.description && <p className="mt-0.5 truncate text-xs text-ink-tertiary">{plan.description}</p>}
      </div>
      {plan.targetDate && <span className="tabular shrink-0 text-xs text-ink-tertiary">{plan.targetDate}</span>}
      <div className="w-32 shrink-0">
        {hasTasks ? (
          <>
            <ProgressBar pct={pct} tone="success" />
            <p className="mt-1 text-right text-xs tabular text-ink-tertiary">
              {plan.doneCount}/{plan.taskCount} done
            </p>
          </>
        ) : (
          <p className="text-right text-xs text-ink-tertiary">no tasks yet</p>
        )}
      </div>
    </Link>
  );
}

function CreatePlanForm({ onCreate }: { onCreate: ReturnType<typeof usePlans>["create"] }) {
  const [title, setTitle] = React.useState("");
  const [category, setCategory] = React.useState<string>(NO_CATEGORY);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    const result = await onCreate({
      title,
      category: category === NO_CATEGORY ? null : (category as PlanCategory),
    });
    setSaving(false);
    if (result.ok) {
      setTitle("");
      setCategory(NO_CATEGORY);
    } else {
      setError(result.error ?? "failed to create plan");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="New plan title…"
        className="h-8 flex-1 rounded-lg"
      />
      <Select value={category} onValueChange={setCategory}>
        <SelectTrigger size="sm" className="h-8 w-36 rounded-lg">
          <SelectValue placeholder="Category" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_CATEGORY}>No category</SelectItem>
          {(Object.keys(CATEGORY_LABEL) as PlanCategory[]).map((c) => (
            <SelectItem key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="submit" size="sm" className="h-8 rounded-lg" disabled={!title.trim() || saving}>
        {saving ? "Creating…" : "+ New plan"}
      </Button>
      {error && <p className="text-xs" style={{ color: "var(--signal)" }}>{error}</p>}
    </form>
  );
}
