"use client"

// Client-side read hook: fetches live sync state from the dashboard's own
// API tier (`/api/sync`), never Supabase directly — see
// architect/02-container.md and design.md's Architecture diagram for why
// the browser only ever talks to app/api/**.
//
// This is the template every later phase's read hooks copy: `"use client"`,
// fetch-on-mount via useEffect, an AbortController to cancel on unmount,
// and a plain `{ data, loading, error }` result. Keep new hooks shaped the
// same way rather than inventing a new pattern per endpoint.

import { useEffect, useState } from "react";
import type { SyncState } from "./types";

export interface UseSyncStateResult {
  data: SyncState | null;
  loading: boolean;
  error: string | null;
}

export function useSyncState(): UseSyncStateResult {
  const [data, setData] = useState<SyncState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/sync", { signal: controller.signal });
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(
            (body && typeof body.error === "string" && body.error) ||
              `request failed with status ${res.status}`
          );
        }
        setData(body as SyncState);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "failed to load sync state");
      } finally {
        setLoading(false);
      }
    }

    load();

    return () => controller.abort();
  }, []);

  return { data, loading, error };
}
