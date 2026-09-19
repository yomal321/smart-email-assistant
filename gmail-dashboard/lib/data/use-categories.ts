"use client"

// Client-side read+write hook for /api/categories, following
// use-sync-state.ts's template.

import { useEffect, useState } from "react";
import type { Category } from "./types";

export interface UseCategoriesResult {
  data: Category[];
  loading: boolean;
  error: string | null;
  rename: (key: string, label: string) => Promise<void>;
}

export function useCategories(): UseCategoriesResult {
  const [data, setData] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/categories", { signal: controller.signal });
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(
            (body && typeof body.error === "string" && body.error) || `request failed with status ${res.status}`
          );
        }
        setData(body as Category[]);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "failed to load categories");
      } finally {
        setLoading(false);
      }
    }

    load();

    return () => controller.abort();
  }, []);

  async function rename(key: string, label: string) {
    const previous = data;
    setData((prev) => prev.map((c) => (c.key === key ? { ...c, label } : c)));

    try {
      const res = await fetch("/api/categories/rename", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, label }),
      });
      if (!res.ok) throw new Error("failed to rename category");
    } catch (err) {
      setData(previous);
      setError(err instanceof Error ? err.message : "failed to rename category");
    }
  }

  return { data, loading, error, rename };
}
