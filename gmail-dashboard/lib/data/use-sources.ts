"use client";

// Client-side read+update hook for /api/sources, following use-plans.ts's
// template. No create/delete — sources are seeded once (0016_life_load.sql)
// and only ever renamed/recoloured/re-fed in place.

import { useEffect, useState } from "react";
import type { Source } from "./types";

export interface UseSourcesResult {
  data: Source[];
  loading: boolean;
  error: string | null;
  update: (
    id: string,
    patch: { name?: string; color?: string; code?: string; icsUrl?: string | null }
  ) => Promise<{ ok: boolean; error?: string }>;
}

export function useSources(): UseSourcesResult {
  const [data, setData] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/sources", { signal: controller.signal });
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(
            (body && typeof body.error === "string" && body.error) || `request failed with status ${res.status}`
          );
        }
        setData(body as Source[]);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "failed to load sources");
      } finally {
        setLoading(false);
      }
    }

    load();

    return () => controller.abort();
  }, []);

  async function update(
    id: string,
    patch: { name?: string; color?: string; code?: string; icsUrl?: string | null }
  ) {
    const previous = data;
    setData((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));

    try {
      const res = await fetch(`/api/sources/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error((body && body.error) || "failed to update source");
      setData((prev) => prev.map((s) => (s.id === id ? (body as Source) : s)));
      return { ok: true };
    } catch (err) {
      setData(previous);
      const message = err instanceof Error ? err.message : "failed to update source";
      setError(message);
      return { ok: false, error: message };
    }
  }

  return { data, loading, error, update };
}
