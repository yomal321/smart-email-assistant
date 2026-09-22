// A real month grid, unlike schedule-timeline.tsx (today only, hour axis)
// and fortnight-chart.tsx (14-day bar chart) — those stay as they are for
// the Today page; this is the dedicated calendar view.
//
// No date library: native Date/Intl, same convention as lib/day-key.ts.
// Every cell date is anchored at noon UTC before being run through
// dayKey() so the key can't slide a day in a negative-offset render
// environment — the same trick formatDayLabel() already uses.
"use client";

import * as React from "react";
import { dayKey, DEFAULT_TIME_ZONE } from "@/lib/day-key";
import { formatClock } from "@/components/hub/schedule-timeline";
import { SourcePlate } from "@/components/hub/source-plate";
import type { ActionItem, Source } from "@/lib/data/types";
import { cn } from "@/lib/utils";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_CHIPS_PER_CELL = 3;

function keyForUtcNoon(year: number, monthIndex: number, day: number): string {
  return dayKey(new Date(Date.UTC(year, monthIndex, day, 12, 0, 0)).toISOString(), DEFAULT_TIME_ZONE);
}

export function CalendarMonth({
  items,
  sourceById,
  month,
  selectedDay,
  onSelectDay,
}: {
  items: ActionItem[];
  sourceById: Map<string, Source>;
  month: Date;
  selectedDay: string | null;
  onSelectDay: (key: string) => void;
}) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const todayKey = React.useMemo(() => dayKey(new Date().toISOString(), DEFAULT_TIME_ZONE), []);

  const itemsByDay = React.useMemo(() => {
    const map = new Map<string, ActionItem[]>();
    for (const item of items) {
      const anchor = item.startsAt ?? item.dueAt;
      if (!anchor) continue;
      const key = dayKey(anchor, DEFAULT_TIME_ZONE);
      const list = map.get(key);
      if (list) list.push(item);
      else map.set(key, [item]);
    }
    return map;
  }, [items]);

  const cells = React.useMemo(() => {
    const firstWeekday = (new Date(Date.UTC(year, monthIndex, 1)).getUTCDay() + 6) % 7; // 0 = Monday
    const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
    const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;

    return Array.from({ length: totalCells }, (_, i) => {
      const dayNum = i - firstWeekday + 1;
      return {
        key: keyForUtcNoon(year, monthIndex, dayNum),
        dayNum: new Date(Date.UTC(year, monthIndex, dayNum, 12, 0, 0)).getUTCDate(),
        inMonth: dayNum >= 1 && dayNum <= daysInMonth,
      };
    });
  }, [year, monthIndex]);

  return (
    <div className="card-surface overflow-hidden">
      <div className="grid grid-cols-7 border-b border-rule">
        {WEEKDAY_LABELS.map((w) => (
          <div key={w} className="px-2 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-ink-tertiary">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((cell) => {
          const dayItems = itemsByDay.get(cell.key) ?? [];
          const overflow = dayItems.length - MAX_CHIPS_PER_CELL;
          const isToday = cell.key === todayKey;
          return (
            <button
              key={cell.key}
              onClick={() => onSelectDay(cell.key)}
              className={cn(
                "flex min-h-24 min-w-0 flex-col gap-1 border-b border-r border-rule p-1.5 text-left transition-colors hover:bg-surface-raised",
                cell.inMonth ? "bg-surface" : "bg-surface-sunk opacity-60",
                cell.key === selectedDay && "ring-2 ring-inset ring-departure"
              )}
            >
              <span
                className={cn(
                  "tabular self-start rounded-full px-1.5 text-xs text-ink-secondary",
                  isToday && "bg-departure font-semibold text-departure-ink"
                )}
              >
                {cell.dayNum}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5 overflow-hidden">
                {dayItems.slice(0, MAX_CHIPS_PER_CELL).map((item) => {
                  const source = item.sourceId ? sourceById.get(item.sourceId) : undefined;
                  const at = item.startsAt ?? item.dueAt;
                  return (
                    <div key={item.id} className="flex min-w-0 items-center gap-1 overflow-hidden">
                      {source && <SourcePlate source={source} size="sm" />}
                      <span className="tabular min-w-0 flex-1 truncate text-[11px] text-ink">
                        {at && `${formatClock(at)} `}
                        {item.text}
                      </span>
                    </div>
                  );
                })}
                {overflow > 0 && <span className="text-[11px] text-ink-tertiary">+{overflow} more</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
