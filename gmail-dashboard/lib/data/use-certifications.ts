"use client";

// Client-side read+write hook for /api/certifications, following
// use-plans.ts's template.

import { useEffect, useState } from "react";
import type { Certification, CertificationStatus } from "./types";

export interface UseCertificationsResult {
  data: Certification[];
  loading: boolean;
  error: string | null;
  create: (input: {
    name: string;
    provider?: string | null;
    examDate?: string | null;
    cost?: number | null;
  }) => Promise<{ ok: boolean; error?: string }>;
  update: (
    id: string,
    patch: {
      status?: CertificationStatus;
      planId?: string | null;
      examDate?: string | null;
      expiryDate?: string | null;
      cost?: number | null;
      notes?: string | null;
    }
  ) => Promise<{ ok: boolean; error?: string }>;
  remove: (id: string) => Promise<{ ok: boolean; error?: string }>;
}

export function useCertifications(): UseCertificationsResult {
  const [data, setData] = useState<Certification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/certifications", { signal: controller.signal });
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error((body && body.error) || `request failed with status ${res.status}`);
        }
        setData(body as Certification[]);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "failed to load certifications");
      } finally {
        setLoading(false);
      }
    }

    load();
    return () => controller.abort();
  }, []);

  async function create(input: { name: string; provider?: string | null; examDate?: string | null; cost?: number | null }) {
    try {
      const res = await fetch("/api/certifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) return { ok: false, error: (body && body.error) || "failed to create certification" };
      setData((prev) => [...prev, body as Certification]);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "failed to create certification" };
    }
  }

  async function update(
    id: string,
    patch: {
      status?: CertificationStatus;
      planId?: string | null;
      examDate?: string | null;
      expiryDate?: string | null;
      cost?: number | null;
      notes?: string | null;
    }
  ) {
    const previous = data;
    setData((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));

    try {
      const res = await fetch(`/api/certifications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error((body && body.error) || "failed to update certification");
      setData((prev) => prev.map((c) => (c.id === id ? (body.certification as Certification) : c)));
      return { ok: true };
    } catch (err) {
      setData(previous);
      const message = err instanceof Error ? err.message : "failed to update certification";
      setError(message);
      return { ok: false, error: message };
    }
  }

  async function remove(id: string) {
    const previous = data;
    setData((prev) => prev.filter((c) => c.id !== id));
    try {
      const res = await fetch(`/api/certifications/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("failed to delete certification");
      return { ok: true };
    } catch (err) {
      setData(previous);
      return { ok: false, error: err instanceof Error ? err.message : "failed to delete certification" };
    }
  }

  return { data, loading, error, create, update, remove };
}
