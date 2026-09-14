"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAwaitingReply } from "@/lib/data";
import { useBoard } from "@/components/board/board-provider";
import { useActionItems } from "@/components/board/action-items-provider";
import { BalanceBand } from "@/components/station/balance-band";
import { BoardRow } from "@/components/station/board-row";
import { VolumeTrend } from "@/components/charts/volume-trend";
import { Button } from "@/components/ui/button";
import { daysFromNow } from "@/lib/data/now";

type VolumeDay = { day: string; received: number; handled: number };

export default function OverviewPage() {
  const board = useBoard();
  const actionItems = useActionItems();
  const router = useRouter();

  const [volumeTrend, setVolumeTrend] = useState<VolumeDay[] | null>(null);
  const [volumeLoading, setVolumeLoading] = useState(true);
  const [volumeError, setVolumeError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setVolumeLoading(true);
      setVolumeError(null);
      try {
        const res = await fetch("/api/analytics/volume", { signal: controller.signal });
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(
            (body && typeof body.error === "string" && body.error) ||
              `request failed with status ${res.status}`
          );
        }
        setVolumeTrend(body as VolumeDay[]);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setVolumeError(err instanceof Error ? err.message : "failed to load volume trend");
      } finally {
        setVolumeLoading(false);
      }
    }

    load();

    return () => controller.abort();
  }, []);

  const open = board.messages.filter((m) => m.status === "open" || m.status === "snoozed");
  const onBoard = open.filter((m) => !(m.ai === null || (m.ai && m.ai.confidence < 50)));

  const waitingOnYou = onBoard.filter((m) => m.ai?.platform === "needs-reply");
  const overdueOnYou = waitingOnYou.filter((m) => m.sla.state === "overdue");
  const withinSlaOnYou = waitingOnYou.filter((m) => m.sla.state !== "overdue");
  const awaiting = getAwaitingReply();
  const overAWeek = awaiting.filter((w) => w.daysElapsed > 7);
  const recent = awaiting.filter((w) => w.daysElapsed <= 7);

  const unread = onBoard.filter((m) => m.isUnread).length;
  const overdueReplies = overdueOnYou.length;
  const openActionItemsCount = actionItems.items.filter((i) => i.status !== "done").length;
  const handled = board.messages.filter((m) => m.status === "archived" || m.status === "done");
  const timeSavedMinutes = Math.round(handled.length * 4 + onBoard.length * 1.5);

  const priorityQueue = [...onBoard].sort((a, b) => (b.ai?.priorityScore ?? 0) - (a.ai?.priorityScore ?? 0)).slice(0, 8);

  return (
    <div className="flex-1 overflow-y-auto">
      <BalanceBand
        you={{ count: waitingOnYou.length, overdue: overdueOnYou.length, withinSla: withinSlaOnYou.length }}
        them={{ count: awaiting.length, overAWeek: overAWeek.length, recent: recent.length }}
      />

      {/* Summary strip — five stat cards */}
      <div className="grid grid-cols-2 gap-3 px-4 py-3 sm:grid-cols-3 lg:grid-cols-5">
        <SummaryCell label="Unread" value={unread} />
        <SummaryCell label="Overdue" value={overdueReplies} tone={overdueReplies > 0 ? "signal" : undefined} />
        <SummaryCell label="Open action items" value={openActionItemsCount} />
        <SummaryCell label="Processed today" value={handled.length} />
        <SummaryCell label="Time saved" value={`${timeSavedMinutes}m`} />
      </div>

      <div className="px-4 py-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-narrow text-[11px] font-bold uppercase tracking-wider text-ink-tertiary">
            Today&apos;s priority queue
          </h2>
          <Link href="/inbox" className="text-xs font-medium text-departure hover:text-departure-field-ink">
            View all in Inbox
          </Link>
        </div>
        <div className="card-surface overflow-hidden">
          {priorityQueue.map((m) => (
            <BoardRow
              key={m.id}
              message={m}
              isSelected={false}
              isFocused={false}
              isVip={board.isVip(m.sender.id, m.sender.isVip)}
              bulkMode={false}
              showReason
              onToggleSelect={() => {}}
              onOpen={() => router.push(`/inbox?open=${m.id}`)}
              onArchive={() => board.archive([m.id])}
              onMarkDone={() => board.markDone([m.id])}
              onSnooze={() => board.snooze([m.id], daysFromNow(1))}
              onToggleStar={() => board.toggleStar(m.id, !m.isStarred)}
            />
          ))}
          {priorityQueue.length === 0 && (
            <p className="p-6 text-center text-sm text-ink-secondary">Board clear — nothing needs your attention right now.</p>
          )}
        </div>
      </div>

      <div className="px-4 py-5">
        <div className="card-surface p-3.5">
          {volumeLoading ? (
            <p className="p-6 text-center text-sm text-ink-secondary">Loading volume trend…</p>
          ) : volumeError ? (
            <p className="p-6 text-center text-sm text-ink-secondary">Couldn&apos;t load volume trend: {volumeError}</p>
          ) : (
            <VolumeTrend data={volumeTrend ?? []} />
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2 px-4 py-4">
        <Button
          className="rounded-xl"
          onClick={() => router.push("/inbox")}
        >
          Triage new mail
        </Button>
        <Button variant="secondary" className="rounded-xl" onClick={() => router.push("/drafts")}>
          Review drafts
        </Button>
        <Button
          variant="secondary"
          className="rounded-xl"
          onClick={() => {
            const low = onBoard.filter((m) => m.ai?.priority === "low").map((m) => m.id);
            board.archive(low);
          }}
        >
          Clear low-priority
        </Button>
      </div>
    </div>
  );
}

function SummaryCell({ label, value, tone }: { label: string; value: number | string; tone?: "signal" }) {
  const isAlert = tone === "signal" && Number(value) > 0;
  return (
    <div className="card-surface px-3.5 py-2.5">
      <div className="font-narrow text-[10px] font-bold uppercase tracking-wider text-ink-tertiary">{label}</div>
      <div className={"text-2xl font-extrabold tabular tracking-tight " + (isAlert ? "text-signal" : "text-ink")}>
        {value}
      </div>
    </div>
  );
}
