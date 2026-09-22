// The hourly counterpart to calendar-month.tsx. Reuses the exact
// percentage-of-track math schedule-timeline.tsx already built for its
// single-day 07:00-22:00 axis, just repeated across 7 day columns instead
// of one.
"use client";

import * as React from "react";
import { dayKey, DEFAULT_TIME_ZONE } from "@/lib/day-key";
import {
  WINDOW_START_MIN,
  WINDOW_END_MIN,
  HOUR_MARKS,
  MIN_BLOCK_PCT,
  clampToWindowPct,
  formatClock,
} from "@/components/hub/schedule-timeline";
import { SourcePlate } from "@/components/hub/source-plate";
import type { ActionItem, Source } from "@/lib/data/types";
import { cn } from "@/lib/utils";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SLOT_HOURS = Array.from({ length: (WINDOW_END_MIN - WINDOW_START_MIN) / 60 }, (_, i) => WINDOW_START_MIN / 60 + i);

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function minutesOfDay(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

export function CalendarWeek({
  items,
  sourceById,
  weekStart,
  selectedDay,
  onSelectDay,
  onSelectSlot,
}: {
  items: ActionItem[];
  sourceById: Map<string, Source>;
  weekStart: Date; // Monday
  selectedDay: string | null;
  onSelectDay: (key: string) => void;
  onSelectSlot: (key: string, hour: number) => void;
}) {
  const todayKey = React.useMemo(() => dayKey(new Date().toISOString(), DEFAULT_TIME_ZONE), []);

  const days = React.useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const date = addDays(weekStart, i);
        return { date, key: dayKey(date.toISOString(), DEFAULT_TIME_ZONE) };
      }),
    [weekStart]
  );

  const { scheduledByDay, allDayByDay } = React.useMemo(() => {
    const scheduled = new Map<string, ActionItem[]>();
    const allDay = new Map<string, ActionItem[]>();
    for (const item of items) {
      if (item.startsAt) {
        const key = dayKey(item.startsAt, DEFAULT_TIME_ZONE);
        const list = scheduled.get(key);
        if (list) list.push(item);
        else scheduled.set(key, [item]);
      } else if (item.dueAt) {
        const key = dayKey(item.dueAt, DEFAULT_TIME_ZONE);
        const list = allDay.get(key);
        if (list) list.push(item);
        else allDay.set(key, [item]);
      }
    }
    return { scheduledByDay: scheduled, allDayByDay: allDay };
  }, [items]);

  return (
    <div className="card-surface overflow-hidden">
      <div className="grid grid-cols-[3rem_repeat(7,1fr)] border-b border-rule">
        <div />
        {days.map((d, idx) => (
          <button
            key={d.key}
            onClick={() => onSelectDay(d.key)}
            className={cn(
              "flex flex-col items-center gap-0.5 border-l border-rule px-1 py-1.5 text-center hover:bg-surface-raised",
              d.key === selectedDay && "bg-surface-raised"
            )}
          >
            <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-tertiary">
              {WEEKDAY_LABELS[idx]}
            </span>
            <span
              className={cn(
                "tabular rounded-full px-1.5 text-xs text-ink-secondary",
                d.key === todayKey && "bg-departure font-semibold text-departure-ink"
              )}
            >
              {d.date.getDate()}
            </span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-[3rem_repeat(7,1fr)] border-b border-rule">
        <div className="px-1 py-1 text-right text-[10px] text-ink-tertiary">All day</div>
        {days.map((d) => {
          const dayItems = allDayByDay.get(d.key) ?? [];
          return (
            <div key={d.key} className="flex min-w-0 flex-col gap-0.5 border-l border-rule p-1 min-h-8">
              {dayItems.slice(0, 3).map((item) => {
                const source = item.sourceId ? sourceById.get(item.sourceId) : undefined;
                return (
                  <button
                    key={item.id}
                    onClick={() => onSelectDay(d.key)}
                    className="flex w-full min-w-0 items-center gap-1 overflow-hidden rounded px-0.5 text-left hover:bg-surface-raised"
                  >
                    {source && <SourcePlate source={source} size="sm" />}
                    <span className="min-w-0 flex-1 truncate text-[11px] text-ink">{item.text}</span>
                  </button>
                );
              })}
              {dayItems.length > 3 && <span className="px-0.5 text-[10px] text-ink-tertiary">+{dayItems.length - 3} more</span>}
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-[3rem_repeat(7,1fr)]">
        <div className="relative" style={{ height: 600 }}>
          {HOUR_MARKS.map((hour) => (
            <span
              key={hour}
              className="tabular absolute right-1 -translate-y-1/2 text-[10px] text-ink-tertiary"
              style={{ top: `${clampToWindowPct(hour * 60)}%` }}
            >
              {String(hour).padStart(2, "0")}:00
            </span>
          ))}
        </div>

        {days.map((d) => {
          const dayItems = scheduledByDay.get(d.key) ?? [];
          return (
            <div key={d.key} className="relative min-w-0 border-l border-rule" style={{ height: 600 }}>
              {HOUR_MARKS.map((hour) => (
                <div key={hour} className="absolute left-0 right-0 border-t border-rule" style={{ top: `${clampToWindowPct(hour * 60)}%` }} />
              ))}

              {SLOT_HOURS.map((hour) => (
                <button
                  key={hour}
                  aria-label={`Add at ${hour}:00`}
                  onClick={() => onSelectSlot(d.key, hour)}
                  className="absolute left-0 right-0 hover:bg-surface-raised"
                  style={{
                    top: `${clampToWindowPct(hour * 60)}%`,
                    height: `${clampToWindowPct((hour + 1) * 60) - clampToWindowPct(hour * 60)}%`,
                  }}
                />
              ))}

              {dayItems.map((item) => {
                const start = minutesOfDay(item.startsAt!);
                const duration = item.durationMinutes ?? item.effortMinutes ?? 30;
                const topPct = clampToWindowPct(start);
                const heightPct = Math.max(MIN_BLOCK_PCT, clampToWindowPct(start + duration) - topPct);
                const source = item.sourceId ? sourceById.get(item.sourceId) : undefined;
                return (
                  <button
                    key={item.id}
                    onClick={() => onSelectDay(d.key)}
                    className="absolute left-0.5 right-0.5 overflow-hidden rounded-lg border-l-[3px] bg-surface-raised px-1.5 py-0.5 text-left shadow-card"
                    style={{ top: `${topPct}%`, height: `${heightPct}%`, borderLeftColor: source?.color ?? "var(--ink-tertiary)" }}
                    title={`${formatClock(item.startsAt!)} · ${item.text}`}
                  >
                    <p className="truncate text-[11px] font-medium text-ink">{item.text}</p>
                    <p className="tabular truncate text-[10px] text-ink-tertiary">{formatClock(item.startsAt!)}</p>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
