"use client";

// Dedicated cleanup surface, split out of /settings (Privacy links here rather
// than embedding these controls inline) so there's room for the route diagram,
// the current composition of the mailbox, the configuration, and the
// scan-then-delete flow together.
//
// The scan runs on mount and on every age-filter change: it's a read-only dry
// run, and making the user click before the page says anything useful would be
// a wasted step on the one screen whose whole job is "tell me what's junk".
import * as React from "react";
import Link from "next/link";
import { ArrowDown, ArrowLeft, Filter, Inbox, Loader2, RefreshCw, Search, Sparkles, Trash2, X } from "lucide-react";
import { useSettings } from "@/lib/data/use-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Candidate {
  id: string;
  subject: string | null;
  category: string | null;
  received_at: string | null;
  sender: string;
  reason: string;
}

interface ScanResult {
  totalStored: number;
  wouldDelete: number;
  skippedBecauseTheyHaveWork: number;
  bySenderDomain: Record<string, number>;
  candidates: Candidate[];
}

const AGE_OPTIONS = [
  { value: "any", label: "Any age" },
  { value: "7", label: "Older than 7 days" },
  { value: "30", label: "Older than 30 days" },
  { value: "90", label: "Older than 90 days" },
];

const REASON_LABELS: Record<string, string> = {
  CATEGORY_PROMOTIONS: "Promotions",
  CATEGORY_SOCIAL: "Social",
  promotional: "Promotional",
  low_priority: "Low priority",
};

// Order doubles as the filter-chip order below.
const REASON_CHIPS = Object.entries(REASON_LABELS).map(([key, label]) => ({ key, label }));

