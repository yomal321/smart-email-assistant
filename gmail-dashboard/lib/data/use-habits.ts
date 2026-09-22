"use client";

// Client-side read+write hook for /api/habits, following use-plans.ts's
// template — {data, loading, error, ...mutators}, AbortController cleanup.
// Toggling a day is optimistic (the grid must feel instant on tap); a
// failed request rolls the single cell back rather than reloading the
// whole list.

import { useEffect, useState } from "react";
import type { Habit } from "./types";

export interface UseHabitsResult {
  data: Habit[];
  windowDays: string[];
  timeZone: string;
  loading: boolean;
  error: string | null;
  create: (name: string) => Promise<{ ok: boolean; error?: string }>;
  archive: (id: string) => Promise<{ ok: boolean; error?: string }>;
  toggle: (id: string, day: string) => Promise<{ ok: boolean; error?: string }>;
}

export function useHabits(): UseHabitsResult {
  const [data, setData] = useState<Habit[]>([]);
  const [windowDays, setWindowDays] = useState<string[]>([]);
  const [timeZone, setTimeZone] = useState("Asia/Colombo");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/habits", { signal: controller.signal });
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error((body && body.error) || `request failed with status ${res.status}`);
        }
        setData(body.habits as Habit[]);
        setWindowDays(body.windowDays as string[]);
        setTimeZone(body.timeZone as string);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "failed to load habits");
      } finally {
        setLoading(false);
      }
    }

    load();
    return () => controller.abort();
  }, []);

  async function create(name: string) {
    try {
      const res = await fetch("/api/habits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) return { ok: false, error: (body && body.error) || "failed to create habit" };
      setData((prev) => [...prev, { ...(body as Habit), loggedDays: [] }]);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "failed to create habit" };
    }
  }

  async function archive(id: string) {
    const previous = data;
    setData((prev) => prev.filter((h) => h.id !== id));
    try {
      const res = await fetch(`/api/habits/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archivedAt: new Date().toISOString() }),
      });
      if (!res.ok) throw new Error("failed to archive habit");
      return { ok: true };
    } catch (err) {
      setData(previous);
      return { ok: false, error: err instanceof Error ? err.message : "failed to archive habit" };
    }
  }

  async function toggle(id: string, day: string) {
    const previous = data;
    setData((prev) =>
      prev.map((h) =>
        h.id === id
          ? {
              ...h,
              loggedDays: h.loggedDays.includes(day) ? h.loggedDays.filter((d) => d !== day) : [...h.loggedDays, day],
            }
          : h
      )
    );

    try {
      const res = await fetch(`/api/habits/${id}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day }),
      });
      if (!res.ok) throw new Error("failed to toggle habit day");
      return { ok: true };
    } catch (err) {
      setData(previous);
      return { ok: false, error: err instanceof Error ? err.message : "failed to toggle habit day" };
    }
  }

  return { data, windowDays, timeZone, loading, error, create, archive, toggle };
}
