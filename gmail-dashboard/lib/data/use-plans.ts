"use client";

// Client-side read+write hook for /api/plans, following use-rules.ts's
// template — {data, loading, error, ...mutators}, AbortController cleanup,
// optimistic update with rollback on failure (design.md "Technical Approach").

import { useEffect, useState } from "react";
import type { Plan, PlanCategory, PlanStatus } from "./types";

export interface UsePlansResult {
  data: Plan[];
  loading: boolean;
  error: string | null;
  create: (input: {
    title: string;
    description?: string | null;
    targetDate?: string | null;
    category?: PlanCategory | null;
  }) => Promise<{ ok: boolean; error?: string }>;
  update: (
    id: string,
    patch: {
      title?: string;
      description?: string | null;
      status?: PlanStatus;
      targetDate?: string | null;
      category?: PlanCategory | null;
    }
  ) => Promise<{ ok: boolean; error?: string }>;
  remove: (id: string) => Promise<{ ok: boolean; error?: string }>;
}

export function usePlans(): UsePlansResult {
  const [data, setData] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/plans", { signal: controller.signal });
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(
            (body && typeof body.error === "string" && body.error) || `request failed with status ${res.status}`
          );
        }
        setData(body as Plan[]);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "failed to load plans");
      } finally {
        setLoading(false);
      }
    }

    load();

    return () => controller.abort();
  }, []);

  async function create(input: {
    title: string;
    description?: string | null;
    targetDate?: string | null;
    category?: PlanCategory | null;
  }) {
    try {
      const res = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) return { ok: false, error: (body && body.error) || "failed to create plan" };
      setData((prev) => [...prev, body as Plan]);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "failed to create plan" };
    }
  }

  async function update(
    id: string,
    patch: {
      title?: string;
      description?: string | null;
      status?: PlanStatus;
      targetDate?: string | null;
      category?: PlanCategory | null;
    }
  ) {
    const previous = data;
    setData((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));

    try {
      const res = await fetch(`/api/plans/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error((body && body.error) || "failed to update plan");
      setData((prev) => prev.map((p) => (p.id === id ? (body.plan as Plan) : p)));
      return { ok: true };
    } catch (err) {
      setData(previous);
      const message = err instanceof Error ? err.message : "failed to update plan";
      setError(message);
      return { ok: false, error: message };
    }
  }

  async function remove(id: string) {
    const previous = data;
    setData((prev) => prev.filter((p) => p.id !== id));

    try {
      const res = await fetch(`/api/plans/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("failed to delete plan");
      return { ok: true };
    } catch (err) {
      setData(previous);
      const message = err instanceof Error ? err.message : "failed to delete plan";
      setError(message);
      return { ok: false, error: message };
    }
  }

  return { data, loading, error, create, update, remove };
}
