"use client";

// The in-app calendar the hub was missing — Push-To-Calendar (0020) already
// writes tasks out to Google Calendar, but until now the only place to see
// them laid out on a grid was Google Calendar itself. This page reads the
// exact same `tasks` table, through the same `/api/action-items` +
// `/api/sources` + `/api/courses` endpoints app/(hub)/tasks/page.tsx already
// uses — no new API route, no date-range param: the full task list is small
// enough (personal task list, not paginated data) to fetch once and bucket
// by day client-side, same as fortnight-chart.tsx already does for its
// 14-day view.
//
// Month and week views share one `cursor` date and one day/create Sheet:
// clicking a day (month, or a week header/all-day chip) opens it with
// "Due date" prefilled; clicking an hourly slot (week only) opens it with
// "Starts at" prefilled to that exact hour instead. Either way it's the
// same CreateTaskForm (components/hub/create-task-form.tsx) that Tasks
// already uses, POSTing to the same /api/action-items.

import * as React from "react";
import { CalendarDays, Clock, ChevronLeft, ChevronRight } from "lucide-react";
import { EmptyState } from "@/components/board/empty-state";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PillTabs, StatusPill, type Tone } from "@/components/hub/primitives";
import { CalendarMonth } from "@/components/hub/calendar-month";
import { CalendarWeek } from "@/components/hub/calendar-week";
import { CreateTaskForm } from "@/components/hub/create-task-form";
import { SourcePlate } from "@/components/hub/source-plate";
import { dayKey, formatDayLabel, DEFAULT_TIME_ZONE } from "@/lib/day-key";
import type { ActionItem, Course, Source } from "@/lib/data/types";

const STATUS_LABEL: Record<ActionItem["status"], string> = {
  todo: "To do",
  "in-progress": "In progress",
  done: "Done",
};

const STATUS_TONE: Record<ActionItem["status"], Tone> = {
  todo: "neutral",
  "in-progress": "info",
  done: "success",
};

function mondayOf(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - offset);
  return d;
}

