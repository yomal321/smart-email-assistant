"use client";

// Certifications — cert-specific facts only (provider/cost/dates/result).
// The prep work is a Plan (category='career'), reused rather than a second
// milestone system — "Create study plan" below does one POST /api/plans +
// one PATCH linking planId. See PHASE-7-IMPLEMENTATION-PLAN.md Wave 4.

import * as React from "react";
import Link from "next/link";
import { Award } from "lucide-react";
import { useCertifications } from "@/lib/data/use-certifications";
import { EmptyState } from "@/components/board/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusPill, type Tone } from "@/components/hub/primitives";
import type { Certification, CertificationStatus } from "@/lib/data/types";

const STATUS_LABEL: Record<CertificationStatus, string> = {
  planned: "Planned",
  studying: "Studying",
  scheduled: "Scheduled",
  passed: "Passed",
  failed: "Failed",
  expired: "Expired",
};

const STATUS_TONE: Record<CertificationStatus, Tone> = {
  planned: "neutral",
  studying: "info",
  scheduled: "warning",
  passed: "success",
  failed: "danger",
  expired: "neutral",
};

const STATUS_FILTERS: Array<CertificationStatus | "all"> = ["all", "planned", "studying", "scheduled", "passed", "failed", "expired"];

export default function CertificationsPage() {
  const { data: certifications, loading, create, update } = useCertifications();
  const [filter, setFilter] = React.useState<CertificationStatus | "all">("all");

  const visible = filter === "all" ? certifications : certifications.filter((c) => c.status === filter);

  async function createStudyPlan(cert: Certification) {
    const res = await fetch("/api/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: `Study for ${cert.name}`, category: "career" }),
    });
    const plan = await res.json().catch(() => null);
    if (res.ok && plan?.id) {
      await update(cert.id, { planId: plan.id });
    }
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-ground">
      <div className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-ink">Certifications</h1>
            <p className="text-sm text-ink-secondary">Provider, cost, exam and expiry dates for each cert.</p>
          </div>
          <div className="flex flex-wrap gap-1">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={
                  "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors " +
                  (filter === s ? "bg-departure-field text-departure-field-ink" : "text-ink-tertiary hover:bg-surface-sunk")
                }
              >
                {s === "all" ? "All" : STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        </div>

        <div className="card-surface p-4">
          <CreateCertificationForm onCreate={create} />
        </div>

        <div className="card-surface overflow-hidden">
          {loading && <p className="px-4 py-6 text-sm text-ink-secondary">Loading certifications…</p>}

          {!loading && visible.length === 0 && (
            <EmptyState
              icon={Award}
              heading="No certifications yet."
              body="Add one above — AWS, CKA, a Linux cert, whatever's next."
            />
          )}

          {!loading &&
            visible.map((cert) => (
              <div key={cert.id} className="flex items-center gap-3 rule-b px-4 py-3 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-ink">{cert.name}</p>
                    <StatusPill tone={STATUS_TONE[cert.status]}>{STATUS_LABEL[cert.status]}</StatusPill>
                  </div>
                  {cert.provider && <p className="mt-0.5 truncate text-xs text-ink-tertiary">{cert.provider}</p>}
                </div>

                {cert.examDate && <span className="tabular shrink-0 text-xs text-ink-tertiary">exam {cert.examDate}</span>}
                {cert.cost !== null && <span className="tabular shrink-0 text-xs text-ink-tertiary">${cert.cost}</span>}

                <Select value={cert.status} onValueChange={(v) => update(cert.id, { status: v as CertificationStatus })}>
                  <SelectTrigger size="sm" className="h-8 w-32 shrink-0 rounded-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(STATUS_LABEL) as CertificationStatus[]).map((s) => (
                      <SelectItem key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {cert.planId ? (
                  <Link href={`/plans/${cert.planId}`} className="shrink-0 text-xs text-departure hover:underline">
                    Study plan →
                  </Link>
                ) : (
                  <button
                    onClick={() => createStudyPlan(cert)}
                    className="shrink-0 text-xs text-departure hover:underline"
                  >
                    Create study plan
                  </button>
                )}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

function CreateCertificationForm({ onCreate }: { onCreate: ReturnType<typeof useCertifications>["create"] }) {
  const [name, setName] = React.useState("");
  const [provider, setProvider] = React.useState("");
  const [examDate, setExamDate] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    const result = await onCreate({
      name,
      provider: provider.trim() || null,
      examDate: examDate || null,
    });
    setSaving(false);
    if (result.ok) {
      setName("");
      setProvider("");
      setExamDate("");
    } else {
      setError(result.error ?? "failed to create certification");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Certification name — e.g. AWS Solutions Architect"
        className="h-8 min-w-[220px] flex-1 rounded-lg"
      />
      <Input
        value={provider}
        onChange={(e) => setProvider(e.target.value)}
        placeholder="Provider"
        className="h-8 w-36 rounded-lg"
      />
      <Input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} className="h-8 w-40 rounded-lg" />
      <Button type="submit" size="sm" className="h-8 rounded-lg" disabled={!name.trim() || saving}>
        {saving ? "Adding…" : "+ Add"}
      </Button>
      {error && <p className="text-xs" style={{ color: "var(--signal)" }}>{error}</p>}
    </form>
  );
}
