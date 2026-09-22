"use client";

// Habits — a 7-day checkbox grid + streak per habit. Deliberately thin per
// spec.md's own warning against overbuilding a habit tracker: no heatmap,
// no stats page, no reminders. See PHASE-7-IMPLEMENTATION-PLAN.md Wave 3.

import * as React from "react";
import { Flame, X } from "lucide-react";
import { useHabits } from "@/lib/data/use-habits";
import { EmptyState } from "@/components/board/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { currentStreak } from "@/lib/streak";
import { dayKey, formatDayLabel } from "@/lib/day-key";

const GRID_DAYS = 7; // most recent 7 of the API's 14-day window — a wider grid buys nothing on a phone screen

export default function HabitsPage() {
  const { data: habits, windowDays, timeZone, loading, create, archive, toggle } = useHabits();
  const [name, setName] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const todayKey = dayKey(new Date().toISOString(), timeZone);
  // windowDays is newest-first (route.ts walks backward from now) — take the
  // first GRID_DAYS and reverse so the grid reads oldest-to-newest, left to right.
  const gridDays = [...windowDays.slice(0, GRID_DAYS)].reverse();

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const result = await create(name.trim());
    setSaving(false);
    if (result.ok) setName("");
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-ground">
      <div className="space-y-4 p-4">
        <div>
          <h1 className="text-lg font-semibold text-ink">Habits</h1>
          <p className="text-sm text-ink-secondary">A daily checklist and streak — nothing more.</p>
        </div>

        <div className="card-surface p-4">
          <form onSubmit={handleCreate} className="flex items-center gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="New habit — e.g. Study, Exercise, Linux practice…"
              className="h-8 flex-1 rounded-lg"
            />
            <Button type="submit" size="sm" className="h-8 rounded-lg" disabled={!name.trim() || saving}>
              {saving ? "Adding…" : "+ Add habit"}
            </Button>
          </form>
        </div>

        <div className="card-surface overflow-hidden">
          {loading && <p className="px-4 py-6 text-sm text-ink-secondary">Loading habits…</p>}

          {!loading && habits.length === 0 && (
            <EmptyState
              icon={Flame}
              heading="No habits yet."
              body="Add one above — study, exercise, reading, whatever you want to track daily."
            />
          )}

          {!loading && habits.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="rule-b text-left">
                    <th className="px-4 py-2 text-xs font-medium text-ink-tertiary">Habit</th>
                    {gridDays.map((day) => (
                      <th key={day} className="w-10 px-1 py-2 text-center text-[10px] font-medium text-ink-tertiary">
                        {formatDayLabel(day, timeZone).slice(0, 3)}
                      </th>
                    ))}
                    <th className="w-16 px-2 py-2 text-center text-xs font-medium text-ink-tertiary">Streak</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {habits.map((habit) => {
                    const streak = currentStreak(habit.loggedDays, todayKey);
                    return (
                      <tr key={habit.id} className="rule-b last:border-b-0">
                        <td className="px-4 py-2 text-sm text-ink">{habit.name}</td>
                        {gridDays.map((day) => {
                          const done = habit.loggedDays.includes(day);
                          return (
                            <td key={day} className="px-1 py-2 text-center">
                              <button
                                onClick={() => toggle(habit.id, day)}
                                aria-label={`${habit.name} — ${day} — ${done ? "done" : "not done"}`}
                                className={`mx-auto flex h-6 w-6 items-center justify-center rounded-md border transition-colors ${
                                  done
                                    ? "border-departure bg-departure"
                                    : "border-rule bg-surface-sunk hover:border-departure"
                                }`}
                              />
                            </td>
                          );
                        })}
                        <td className="px-2 py-2 text-center">
                          {streak > 0 && (
                            <span className="tabular inline-flex items-center gap-1 text-xs font-medium text-ink">
                              <Flame size={12} className="text-signal" />
                              {streak}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-center">
                          <button
                            onClick={() => archive(habit.id)}
                            aria-label={`Archive ${habit.name}`}
                            className="text-ink-tertiary hover:text-ink"
                          >
                            <X size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
