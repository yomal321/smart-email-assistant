"use client"

// Client-side read hooks for the four analytics endpoints + the
// already-existing /api/analytics/volume (Phase 5 wires the page to it for
// the first time). One small generic fetch hook, following
// use-sync-state.ts's { data, loading, error } shape, parameterized by
// endpoint — these four are read-only and share no write behavior, so a
// single generic beats four near-identical copies.

import { useEffect, useState } from "react";

interface UseFetchResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

function useAnalyticsFetch<T>(path: string): UseFetchResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(path, { signal: controller.signal });
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(
            (body && typeof body.error === "string" && body.error) || `request failed with status ${res.status}`
          );
        }
        setData(body as T);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : `failed to load ${path}`);
      } finally {
        setLoading(false);
      }
    }

    load();

    return () => controller.abort();
  }, [path]);

  return { data, loading, error };
}

export interface VolumeTrendPoint {
  day: string;
  received: number;
  handled: number;
}

export interface ResponseTimesResult {
  buckets: { label: string; count: number }[];
  averageHours: number | null;
  sampleCount: number;
}

export interface CategoryBreakdownResult {
  weeks: string[];
  series: Record<string, number[]>;
}

export interface BusiestHoursResult {
  days: string[];
  grid: number[][];
  max: number;
}

export interface AiPerformanceResult {
  classificationAccuracy: number | null;
  draftAcceptanceRate: number | null;
  draftsEditedBeforeSendRate: number | null;
  timeSavedMinutes: number;
  timeSavedIsEstimate: boolean;
  windowDays: number;
}

export const useVolumeTrend = () => useAnalyticsFetch<VolumeTrendPoint[]>("/api/analytics/volume");
export const useResponseTimes = () => useAnalyticsFetch<ResponseTimesResult>("/api/analytics/response-times");
export const useCategoryBreakdown = () => useAnalyticsFetch<CategoryBreakdownResult>("/api/analytics/categories");
export const useBusiestHours = () => useAnalyticsFetch<BusiestHoursResult>("/api/analytics/busiest-hours");
export const useAiPerformance = () => useAnalyticsFetch<AiPerformanceResult>("/api/analytics/ai-performance");