export default function HubCalendarPage() {
  const [items, setItems] = React.useState<ActionItem[]>([]);
  const [sources, setSources] = React.useState<Source[]>([]);
  const [courses, setCourses] = React.useState<Course[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [viewMode, setViewMode] = React.useState<"month" | "week">("month");
  const [cursor, setCursor] = React.useState(() => new Date());
  const [selectedDay, setSelectedDay] = React.useState<string | null>(null);
  const [selectedHour, setSelectedHour] = React.useState<number | null>(null);

  React.useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch("/api/action-items", { signal: controller.signal }).then((r) => r.json()),
      fetch("/api/sources", { signal: controller.signal }).then((r) => r.json()),
      fetch("/api/courses", { signal: controller.signal }).then((r) => r.json()),
    ])
      .then(([taskBody, sourceBody, courseBody]) => {
        setItems(Array.isArray(taskBody) ? taskBody : []);
        setSources(Array.isArray(sourceBody) ? sourceBody : []);
        setCourses(Array.isArray(courseBody) ? courseBody : []);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const sourceById = React.useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources]);
  const weekStart = React.useMemo(() => mondayOf(cursor), [cursor]);

  const selectedItems = React.useMemo(() => {
    if (!selectedDay) return [];
    return items
      .filter((item) => {
        const anchor = item.startsAt ?? item.dueAt;
        return anchor && dayKey(anchor, DEFAULT_TIME_ZONE) === selectedDay;
      })
      .sort((a, b) => (a.startsAt ?? a.dueAt ?? "").localeCompare(b.startsAt ?? b.dueAt ?? ""));
  }, [items, selectedDay]);

  function openDay(key: string) {
    setSelectedDay(key);
    setSelectedHour(null);
  }

  function openSlot(key: string, hour: number) {
    setSelectedDay(key);
    setSelectedHour(hour);
  }

  function closeSheet(open: boolean) {
    if (!open) {
      setSelectedDay(null);
      setSelectedHour(null);
    }
  }

  async function markDone(id: string) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status: "done" } : i)));
    await fetch(`/api/action-items/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    });
  }

  function step(dir: 1 | -1) {
    setCursor((c) =>
      viewMode === "month" ? new Date(c.getFullYear(), c.getMonth() + dir, 1) : new Date(c.getFullYear(), c.getMonth(), c.getDate() + dir * 7)
    );
  }

  const label =
    viewMode === "month"
      ? cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })
      : `${weekStart.toLocaleDateString(undefined, { day: "numeric", month: "short" })} – ${new Date(
          weekStart.getFullYear(),
          weekStart.getMonth(),
          weekStart.getDate() + 6
        ).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`;

  const hasAnyDated = items.some((i) => i.startsAt || i.dueAt);

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-ground">
      <div className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-ink">Calendar</h1>
            <p className="text-sm text-ink-secondary">Every dated task, on a grid — the same rows as Tasks.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PillTabs
              tabs={[
                { key: "month", label: "Month" },
                { key: "week", label: "Week" },
              ]}
              active={viewMode}
              onChange={(k) => setViewMode(k as "month" | "week")}
            />
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="icon-sm" className="rounded-lg" onClick={() => step(-1)} aria-label={viewMode === "month" ? "Previous month" : "Previous week"}>
                <ChevronLeft size={16} />
              </Button>
              <Button variant="outline" size="sm" className="min-w-40 rounded-lg justify-center" onClick={() => setCursor(new Date())}>
                {label}
              </Button>
              <Button variant="outline" size="icon-sm" className="rounded-lg" onClick={() => step(1)} aria-label={viewMode === "month" ? "Next month" : "Next week"}>
                <ChevronRight size={16} />
              </Button>
            </div>
          </div>
        </div>

        {loading && <p className="px-1 text-sm text-ink-secondary">Loading calendar…</p>}

        {!loading && !hasAnyDated && (
          <EmptyState
            icon={CalendarDays}
            heading="Nothing scheduled yet."
            body="Tasks with a due date or start time (from Tasks, or synced in from a course's ICS feed) will show up here."
          />
        )}

        {!loading && hasAnyDated && viewMode === "month" && (
          <CalendarMonth items={items} sourceById={sourceById} month={cursor} selectedDay={selectedDay} onSelectDay={openDay} />
        )}

        {!loading && hasAnyDated && viewMode === "week" && (
          <CalendarWeek items={items} sourceById={sourceById} weekStart={weekStart} selectedDay={selectedDay} onSelectDay={openDay} onSelectSlot={openSlot} />
        )}
      </div>

      <Sheet open={selectedDay !== null} onOpenChange={closeSheet}>
        <SheetContent side="right" className="gap-0">
          <SheetHeader>
            <SheetTitle>{selectedDay ? formatDayLabel(selectedDay, DEFAULT_TIME_ZONE) : ""}</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-4">
            {selectedDay && (
              <div className="card-surface p-3">
                <CreateTaskForm
                  key={`${selectedDay}-${selectedHour}`}
                  sources={sources}
                  courses={courses}
                  showStartsAt={selectedHour !== null}
                  initialDueAt={selectedHour === null ? `${selectedDay}T09:00` : undefined}
                  initialStartsAt={selectedHour !== null ? `${selectedDay}T${String(selectedHour).padStart(2, "0")}:00` : undefined}
                  initialDurationMinutes={60}
                  onCreated={(item) => setItems((prev) => [item, ...prev])}
                />
              </div>
            )}

            {selectedItems.length === 0 && <p className="text-sm text-ink-secondary">Nothing else on this day.</p>}
            {selectedItems.map((item) => {
              const source = item.sourceId ? sourceById.get(item.sourceId) : undefined;
              const at = item.startsAt ?? item.dueAt;
              return (
                <div key={item.id} className="flex items-center gap-3 rule-b py-2.5 last:border-b-0">
                  {item.status !== "done" && (
                    <input type="checkbox" checked={false} onChange={() => markDone(item.id)} className="h-4 w-4 accent-departure" aria-label="Mark done" />
                  )}
                  {source && <SourcePlate source={source} />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ink">{item.text}</p>
                    {at && (
                      <div className="mt-1">
                        <StatusPill tone={item.startsAt ? "primary" : "warning"}>
                          <Clock size={11} className="shrink-0" />{" "}
                          {item.startsAt
                            ? `${new Date(at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false })}${item.durationMinutes ? ` · ${item.durationMinutes}m` : ""}`
                            : `Due ${new Date(at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false })}`}
                        </StatusPill>
                      </div>
                    )}
                  </div>
                  <StatusPill tone={STATUS_TONE[item.status]}>{STATUS_LABEL[item.status]}</StatusPill>
                </div>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