function formatReason(reason: string): string {
  return reason
    .split("+")
    .map((r) => REASON_LABELS[r] ?? r)
    .join(" + ");
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function InboxCleanupPage() {
  const { data: settings, update: updateSettings } = useSettings();
  const [newExclusion, setNewExclusion] = React.useState("");

  const [ageFilter, setAgeFilter] = React.useState("any");
  const [scanning, setScanning] = React.useState(true);
  const [scan, setScan] = React.useState<ScanResult | null>(null);
  const [scanError, setScanError] = React.useState<string | null>(null);

  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [deleted, setDeleted] = React.useState<{ deleted: number; kept: number } | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  // View/delete-scope filters, distinct from the age filter above: age
  // rescopes the scan itself (a new server call), these narrow the list the
  // scan already returned. Search matches sender or subject; an active reason
  // chip requires the candidate's reason to include it. Clearing both shows
  // every candidate from the scan again.
  const [search, setSearch] = React.useState("");
  const [reasonFilter, setReasonFilter] = React.useState<Set<string>>(new Set());

  function toggleReason(key: string) {
    setReasonFilter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Every scan goes through this one effect — the age filter and the Rescan
  // button (and a completed delete) all just change its inputs. Same
  // fetch-on-mount + AbortController shape as lib/data/use-settings.ts.
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setScanning(true);
      setScanError(null);
      try {
        const res = await fetch("/api/settings/cleanup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dryRun: true,
            ...(ageFilter !== "any" ? { olderThanDays: Number(ageFilter) } : {}),
          }),
          signal: controller.signal,
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error((body && body.error) || "scan failed");
        setScan(body as ScanResult);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setScanError(err instanceof Error ? err.message : "scan failed");
      } finally {
        setScanning(false);
      }
    }

    load();
    return () => controller.abort();
  }, [ageFilter, reloadKey]);

  function addExclusion() {
    const value = newExclusion.trim();
    if (!value || settings?.exclusionRules?.includes(value)) return;
    updateSettings({ exclusionRules: [...(settings?.exclusionRules ?? []), value] });
    setNewExclusion("");
  }

  function removeExclusion(value: string) {
    updateSettings({ exclusionRules: (settings?.exclusionRules ?? []).filter((r) => r !== value) });
  }

  async function runDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch("/api/settings/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dryRun: false,
          confirm: "CLEANUP",
          ids: filtered.map((c) => c.id),
          ...(ageFilter !== "any" ? { olderThanDays: Number(ageFilter) } : {}),
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error((body && body.error) || "cleanup failed");
      setDeleted(body as { deleted: number; kept: number });
      setConfirmOpen(false);
      clearFilters();
      setReloadKey((k) => k + 1);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "cleanup failed");
    } finally {
      setDeleting(false);
    }
  }

  const domains = scan ? Object.entries(scan.bySenderDomain).sort((a, b) => b[1] - a[1]) : [];
  const keep = scan ? Math.max(scan.totalStored - scan.wouldDelete - scan.skippedBecauseTheyHaveWork, 0) : 0;
  const pct = (n: number) => (scan && scan.totalStored > 0 ? (n / scan.totalStored) * 100 : 0);

  const searchTerm = search.trim().toLowerCase();
  const filtered = (scan?.candidates ?? []).filter((c) => {
    const matchesSearch =
      !searchTerm || c.sender.toLowerCase().includes(searchTerm) || (c.subject ?? "").toLowerCase().includes(searchTerm);
    const matchesReason = reasonFilter.size === 0 || [...reasonFilter].some((r) => c.reason.includes(r));
    return matchesSearch && matchesReason;
  });
  const filtersActive = searchTerm.length > 0 || reasonFilter.size > 0;

  function clearFilters() {
    setSearch("");
    setReasonFilter(new Set());
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <header className="rule-b flex items-center gap-3 px-6 py-4">
        <Link
          href="/settings"
          className="flex size-8 items-center justify-center rounded-lg text-ink-secondary transition-colors hover:bg-muted hover:text-ink"
          aria-label="Back to Settings"
        >
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 className="text-[1.0625rem] font-semibold tracking-tight text-ink">Inbox Cleanup</h1>
          <p className="text-[13px] text-ink-secondary">
            Where junk is filtered out, and what to do with what already got through.
          </p>
        </div>
      </header>

      <div className="space-y-10 px-6 py-6">
        <RouteDiagram />

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-narrow text-[11px] font-bold uppercase tracking-widest text-ink-tertiary">
                Low-value mail in your inbox
                {scan && filtersActive && (
                  <span className="tabular ml-1.5 normal-case tracking-normal text-ink-tertiary">
                    — showing {filtered.length} of {scan.candidates.length}
                  </span>
                )}
              </h2>
              <div className="flex items-center gap-2">
                <Select value={ageFilter} onValueChange={setAgeFilter}>
                  <SelectTrigger className="h-8 w-44 rounded-lg text-[13px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AGE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Rescan"
                  disabled={scanning}
                  onClick={() => setReloadKey((k) => k + 1)}
                >
                  <RefreshCw className={scanning ? "animate-spin" : undefined} />
                </Button>
              </div>
            </div>

            {deleted && (
              <div
                className="rounded-lg border px-3 py-2.5 text-[13px] text-ink"
                style={{ borderColor: "var(--cleared)", background: "var(--cleared-field)" }}
              >
                Deleted {deleted.deleted} email{deleted.deleted === 1 ? "" : "s"}.{" "}
                {deleted.kept > 0 && `${deleted.kept} kept for having real work attached.`}
              </div>
            )}

            {scanError ? (
              <div
                className="rounded-lg border px-3 py-2.5 text-[13px]"
                style={{ borderColor: "var(--signal)", background: "var(--signal-field)", color: "var(--signal)" }}
              >
                {scanError}
              </div>
            ) : scanning && !scan ? (
              <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-6 text-[13px] text-ink-secondary">
                <Loader2 size={14} className="animate-spin" />
                Scanning your inbox…
              </div>
            ) : scan && scan.wouldDelete === 0 ? (
              <div className="rounded-lg border border-border px-3 py-6 text-center">
                <p className="text-[13px] font-medium text-ink">Nothing to clean up</p>
                <p className="mt-1 text-xs text-ink-secondary">
                  No promotional or low-priority mail matches{" "}
                  {ageFilter === "any" ? "right now" : AGE_OPTIONS.find((o) => o.value === ageFilter)?.label.toLowerCase()}.
                </p>
              </div>
            ) : scan ? (
              <>
                <CompositionBar keep={keep} remove={scan.wouldDelete} protectedCount={scan.skippedBecauseTheyHaveWork} pct={pct} total={scan.totalStored} />

                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative flex-1 min-w-48">
                    <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-tertiary" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Filter by sender or subject…"
                      aria-label="Filter by sender or subject"
                      className="h-8 rounded-lg pl-8 pr-8 text-[13px]"
                    />
                    {search && (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Clear search"
                        className="absolute right-1 top-1/2 -translate-y-1/2"
                        onClick={() => setSearch("")}
                      >
                        <X />
                      </Button>
                    )}
                  </div>
                  {REASON_CHIPS.map((r) => {
                    const active = reasonFilter.has(r.key);
                    return (
                      <button
                        key={r.key}
                        type="button"
                        aria-pressed={active}
                        onClick={() => toggleReason(r.key)}
                        className="rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors"
                        style={
                          active
                            ? { borderColor: "var(--departure)", background: "var(--departure-field)", color: "var(--departure)" }
                            : { borderColor: "var(--rule)", color: "var(--ink-secondary)" }
                        }
                      >
                        {r.label}
                      </button>
                    );
                  })}
                  {filtersActive && (
                    <Button variant="ghost" size="sm" className="rounded-lg text-[13px]" onClick={clearFilters}>
                      Clear filters
                    </Button>
                  )}
                </div>

                {filtered.length === 0 ? (
                  <div className="rounded-lg border border-border px-3 py-6 text-center">
                    <p className="text-[13px] font-medium text-ink">No matches</p>
                    <p className="mt-1 text-xs text-ink-secondary">
                      Nothing{search ? ` matches "${search}"` : ""} in the selected reasons.{" "}
                      <button type="button" onClick={clearFilters} className="underline hover:no-underline">
                        Clear filters
                      </button>{" "}
                      to see all {scan.candidates.length}.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Below md the four columns truncate to uselessness, so the
                        rows reflow into stacked items — same structural reflow the
                        board row already uses under 900px. */}
                    <div className="max-h-88 divide-y divide-border overflow-y-auto rounded-lg border border-border md:hidden">
                      {filtered.map((c) => (
                        <div key={c.id} className="px-3 py-2.5">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-xs text-ink-secondary">{c.sender}</span>
                            <span className="tabular shrink-0 text-xs text-ink-tertiary">{formatDate(c.received_at)}</span>
                          </div>
                          <p className="mt-0.5 truncate text-[13px] text-ink">{c.subject || "(no subject)"}</p>
                          <Badge variant="secondary" className="mt-1.5 text-[10.5px]">
                            {formatReason(c.reason)}
                          </Badge>
                        </div>
                      ))}
                    </div>

                    <div className="hidden overflow-hidden rounded-lg border border-border md:block">
                      <div className="max-h-88 overflow-y-auto">
                        <Table>
                          <TableHeader className="sticky top-0 z-10 bg-surface-raised">
                            <TableRow>
                              <TableHead className="w-[26%]">Sender</TableHead>
                              <TableHead>Subject</TableHead>
                              <TableHead className="w-36">Reason</TableHead>
                              <TableHead className="w-18 text-right">Received</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filtered.map((c) => (
                              <TableRow key={c.id}>
                                <TableCell className="max-w-0 truncate text-xs text-ink-secondary">{c.sender}</TableCell>
                                <TableCell className="max-w-0 truncate text-xs text-ink">{c.subject || "(no subject)"}</TableCell>
                                <TableCell>
                                  <Badge variant="secondary" className="whitespace-nowrap text-[10.5px]">
                                    {formatReason(c.reason)}
                                  </Badge>
                                </TableCell>
                                <TableCell className="tabular text-right text-xs text-ink-tertiary">
                                  {formatDate(c.received_at)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </>
                )}

                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    variant="destructive"
                    className="rounded-lg"
                    disabled={filtered.length === 0}
                    onClick={() => setConfirmOpen(true)}
                  >
                    <Trash2 />
                    Delete {filtered.length} email{filtered.length === 1 ? "" : "s"}
                  </Button>
                  <p className="text-xs text-ink-tertiary">
                    Starred mail, sent mail, and anything with a task, draft, or commitment is never included.
                  </p>
                </div>
              </>
            ) : null}
          </div>

          <aside className="space-y-6">
            {domains.length > 0 && (
              <Panel title="Where it comes from" caption="Click a sender to filter the list. A repeat offender is worth an exclusion rule.">
                <div className="space-y-1.5">
                  {domains.slice(0, 8).map(([domain, count]) => {
                    const active = search.trim().toLowerCase() === domain.toLowerCase();
                    return (
                      <button
                        key={domain}
                        type="button"
                        onClick={() => setSearch(active ? "" : domain)}
                        aria-pressed={active}
                        title={domain}
                        className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-xs transition-colors hover:bg-surface-sunk"
                        style={active ? { background: "var(--departure-field)" } : undefined}
                      >
                        <span
                          className="w-34 shrink-0 truncate text-left"
                          style={{ color: active ? "var(--departure)" : "var(--ink-secondary)" }}
                        >
                          {domain}
                        </span>
                        <span className="h-1.5 flex-1 rounded-full bg-surface-sunk">
                          <span
                            className="block h-1.5 rounded-full"
                            style={{ width: `${(count / domains[0][1]) * 100}%`, background: "var(--signal)" }}
                          />
                        </span>
                        <span className="tabular w-5 shrink-0 text-right text-ink-tertiary">{count}</span>
                      </button>
                    );
                  })}
                </div>
              </Panel>
            )}

            <Panel title="Exclusion rules" caption="Senders dropped at ingest, before the AI ever reads them.">
              <div className="space-y-2">
                {(settings?.exclusionRules ?? []).map((rule) => (
                  <div
                    key={rule}
                    className="flex items-center justify-between gap-2 rounded-lg bg-surface-sunk px-2.5 py-1.5"
                  >
                    <span className="truncate text-[13px] text-ink">{rule}</span>
                    <Button variant="ghost" size="icon-xs" aria-label={`Remove ${rule}`} onClick={() => removeExclusion(rule)}>
                      <X />
                    </Button>
                  </div>
                ))}
                {(settings?.exclusionRules?.length ?? 0) === 0 && (
                  <p className="text-xs text-ink-tertiary">
                    None yet. Every sender is judged by the gates above.
                  </p>
                )}
                <div className="flex items-center gap-2 pt-1">
                  <Input
                    value={newExclusion}
                    onChange={(e) => setNewExclusion(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addExclusion())}
                    placeholder="name@example.com"
                    className="h-8 rounded-lg text-[13px]"
                  />
                  <Button size="sm" variant="outline" className="rounded-lg" onClick={addExclusion}>
                    Add
                  </Button>
                </div>
              </div>
            </Panel>

            <Panel title="Automatic cleanup" caption="Runs nightly, with the same protections as the manual run.">
              <Label className="mb-1.5 block text-xs text-ink-secondary">Remove low-value mail older than</Label>
              <Select
                value={settings?.retentionDays == null ? "unset" : String(settings.retentionDays)}
                onValueChange={(v) => updateSettings({ retentionDays: v === "unset" ? null : Number(v) })}
              >
                <SelectTrigger className="h-8 w-full rounded-lg text-[13px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unset">Never — keep everything</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                </SelectContent>
              </Select>
            </Panel>
          </aside>
        </section>
      </div>

      <Dialog open={confirmOpen} onOpenChange={(v) => !deleting && setConfirmOpen(v)}>
        <DialogContent className="max-w-md rounded-lg">
          <DialogHeader>
            <DialogTitle>Delete {filtered.length} email{filtered.length === 1 ? "" : "s"}?</DialogTitle>
            <DialogDescription>
              This cannot be undone. It removes exactly the {filtered.length} email{filtered.length === 1 ? "" : "s"}{" "}
              listed{filtersActive ? " under the current filter" : ""} — starred mail, sent mail, and anything
              carrying a task, draft, or commitment stays.
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <p className="text-xs" style={{ color: "var(--signal)" }}>
              {deleteError}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" className="rounded-lg" disabled={deleting} onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" className="rounded-lg" disabled={deleting} onClick={runDelete}>
              {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const STOPS = [
  {
    icon: Filter,
    name: "Ingest gate",
    detail: "Bulk labels, unsubscribe headers and no-reply senders never reach storage.",
    drops: true,
  },
  {
    icon: Sparkles,
    name: "Triage gate",
    detail: "Mail the AI calls promotional or low-priority skips task and commitment extraction.",
    drops: true,
  },
  {
    icon: Inbox,
    name: "Your inbox",
    detail: "Everything that survives both gates — real mail, plus whatever slipped through.",
    drops: false,
  },
  {
    icon: Trash2,
    name: "Cleanup",
    detail: "Removes what slipped through, nightly on a schedule or on demand below.",
    drops: false,
    terminal: true,
  },
];

function RouteDiagram() {
  return (
    <section>
      <h2 className="mb-4 font-narrow text-[11px] font-bold uppercase tracking-widest text-ink-tertiary">
        How mail is filtered
      </h2>
      <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
        {STOPS.map((stop, i) => (
          <div key={stop.name} className="relative">
            {/* the line: runs from this stop's marker to the next one */}
            {i < STOPS.length - 1 && (
              <span
                aria-hidden
                className="absolute left-7 right-0 top-3.5 hidden h-px lg:block"
                style={{ background: "var(--rule-strong)" }}
              />
            )}
            <div className="relative flex items-center gap-2.5">
              <span
                className="flex size-7 shrink-0 items-center justify-center rounded-full"
                style={
                  stop.terminal
                    ? { background: "var(--signal-field)", color: "var(--signal)" }
                    : { background: "var(--departure-field)", color: "var(--departure)" }
                }
              >
                <stop.icon size={14} />
              </span>
              {/* bg-ground masks the connector rule running behind the label */}
              <span className="bg-ground pr-2 font-narrow text-[11px] font-bold uppercase tracking-widest text-ink">
                {stop.name}
              </span>
            </div>
            <p className="mt-2 max-w-[34ch] pl-9.5 text-xs leading-relaxed text-ink-secondary lg:pl-0">
              {stop.detail}
            </p>
            {stop.drops && (
              <p
                className="mt-1.5 flex items-center gap-1 pl-9.5 text-[10.5px] font-medium lg:pl-0"
                style={{ color: "var(--signal)" }}
              >
                <ArrowDown size={11} aria-hidden />
                dropped here
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function CompositionBar({
  keep,
  remove,
  protectedCount,
  pct,
  total,
}: {
  keep: number;
  remove: number;
  protectedCount: number;
  pct: (n: number) => number;
  total: number;
}) {
  return (
    <div className="space-y-2">
      {/* segment order matches the legend below it, removable first */}
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-sunk">
        <span style={{ width: `${pct(remove)}%`, background: "var(--signal)" }} />
        <span style={{ width: `${pct(keep)}%`, background: "var(--ink-tertiary)" }} />
        <span style={{ width: `${pct(protectedCount)}%`, background: "var(--cleared)" }} />
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
        <LegendItem color="var(--signal)" value={remove} label="low-value, removable" emphasis />
        <LegendItem color="var(--ink-tertiary)" value={keep} label="real mail, kept" />
        {protectedCount > 0 && (
          <LegendItem color="var(--cleared)" value={protectedCount} label="protected — has work attached" />
        )}
        <span className="ml-auto text-ink-tertiary">
          <span className="tabular">{total}</span> stored
        </span>
      </div>
    </div>
  );
}

function LegendItem({
  color,
  value,
  label,
  emphasis,
}: {
  color: string;
  value: number;
  label: string;
  emphasis?: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden className="size-2 rounded-full" style={{ background: color }} />
      <span className={emphasis ? "tabular font-semibold text-ink" : "tabular text-ink"}>{value}</span>
      <span className="text-ink-secondary">{label}</span>
    </span>
  );
}

function Panel({ title, caption, children }: { title: string; caption: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface-raised p-3.5">
      <h3 className="text-[13px] font-semibold text-ink">{title}</h3>
      <p className="mb-3 mt-0.5 text-xs leading-relaxed text-ink-secondary">{caption}</p>
      {children}
    </div>
  );
}
