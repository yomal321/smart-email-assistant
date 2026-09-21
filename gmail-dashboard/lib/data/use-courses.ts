"use client";

// Client-side read+write hook for /api/courses, following use-plans.ts's
// template. No remove() — retiring a course is isActive: false via update(),
// matching app/api/courses/[id]/route.ts's no-DELETE design.

import { useEffect, useState } from "react";
import type { Course } from "./types";

export interface UseCoursesResult {
  data: Course[];
  loading: boolean;
  error: string | null;
  create: (input: { sourceId: string; code: string; name: string; semester?: string | null }) => Promise<{
    ok: boolean;
    error?: string;
  }>;
  update: (
    id: string,
    patch: { code?: string; name?: string; semester?: string | null; isActive?: boolean }
  ) => Promise<{ ok: boolean; error?: string }>;
}

export function useCourses(): UseCoursesResult {
  const [data, setData] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/courses", { signal: controller.signal });
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(
            (body && typeof body.error === "string" && body.error) || `request failed with status ${res.status}`
          );
        }
        setData(body as Course[]);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "failed to load courses");
      } finally {
        setLoading(false);
      }
    }

    load();

    return () => controller.abort();
  }, []);

  async function create(input: { sourceId: string; code: string; name: string; semester?: string | null }) {
    try {
      const res = await fetch("/api/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) return { ok: false, error: (body && body.error) || "failed to create course" };
      setData((prev) => [...prev, body as Course]);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "failed to create course" };
    }
  }

  async function update(id: string, patch: { code?: string; name?: string; semester?: string | null; isActive?: boolean }) {
    const previous = data;
    setData((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));

    try {
      const res = await fetch(`/api/courses/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error((body && body.error) || "failed to update course");
      setData((prev) => prev.map((c) => (c.id === id ? (body as Course) : c)));
      return { ok: true };
    } catch (err) {
      setData(previous);
      const message = err instanceof Error ? err.message : "failed to update course";
      setError(message);
      return { ok: false, error: message };
    }
  }

  return { data, loading, error, create, update };
}
