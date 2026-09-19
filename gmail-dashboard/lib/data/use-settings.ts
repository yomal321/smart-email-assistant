"use client"

// Client-side read+write hook for /api/settings, following use-sync-state.ts's
// template: "use client", fetch-on-mount via useEffect, an AbortController to
// cancel on unmount, plain { data, loading, error }. `update` PATCHes and
// optimistically applies the change locally, rolling back on failure.

import { useEffect, useState } from "react";
import type { Settings } from "./types";

export interface UseSettingsResult {
  data: Settings | null;
  loading: boolean;
  error: string | null;
  update: (partial: Partial<Settings>) => Promise<void>;
}

export function useSettings(): UseSettingsResult {
  const [data, setData] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/settings", { signal: controller.signal });
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(
            (body && typeof body.error === "string" && body.error) || `request failed with status ${res.status}`
          );
        }
        setData(body as Settings);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "failed to load settings");
      } finally {
        setLoading(false);
      }
    }

    load();

    return () => controller.abort();
  }, []);

  async function update(partial: Partial<Settings>) {
    const previous = data;
    setData((d) => (d ? { ...d, ...partial } : d));

    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(partial),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error((body && body.error) || "failed to save settings");
      setData(body as Settings);
    } catch (err) {
      setData(previous);
      setError(err instanceof Error ? err.message : "failed to save settings");
    }
  }

  return { data, loading, error, update };
}
