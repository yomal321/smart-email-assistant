"use client";

// Extracted from app/(hub)/tasks/page.tsx so the Calendar page (0021) can
// reuse the exact same create flow instead of duplicating it. Tasks page's
// own usage is unchanged: it passes none of the showStartsAt/initial* props,
// so it still renders the original due-date-only compact form.
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ActionItem, Course, Source, TaskType } from "@/lib/data/types";

export const TYPE_LABEL: Record<TaskType, string> = {
  task: "Task",
  meeting: "Meeting",
  call: "Call",
  assignment: "Assignment",
  quiz: "Quiz",
  ca: "CA",
  exam: "Exam",
  admin: "Admin",
};

export function CreateTaskForm({
  sources,
  courses,
  onCreated,
  initialDueAt,
  initialStartsAt,
  initialDurationMinutes,
  showStartsAt = false,
}: {
  sources: Source[];
  courses: Course[];
  onCreated: (item: ActionItem) => void;
  initialDueAt?: string;
  initialStartsAt?: string;
  initialDurationMinutes?: number;
  showStartsAt?: boolean;
}) {
  const [text, setText] = React.useState("");
  const [type, setType] = React.useState<TaskType>(showStartsAt ? "meeting" : "task");
  const [sourceId, setSourceId] = React.useState<string>("");
  const [courseId, setCourseId] = React.useState<string>("");
  const [dueAt, setDueAt] = React.useState(initialDueAt ?? "");
  const [startsAt, setStartsAt] = React.useState(initialStartsAt ?? "");
  const [durationMinutes, setDurationMinutes] = React.useState(String(initialDurationMinutes ?? 60));
  const [weight, setWeight] = React.useState("3");
  const [effortMinutes, setEffortMinutes] = React.useState("30");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Neither university publishes a subscribable calendar — assignment/exam
  // dates come from portal pages as plain text, so this form (not the ICS
  // sync, which has nothing to poll for those two sources) is the real entry
  // point for academic deadlines. Only offer courses that belong to the
  // selected source, and only active ones.
  const coursesForSource = React.useMemo(
    () => courses.filter((c) => c.sourceId === sourceId && c.isActive),
    [courses, sourceId]
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSaving(true);
    setError(null);
    const res = await fetch("/api/action-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        type,
        sourceId: sourceId || null,
        courseId: courseId || null,
        dueAt: !showStartsAt && dueAt ? new Date(dueAt).toISOString() : null,
        startsAt: showStartsAt && startsAt ? new Date(startsAt).toISOString() : null,
        durationMinutes: showStartsAt && durationMinutes ? Number(durationMinutes) : null,
        weight: Number(weight),
        effortMinutes: Number(effortMinutes),
      }),
    });
    const body = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) {
      setError((body && body.error) || "failed to create task");
      return;
    }
    onCreated(body as ActionItem);
    setText("");
    setDueAt("");
    setStartsAt("");
    setType(showStartsAt ? "meeting" : "task");
    setCourseId("");
    setWeight("3");
    setEffortMinutes("30");
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2">
      <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="What needs doing…" className="h-8 min-w-48 flex-1 rounded-lg" />
      <Select value={type} onValueChange={(v) => setType(v as TaskType)}>
        <SelectTrigger size="sm" className="h-8 w-32 rounded-lg">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(TYPE_LABEL) as TaskType[]).map((t) => (
            <SelectItem key={t} value={t}>
              {TYPE_LABEL[t]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={sourceId}
        onValueChange={(v) => {
          setSourceId(v);
          setCourseId("");
        }}
      >
        <SelectTrigger size="sm" className="h-8 w-36 rounded-lg">
          <SelectValue placeholder="Source…" />
        </SelectTrigger>
        <SelectContent>
          {sources.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {coursesForSource.length > 0 && (
        <Select value={courseId} onValueChange={setCourseId}>
          <SelectTrigger size="sm" className="h-8 w-32 rounded-lg">
            <SelectValue placeholder="Course…" />
          </SelectTrigger>
          <SelectContent>
            {coursesForSource.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {showStartsAt ? (
        <>
          <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="h-8 rounded-lg" />
          <label className="flex items-center gap-1 text-xs text-ink-secondary">
            Duration (min)
            <Input
              type="number"
              min={5}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
              className="h-8 w-16 rounded-lg"
            />
          </label>
        </>
      ) : (
        <Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="h-8 rounded-lg" />
      )}
      <label className="flex items-center gap-1 text-xs text-ink-secondary">
        Weight
        <Input
          type="number"
          min={1}
          max={5}
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          className="h-8 w-14 rounded-lg"
        />
      </label>
      <label className="flex items-center gap-1 text-xs text-ink-secondary">
        Effort (min)
        <Input
          type="number"
          min={0}
          value={effortMinutes}
          onChange={(e) => setEffortMinutes(e.target.value)}
          className="h-8 w-16 rounded-lg"
        />
      </label>
      <Button type="submit" size="sm" className="h-8 rounded-lg" disabled={!text.trim() || saving}>
        {saving ? "Adding…" : "+ Add"}
      </Button>
      {error && <p className="text-xs" style={{ color: "var(--signal)" }}>{error}</p>}
    </form>
  );
}
