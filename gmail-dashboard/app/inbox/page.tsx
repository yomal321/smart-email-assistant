"use client";

import * as React from "react";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Inbox } from "lucide-react";
import type { Platform } from "@/lib/data";
import { platformMeta } from "@/lib/data";
import { useBoard } from "@/components/board/board-provider";
import { BoardList } from "@/components/board/board-list";
import { FilterBar, type FilterState } from "@/components/board/filter-bar";
import { EmptyState } from "@/components/board/empty-state";

const SAVED_VIEWS: Record<string, { label: string; predicate: (senderDomain: string, platform: Platform | undefined) => boolean }> = {
  "client-needs-reply": {
    label: "Client · needs reply",
    predicate: (domain, platform) => domain === "northgate.co" && platform === "needs-reply",
  },
  "weekly-invoices": {
    label: "This week's invoices",
    predicate: (_domain, platform) => platform === "invoice",
  },
};

function InboxContent() {
  const board = useBoard();
  const params = useSearchParams();
  const platformParam = params.get("platform") as Platform | null;
  const viewParam = params.get("view");
  const openParam = params.get("open");

  const [filters, setFilters] = React.useState<FilterState>({
    priority: "all",
    hasActionItems: false,
    unanswered: false,
    sort: "priority",
  });

  const base = board.messages.filter((m) => m.status === "open" || m.status === "snoozed");
  const inReviewQueue = (m: (typeof base)[number]) => m.ai === null || (m.ai && m.ai.confidence < 50);
  const onBoard = base.filter((m) => !inReviewQueue(m));

  let filtered = onBoard;
  if (platformParam) filtered = filtered.filter((m) => m.ai?.platform === platformParam);
  if (viewParam && SAVED_VIEWS[viewParam]) {
    const view = SAVED_VIEWS[viewParam];
    filtered = filtered.filter((m) => view.predicate(m.sender.domain, m.ai?.platform));
  }
  if (filters.priority !== "all") filtered = filtered.filter((m) => m.ai?.priority === filters.priority);
  if (filters.hasActionItems) filtered = filtered.filter((m) => (m.ai?.actionItemIds.length ?? 0) > 0);
  if (filters.unanswered) {
    filtered = filtered.filter((m) => {
      const last = m.thread[m.thread.length - 1];
      return last && !last.authorIsYou;
    });
  }

  const sorted = [...filtered].sort((a, b) => {
    switch (filters.sort) {
      case "date":
        return new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime();
      case "delay":
        return b.sla.elapsedHours - b.sla.targetHours - (a.sla.elapsedHours - a.sla.targetHours);
      case "sender":
        return a.sender.name.localeCompare(b.sender.name);
      case "priority":
      default:
        return (b.ai?.priorityScore ?? 0) - (a.ai?.priorityScore ?? 0);
    }
  });

  const heading = platformParam
    ? `Platform ${platformMeta(platformParam).number} · ${platformMeta(platformParam).label}`
    : viewParam && SAVED_VIEWS[viewParam]
      ? SAVED_VIEWS[viewParam].label
      : "Inbox";

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between rule-b px-4 py-3">
        <h1 className="text-lg font-semibold text-ink">{heading}</h1>
      </div>
      <FilterBar state={filters} onChange={setFilters} matchedCount={sorted.length} totalCount={onBoard.length} />
      <BoardList
        messages={sorted}
        initialOpenId={openParam}
        emptyState={
          onBoard.length === 0 ? (
            <EmptyState
              icon={Inbox}
              heading="Board clear."
              body="Nothing is waiting on you. Check Follow-ups for what's waiting on other people."
              actionLabel="View waiting on them"
              actionHref="/follow-ups"
            />
          ) : (
            <EmptyState
              icon={Inbox}
              heading="No departures match."
              body={`${
                [filters.priority !== "all", filters.hasActionItems, filters.unanswered, !!platformParam].filter(Boolean).length
              } filters are active. Clearing them would show ${onBoard.length} messages.`}
              actionLabel="Clear filters"
              actionHref={platformParam || viewParam ? "/inbox" : undefined}
              onAction={
                platformParam || viewParam
                  ? undefined
                  : () => setFilters({ priority: "all", hasActionItems: false, unanswered: false, sort: filters.sort })
              }
            />
          )
        }
      />
    </div>
  );
}

export default function InboxPage() {
  return (
    <Suspense fallback={null}>
      <InboxContent />
    </Suspense>
  );
}
