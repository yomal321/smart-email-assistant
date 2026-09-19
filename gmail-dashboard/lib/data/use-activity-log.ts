"use client"

// Client-side read hook for /api/activity, following use-sync-state.ts's
// template.

import { useEffect, useState } from "react";
import type { ActivityLogEntry } from "./types";

export interface UseActivityLogResult {
  data: ActivityLogEntry[];
  loading: boolean;
  error: string | null;
}

export function useActivityLog(): UseActivityLogResult {
  const [data, setData] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/activity", { signal: controller.signal });
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(
            (body && typeof body.error === "string" && body.error) || `request failed with status ${res.status}`
          );
        }
        setData(body as ActivityLogEntry[]);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "failed to load activity log");
      } finally {
        setLoading(false);
      }
    }

    load();

    return () => controller.abort();
  }, []);

  return { data, loading, error };
}
