"use client";

// Client-side read hook for /api/saved-views, following use-settings.ts's
// template: "use client", fetch-on-mount via useEffect, an AbortController to
// cancel on unmount, plain { data, loading, error }.

import { useEffect, useState } from "react";
import type { SavedView } from "./types";

export interface UseSavedViewsResult {
  data: SavedView[];
  loading: boolean;
  error: string | null;
}

export function useSavedViews(): UseSavedViewsResult {
  const [data, setData] = useState<SavedView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/saved-views", { signal: controller.signal });
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(
            (body && typeof body.error === "string" && body.error) || `request failed with status ${res.status}`
          );
        }
        setData(body as SavedView[]);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "failed to load saved views");
      } finally {
        setLoading(false);
      }
    }

    load();

    return () => controller.abort();
  }, []);

  return { data, loading, error };
}
