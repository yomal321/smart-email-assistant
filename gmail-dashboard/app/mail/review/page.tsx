"use client";

import { ShieldCheck } from "lucide-react";
import { useBoard } from "@/components/board/board-provider";
import { BoardList } from "@/components/board/board-list";
import { EmptyState } from "@/components/board/empty-state";

/**
 * Nothing is ever silently dropped — the product's proof of Product
 * Principle 3. Always reachable from the rail, even at zero.
 * design-spec.md §7.4
 */
export default function ReviewQueuePage() {
  const board = useBoard();
  const messages = board.messages.filter(
    (m) => (m.ai === null || (m.ai && m.ai.confidence < 50)) && m.status === "open"
  );

  return (
    <div className="flex h-full flex-col">
      <div className="rule-b px-4 py-3">
        <h1 className="text-lg font-semibold text-ink">Review queue</h1>
        <p className="text-sm text-ink-secondary">
          Messages the classifier could not read confidently, or at all. Nothing is ever dropped silently.
        </p>
      </div>
      <BoardList
        messages={messages}
        emptyState={
          <EmptyState
            icon={ShieldCheck}
            heading="Nothing needs review."
            body="Messages the classifier is unsure about land here rather than being dropped."
          />
        }
      />
    </div>
  );
}
