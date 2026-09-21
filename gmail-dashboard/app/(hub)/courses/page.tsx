"use client";

// Courses screen — the courses table (0016_life_load.sql) had zero UI before
// this: no way to see a course code/semester, or link a task to one, without
// raw SQL. A plain list + manual add, grouped by source.

import * as React from "react";
import { BookOpen } from "lucide-react";
import { useCourses } from "@/lib/data/use-courses";
import { useSources } from "@/lib/data/use-sources";
import { EmptyState } from "@/components/board/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SourcePlate } from "@/components/hub/source-plate";
import { StatusPill } from "@/components/hub/primitives";
import type { Course, Source } from "@/lib/data/types";

export default function CoursesPage() {
  const { data: courses, loading: coursesLoading, create, update } = useCourses();
  const { data: sources, loading: sourcesLoading } = useSources();
  const [showInactive, setShowInactive] = React.useState(false);

  const loading = coursesLoading || sourcesLoading;
  const sourceById = React.useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources]);
  const academicSources = React.useMemo(() => sources.filter((s) => s.kind === "academic"), [sources]);
  const visible = showInactive ? courses : courses.filter((c) => c.isActive);

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-ground">
      <div className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-ink">Courses</h1>
            <p className="text-sm text-ink-secondary">Course codes and semesters behind the weight-based priority score.</p>
          </div>
          <button
            onClick={() => setShowInactive((v) => !v)}
            className="rounded-lg px-2.5 py-1 text-xs font-medium text-ink-tertiary transition-colors hover:bg-surface-sunk"
          >
            {showInactive ? "Hide inactive" : "Show inactive"}
          </button>
        </div>

        <div className="card-surface p-4">
          <CreateCourseForm sources={academicSources} onCreate={create} />
        </div>

        <div className="card-surface overflow-hidden">
          {loading && <p className="px-4 py-6 text-sm text-ink-secondary">Loading courses…</p>}

          {!loading && visible.length === 0 && (
            <EmptyState
              icon={BookOpen}
              heading="No courses yet."
              body="Add a course to link it against tasks, or wait for the calendar sync to pick one up from the feed."
            />
          )}

          {!loading &&
            visible.map((course) => (
              <CourseRow key={course.id} course={course} source={sourceById.get(course.sourceId)} onUpdate={update} />
            ))}
        </div>
      </div>
    </div>
  );
}

function CourseRow({
  course,
  source,
  onUpdate,
}: {
  course: Course;
  source: Source | undefined;
  onUpdate: ReturnType<typeof useCourses>["update"];
}) {
  return (
    <div className="flex items-center gap-3 rule-b px-4 py-3 last:border-b-0">
      {source && <SourcePlate source={source} />}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">
          {course.code} — {course.name}
        </p>
        {course.semester && <p className="mt-0.5 text-xs text-ink-tertiary">{course.semester}</p>}
      </div>
      {!course.isActive && <StatusPill tone="neutral">Inactive</StatusPill>}
      <Button
        variant="ghost"
        size="sm"
        className="h-7 rounded-lg text-xs"
        onClick={() => onUpdate(course.id, { isActive: !course.isActive })}
      >
        {course.isActive ? "Retire" : "Reactivate"}
      </Button>
    </div>
  );
}

function CreateCourseForm({
  sources,
  onCreate,
}: {
  sources: Source[];
  onCreate: ReturnType<typeof useCourses>["create"];
}) {
  const [sourceId, setSourceId] = React.useState<string>("");
  const [code, setCode] = React.useState("");
  const [name, setName] = React.useState("");
  const [semester, setSemester] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const effectiveSourceId = sourceId || sources[0]?.id || "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!effectiveSourceId || !code.trim() || !name.trim()) return;
    setSaving(true);
    setError(null);
    const result = await onCreate({
      sourceId: effectiveSourceId,
      code: code.trim(),
      name: name.trim(),
      semester: semester.trim() || null,
    });
    setSaving(false);
    if (result.ok) {
      setCode("");
      setName("");
      setSemester("");
    } else {
      setError(result.error ?? "failed to create course");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2">
      <Select value={effectiveSourceId} onValueChange={setSourceId}>
        <SelectTrigger className="h-8 w-40 rounded-lg text-xs">
          <SelectValue placeholder="University" />
        </SelectTrigger>
        <SelectContent>
          {sources.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="HICT 2103" className="h-8 w-28 rounded-lg" />
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Course name…"
        className="h-8 flex-1 min-w-[10rem] rounded-lg"
      />
      <Input
        value={semester}
        onChange={(e) => setSemester(e.target.value)}
        placeholder="2026-S1"
        className="h-8 w-24 rounded-lg"
      />
      <Button type="submit" size="sm" className="h-8 rounded-lg" disabled={!effectiveSourceId || !code.trim() || !name.trim() || saving}>
        {saving ? "Adding…" : "+ Add course"}
      </Button>
      {error && (
        <p className="text-xs" style={{ color: "var(--signal)" }}>
          {error}
        </p>
      )}
    </form>
  );
}
