"use client";

// Plan detail — fields, its tasks, and the controls to edit the plan and to
// assign/unassign tasks (spec.md FR8). Life Hub (013-life-hub).

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Link from "next/link";
import type { ActionItem, Plan, PlanStatus } from "@/lib/data/types";

const STATUS_LABEL: Record<PlanStatus, string> = {
  active: "Active",
  paused: "Paused",
  done: "Done",
  archived: "Archived",
};

export default function PlanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [plan, setPlan] = React.useState<Plan | null>(null);
  const [tasks, setTasks] = React.useState<ActionItem[]>([]);
  const [unassigned, setUnassigned] = React.useState<ActionItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [notFound, setNotFound] = React.useState(false);
  const [pickerId, setPickerId] = React.useState<string>("");

  React.useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      const [detailRes, itemsRes] = await Promise.all([
        fetch(`/api/plans/${id}`, { signal: controller.signal }),
        fetch("/api/action-items", { signal: controller.signal }),
      ]);
      if (detailRes.status === 404) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      const detail = await detailRes.json().catch(() => null);
      const items = (await itemsRes.json().catch(() => [])) as ActionItem[];
      if (detail) {
        setPlan(detail.plan as Plan);
        setTasks(detail.tasks as ActionItem[]);
      }
      setUnassigned(Array.isArray(items) ? items.filter((i) => i.planId === null) : []);
      setLoading(false);
    }

    load().catch((err) => {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setLoading(false);
    });

    return () => controller.abort();
  }, [id]);

  async function saveField(patch: { title?: string; description?: string | null; status?: PlanStatus; targetDate?: string | null }) {
    const res = await fetch(`/api/plans/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const body = await res.json().catch(() => null);
    if (res.ok && body?.plan) setPlan(body.plan as Plan);
  }

  async function handleDelete() {
    await fetch(`/api/plans/${id}`, { method: "DELETE" });
    router.push("/plans");
  }

  // Optimistic: move the task from `tasks` to `unassigned` and recompute the
  // plan's derived progress locally, rolling back on failure — same shape as
  // use-rules.ts's toggle (design.md "Technical Approach").
  async function unassignTask(taskId: string) {
    const previousTasks = tasks;
    const previousUnassigned = unassigned;
    const task = tasks.find((t) => t.id === taskId);
    if (!task || !plan) return;

    const nextTasks = tasks.filter((t) => t.id !== taskId);
    setTasks(nextTasks);
    setUnassigned((prev) => [...prev, { ...task, planId: null }]);
    setPlan({ ...plan, taskCount: nextTasks.length, doneCount: nextTasks.filter((t) => t.status === "done").length });

    const res = await fetch(`/api/action-items/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId: null }),
    });
    if (!res.ok) {
      setTasks(previousTasks);
      setUnassigned(previousUnassigned);
      setPlan({ ...plan, taskCount: previousTasks.length, doneCount: previousTasks.filter((t) => t.status === "done").length });
    }
  }

  async function assignTask() {
    if (!pickerId || !plan) return;
    const previousTasks = tasks;
    const previousUnassigned = unassigned;
    const task = unassigned.find((t) => t.id === pickerId);
    if (!task) return;

    const nextTasks = [...tasks, { ...task, planId: plan.id }];
    setTasks(nextTasks);
    setUnassigned((prev) => prev.filter((t) => t.id !== pickerId));
    setPlan({ ...plan, taskCount: nextTasks.length, doneCount: nextTasks.filter((t) => t.status === "done").length });
    setPickerId("");

    const res = await fetch(`/api/action-items/${pickerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId: plan.id }),
    });
    if (!res.ok) {
      setTasks(previousTasks);
      setUnassigned(previousUnassigned);
      setPlan({ ...plan, taskCount: previousTasks.length, doneCount: previousTasks.filter((t) => t.status === "done").length });
    }
  }

  if (loading) {
    return <p className="px-4 py-6 text-sm text-ink-secondary">Loading plan…</p>;
  }

  if (notFound || !plan) {
    return (
      <div className="px-4 py-6">
        <p className="text-sm text-ink-secondary">Plan not found.</p>
        <Link href="/plans" className="mt-2 inline-block text-sm text-departure">
          ← Back to Plans
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex items-center gap-2 rule-b px-4 py-3">
        <Link href="/plans" className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-tertiary hover:bg-surface-sunk">
          <ChevronLeft size={16} />
        </Link>
        <Input
          value={plan.title}
          onChange={(e) => setPlan({ ...plan, title: e.target.value })}
          onBlur={(e) => saveField({ title: e.target.value })}
          className="h-8 flex-1 rounded-lg text-sm font-semibold"
        />
        <Button variant="secondary" size="sm" className="rounded-lg" style={{ color: "var(--signal)" }} onClick={handleDelete}>
          Delete
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3 rule-b px-4 py-3">
        <Select value={plan.status} onValueChange={(v) => saveField({ status: v as PlanStatus })}>
          <SelectTrigger size="sm" className="h-8 w-32 rounded-lg">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(STATUS_LABEL) as PlanStatus[]).map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-1.5 text-xs text-ink-secondary">
          Target date
          <Input
            type="date"
            defaultValue={plan.targetDate ?? ""}
            onBlur={(e) => saveField({ targetDate: e.target.value || null })}
            className="h-8 w-36 rounded-lg"
          />
        </label>
        <span className="tabular text-xs text-ink-tertiary">
          {plan.taskCount === 0 ? "no tasks yet" : `${plan.doneCount}/${plan.taskCount} done`}
        </span>
      </div>

      <div className="rule-b px-4 py-3">
        <Textarea
          defaultValue={plan.description ?? ""}
          onBlur={(e) => saveField({ description: e.target.value || null })}
          placeholder="Description…"
          className="min-h-20 rounded-lg text-sm"
        />
      </div>

      <div className="px-4 py-5">
        <h2 className="mb-2 font-narrow text-[11px] font-bold uppercase tracking-wider text-ink-tertiary">
          Tasks ({tasks.length})
        </h2>
        {tasks.length === 0 && <p className="text-sm text-ink-tertiary">No tasks assigned yet.</p>}
        <div className="space-y-1.5">
          {tasks.map((t) => (
            <div key={t.id} className="flex items-center gap-2 rounded-lg border px-3 py-2" style={{ borderColor: "var(--rule)" }}>
              <span className="min-w-0 flex-1 truncate text-sm text-ink">{t.text}</span>
              <span className="shrink-0 text-xs text-ink-tertiary">{t.status}</span>
              <button
                onClick={() => unassignTask(t.id)}
                aria-label="Unassign from plan"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-ink-tertiary hover:bg-surface-sunk hover:text-ink"
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>

        {unassigned.length > 0 && (
          <div className="mt-3 flex items-center gap-2">
            <Select value={pickerId} onValueChange={setPickerId}>
              <SelectTrigger size="sm" className="h-8 flex-1 rounded-lg">
                <SelectValue placeholder="Assign an existing task…" />
              </SelectTrigger>
              <SelectContent>
                {unassigned.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.text}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" className="h-8 rounded-lg" disabled={!pickerId} onClick={assignTask}>
              Add to plan
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
