"use client";

import * as React from "react";
import { Clock3, CheckCircle2 } from "lucide-react";
import { getAwaitingReply, getCommitments, contactById } from "@/lib/data";
import { EmptyState } from "@/components/board/empty-state";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface NudgeTarget {
  label: string;
  counterpartyName: string;
  suggested: string;
}

export default function FollowUpsPage() {
  const awaiting = getAwaitingReply();
  const commitments = getCommitments();
  const [nudgeTarget, setNudgeTarget] = React.useState<NudgeTarget | null>(null);
  const [nudgedIds, setNudgedIds] = React.useState<Set<string>>(new Set());

  const youPromised = commitments.filter((c) => c.direction === "you-promised");
  const promisedToYou = commitments.filter((c) => c.direction === "promised-to-you");

  const isEmpty = awaiting.length === 0 && youPromised.length === 0 && promisedToYou.length === 0;

  if (isEmpty) {
    return (
      <div className="flex h-full flex-col">
        <Header />
        <EmptyState
          icon={CheckCircle2}
          heading="Nothing outstanding."
          body="You have no unanswered sent mail and no promises coming due."
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <Header />

      <Section title="Awaiting reply" count={awaiting.length}>
        {awaiting.map((w) => {
          const contact = contactById(w.counterpartyId);
          const id = `wr-${w.id}`;
          return (
            <FollowUpRow
              key={w.id}
              sender={contact.name}
              text={w.subject}
              days={w.daysElapsed}
              nudged={nudgedIds.has(id)}
              onNudge={() =>
                setNudgeTarget({
                  label: id,
                  counterpartyName: contact.name,
                  suggested: `Hi ${contact.name.split(" ")[0]},\n\nJust following up on "${w.subject}" — wanted to check if you'd had a chance to look yet.\n\nBest,\nYou`,
                })
              }
            />
          );
        })}
      </Section>

      <Section title="You promised" count={youPromised.length}>
        {youPromised.map((c) => {
          const contact = contactById(c.counterpartyId);
          const days = c.dueDate ? daysUntilOrPast(c.dueDate) : c.daysElapsed;
          return (
            <FollowUpRow
              key={c.id}
              sender={contact.name}
              text={c.text}
              quote={c.triggerSentence}
              days={days}
              confidence={c.confidence}
              nudged={nudgedIds.has(c.id)}
              onNudge={() =>
                setNudgeTarget({
                  label: c.id,
                  counterpartyName: contact.name,
                  suggested: `Hi ${contact.name.split(" ")[0]},\n\nCircling back on this — ${c.text.replace(/^I'll /i, "I will ")}\n\nBest,\nYou`,
                })
              }
            />
          );
        })}
      </Section>

      <Section title="Promised to you" count={promisedToYou.length}>
        {promisedToYou.map((c) => {
          const contact = contactById(c.counterpartyId);
          const days = c.dueDate ? daysUntilOrPast(c.dueDate) : c.daysElapsed;
          return (
            <FollowUpRow
              key={c.id}
              sender={contact.name}
              text={c.text}
              quote={c.triggerSentence}
              days={days}
              confidence={c.confidence}
              status={c.status}
              nudged={nudgedIds.has(c.id)}
              onNudge={() =>
                setNudgeTarget({
                  label: c.id,
                  counterpartyName: contact.name,
                  suggested: `Hi ${contact.name.split(" ")[0]},\n\nJust a nudge on this — ${c.text}\n\nBest,\nYou`,
                })
              }
            />
          );
        })}
      </Section>

      <Dialog open={!!nudgeTarget} onOpenChange={(v) => !v && setNudgeTarget(null)}>
        <DialogContent className="max-w-lg rounded-lg">
          <DialogHeader>
            <DialogTitle>Nudge {nudgeTarget?.counterpartyName}</DialogTitle>
          </DialogHeader>
          <Textarea defaultValue={nudgeTarget?.suggested} className="min-h-32 rounded-lg text-sm" />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" className="rounded-lg" onClick={() => setNudgeTarget(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="rounded-lg"
              onClick={() => {
                if (nudgeTarget) setNudgedIds((s) => new Set([...s, nudgeTarget.label]));
                setNudgeTarget(null);
              }}
            >
              Send nudge
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function daysUntilOrPast(iso: string): number {
  return Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function Header() {
  return (
    <div className="rule-b px-4 py-3">
      <h1 className="text-lg font-semibold text-ink">Follow-ups & commitments</h1>
      <p className="text-sm text-ink-secondary">The module most people skip — and the one that matters most.</p>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  if (count === 0) return null;
  return (
    <div>
      <div className="rule-b bg-surface px-4 py-1.5 font-narrow text-[11px] font-bold uppercase tracking-wider text-ink-tertiary">
        {title} <span className="tabular">· {count}</span>
      </div>
      {children}
    </div>
  );
}

function FollowUpRow({
  sender,
  text,
  quote,
  days,
  confidence,
  status,
  nudged,
  onNudge,
}: {
  sender: string;
  text: string;
  quote?: string;
  days: number;
  confidence?: number;
  status?: "open" | "met" | "missed";
  nudged: boolean;
  onNudge: () => void;
}) {
  const overdue = days > 0;
  return (
    <div className="flex items-start gap-3 rule-b px-4 py-2.5">
      <Clock3 size={14} className="mt-0.5 shrink-0 text-ink-tertiary" />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-ink">
          <span className="font-semibold">{sender}</span> — {text}
        </p>
        {quote && <p className="mt-0.5 text-xs italic text-ink-tertiary">{quote}</p>}
        {confidence !== undefined && <p className="mt-0.5 text-xs text-ink-tertiary">Confidence {confidence}</p>}
      </div>
      {status === "met" && <span className="shrink-0 text-xs font-semibold" style={{ color: "var(--cleared)" }}>Met</span>}
      {status === "missed" && <span className="shrink-0 text-xs font-semibold text-signal">Missed</span>}
      {status !== "met" && (
        <span className={"shrink-0 tabular text-sm font-bold " + (overdue ? "text-signal" : "text-ink-tertiary")}>
          {overdue ? `+${days}d` : `${Math.abs(days)}d`}
        </span>
      )}
      {status !== "met" && (
        <button
          onClick={onNudge}
          disabled={nudged}
          className="shrink-0 rounded-lg border px-2 py-1 text-xs text-ink-secondary hover:bg-surface-sunk disabled:opacity-50"
          style={{ borderColor: "var(--rule)" }}
        >
          {nudged ? "Nudged" : "Nudge"}
        </button>
      )}
    </div>
  );
}
