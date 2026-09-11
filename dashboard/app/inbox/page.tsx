"use client";

import { Suspense, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { emails as initialEmails } from "@/lib/data/fixtures";
import type { EmailCategory, Task } from "@/lib/types";
import { useAppState } from "@/components/AppStateProvider";
import { InboxRow } from "@/components/InboxRow";
import { ActionItemSidebar } from "@/components/ActionItemSidebar";
import { DraftModal } from "@/components/DraftModal";

const CATEGORY_OPTIONS: { value: EmailCategory; label: string }[] = [
  { value: "needs_reply", label: "Needs reply" },
  { value: "waiting_on_someone_else", label: "Waiting" },
  { value: "fyi", label: "FYI" },
  { value: "low_priority", label: "Low priority" },
  { value: "promotional", label: "Promo" },
];

// Fixed order so "Sort by category" groups rows the same way on every render.
const CATEGORY_RANK: Record<EmailCategory, number> = {
  needs_reply: 0,
  waiting_on_someone_else: 1,
  fyi: 2,
  low_priority: 3,
  promotional: 4,
};

type SortKey = "newest" | "oldest" | "category";

// Mirrors generateDraft's simulated network delay (FR9) so bulk actions feel
// consistent with the rest of the prototype's fixture-only mutations.
const BULK_ACTION_DELAY_MS = 1200;

function categoryRank(category: EmailCategory | null): number {
  return category ? CATEGORY_RANK[category] : Object.keys(CATEGORY_RANK).length;
}

function InboxPageContent() {
  const { tasks, drafts, changeTaskStatus, changeDraftStatus, generateDraft, generating, genError } = useAppState();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.get("q") ?? "";

  const [categoryFilter, setCategoryFilter] = useState<EmailCategory | "all">("all");
  const [sortKey, setSortKey] = useState<SortKey>("newest");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [draftModalEmailId, setDraftModalEmailId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkApplying, setBulkApplying] = useState(false);

  const emailsById = useMemo(() => new Map(initialEmails.map((e) => [e.id, e])), []);
  const taskByEmailId = useMemo(() => new Map(tasks.map((t) => [t.email_id, t])), [tasks]);
  const draftByEmailId = useMemo(() => new Map(drafts.map((d) => [d.email_id, d])), [drafts]);

  const filteredEmails = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = initialEmails.filter((e) => {
      const matchesQuery = !q || e.subject.toLowerCase().includes(q) || e.body.toLowerCase().includes(q);
      const matchesCategory = categoryFilter === "all" || e.category === categoryFilter;
      return matchesQuery && matchesCategory;
    });

    return [...matches].sort((a, b) => {
      if (sortKey === "oldest") {
        return new Date(a.received_at).getTime() - new Date(b.received_at).getTime();
      }
      if (sortKey === "category") {
        const rankDiff = categoryRank(a.category) - categoryRank(b.category);
        if (rankDiff !== 0) return rankDiff;
        return new Date(b.received_at).getTime() - new Date(a.received_at).getTime();
      }
      return new Date(b.received_at).getTime() - new Date(a.received_at).getTime(); // newest
    });
  }, [query, categoryFilter, sortKey]);

  const hasActiveFilter = query.trim() !== "" || categoryFilter !== "all";
  const allFilteredSelected =
    filteredEmails.length > 0 && filteredEmails.every((e) => selectedIds.has(e.id));

  function clearFilters() {
    setCategoryFilter("all");
    if (query) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("q");
      const suffix = params.toString();
      router.replace(suffix ? `${pathname}?${suffix}` : pathname, { scroll: false });
    }
  }

  function toggleSelect(emailId: string, isSelected: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (isSelected) next.add(emailId);
      else next.delete(emailId);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds(allFilteredSelected ? new Set() : new Set(filteredEmails.map((e) => e.id)));
  }

  function applyBulkTaskStatus(status: Task["status"]) {
    const targetIds = [...selectedIds];
    setBulkApplying(true);
    setTimeout(() => {
      // Edge case: rows with no associated task are skipped rather than erroring.
      targetIds.forEach((emailId) => {
        const task = taskByEmailId.get(emailId);
        if (task) changeTaskStatus(task.id, status);
      });
      setBulkApplying(false);
      setSelectedIds(new Set());
    }, BULK_ACTION_DELAY_MS);
  }

  function openDraftModal(emailId: string) {
    setDraftModalEmailId(emailId);
  }

  const activeDraftEmail = draftModalEmailId ? (emailsById.get(draftModalEmailId) ?? null) : null;
  const activeDraft = draftModalEmailId ? (draftByEmailId.get(draftModalEmailId) ?? null) : null;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col md:flex-row">
      <main className="min-w-0 flex-1 border-border md:border-r">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
          {filteredEmails.length > 0 && (
            <input
              type="checkbox"
              checked={allFilteredSelected}
              onChange={toggleSelectAll}
              aria-label="Select all visible emails"
              className="h-4 w-4 shrink-0 cursor-pointer rounded border-border text-primary focus:ring-2 focus:ring-ring/30 focus:outline-none"
            />
          )}

          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Sort
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="cursor-pointer rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground focus:ring-2 focus:ring-ring/30 focus:outline-none"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="category">Category</option>
            </select>
          </label>

          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Category
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as EmailCategory | "all")}
              className="cursor-pointer rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground focus:ring-2 focus:ring-ring/30 focus:outline-none"
            >
              <option value="all">All categories</option>
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          {selectedIds.size > 0 && (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{selectedIds.size} selected</span>
              {bulkApplying ? (
                <span
                  className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-primary"
                  aria-hidden
                />
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => applyBulkTaskStatus("done")}
                    className="cursor-pointer rounded-md border border-border px-2 py-1 text-xs font-medium text-success transition-colors hover:bg-muted focus:ring-2 focus:ring-ring/30 focus:outline-none"
                  >
                    Mark done
                  </button>
                  <button
                    type="button"
                    onClick={() => applyBulkTaskStatus("dismissed")}
                    className="cursor-pointer rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted focus:ring-2 focus:ring-ring/30 focus:outline-none"
                  >
                    Mark dismissed
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedIds(new Set())}
                    className="cursor-pointer rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus:ring-2 focus:ring-ring/30 focus:outline-none"
                  >
                    Clear
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {filteredEmails.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-8 text-center">
            <svg viewBox="0 0 20 20" fill="none" aria-hidden className="h-6 w-6 text-muted-foreground">
              <path
                d="M9 17a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm9 2-4.35-4.35"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <p className="text-sm text-muted-foreground">No emails match the current filters.</p>
            {hasActiveFilter && (
              <button
                type="button"
                onClick={clearFilters}
                className="cursor-pointer rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted focus:ring-2 focus:ring-ring/30 focus:outline-none"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          filteredEmails.map((email) => (
            <InboxRow
              key={email.id}
              email={email}
              task={taskByEmailId.get(email.id)}
              draft={draftByEmailId.get(email.id)}
              expanded={expandedId === email.id}
              selected={selectedIds.has(email.id)}
              onToggle={() => setExpandedId((prev) => (prev === email.id ? null : email.id))}
              onSelectChange={(isSelected) => toggleSelect(email.id, isSelected)}
              onChangeTaskStatus={(status) => {
                const task = taskByEmailId.get(email.id);
                if (task) changeTaskStatus(task.id, status);
              }}
              onOpenDraft={() => openDraftModal(email.id)}
            />
          ))
        )}
      </main>

      <ActionItemSidebar
        tasks={tasks}
        emailsById={emailsById}
        onChangeStatus={changeTaskStatus}
        onSelectEmail={(emailId) => setExpandedId(emailId)}
      />

      {activeDraftEmail && (
        <DraftModal
          email={activeDraftEmail}
          draft={activeDraft}
          isGenerating={generating}
          error={genError}
          onGenerate={() => generateDraft(activeDraftEmail.id)}
          onChangeStatus={(status) => {
            if (activeDraft) changeDraftStatus(activeDraft.id, status);
          }}
          onClose={() => setDraftModalEmailId(null)}
        />
      )}
    </div>
  );
}

export default function InboxPage() {
  return (
    <Suspense fallback={null}>
      <InboxPageContent />
    </Suspense>
  );
}
