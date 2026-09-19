"use client"

// Client-side read+write hook for /api/rules, following use-sync-state.ts's
// template. `toggle` is optimistic (matches the existing Switch UX);
// `create` posts a new rule and appends it on success.

import { useEffect, useState } from "react";
import type { Rule, RuleAction, RuleCondition } from "./types";

export interface UseRulesResult {
  data: Rule[];
  loading: boolean;
  error: string | null;
  toggle: (id: string) => Promise<void>;
  create: (input: {
    conditions: RuleCondition[];
    actions: RuleAction[];
    conditionSummary: string;
    actionSummary: string;
    dailyCap?: number | null;
    confidenceFloor?: number | null;
  }) => Promise<{ ok: boolean; error?: string }>;
}

export function useRules(): UseRulesResult {
  const [data, setData] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/rules", { signal: controller.signal });
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(
            (body && typeof body.error === "string" && body.error) || `request failed with status ${res.status}`
          );
        }
        setData(body as Rule[]);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "failed to load rules");
      } finally {
        setLoading(false);
      }
    }

    load();

    return () => controller.abort();
  }, []);

  async function toggle(id: string) {
    const previous = data;
    const target = data.find((r) => r.id === id);
    if (!target) return;
    setData((prev) => prev.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)));

    try {
      const res = await fetch(`/api/rules/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !target.enabled }),
      });
      if (!res.ok) throw new Error("failed to toggle rule");
    } catch (err) {
      setData(previous);
      setError(err instanceof Error ? err.message : "failed to toggle rule");
    }
  }

  async function create(input: {
    conditions: RuleCondition[];
    actions: RuleAction[];
    conditionSummary: string;
    actionSummary: string;
    dailyCap?: number | null;
    confidenceFloor?: number | null;
  }) {
    try {
      const res = await fetch("/api/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) return { ok: false, error: (body && body.error) || "failed to save rule" };
      setData((prev) => [...prev, body as Rule]);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "failed to save rule" };
    }
  }

  return { data, loading, error, toggle, create };
}
