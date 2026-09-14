"use client";

import * as React from "react";
import { Star } from "lucide-react";
import { getContacts, getMessages, type Contact, type Tone } from "@/lib/data";
import { useBoard } from "@/components/board/board-provider";
import { InitialsAvatar } from "@/components/station/initials-avatar";
import { formatFullDateTime } from "@/lib/format/relative-time";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type SortKey = "messages" | "reply" | "lastContact" | "name";

const TONE_COLOR: Record<Tone, string> = {
  tense: "var(--signal)",
  neutral: "var(--rule-strong)",
  warm: "var(--cleared)",
};

export default function ContactsPage() {
  const board = useBoard();
  const [sort, setSort] = React.useState<SortKey>("messages");
  const [groupByDomain, setGroupByDomain] = React.useState(false);
  const [selected, setSelected] = React.useState<Contact | null>(null);
  const contacts = getContacts();
  const messages = getMessages();

  const sorted = [...contacts].sort((a, b) => {
    switch (sort) {
      case "reply":
        return (a.yourAvgReplyHours ?? 9999) - (b.yourAvgReplyHours ?? 9999);
      case "lastContact":
        return new Date(b.lastContactAt).getTime() - new Date(a.lastContactAt).getTime();
      case "name":
        return a.name.localeCompare(b.name);
      case "messages":
      default:
        return b.messageCount - a.messageCount;
    }
  });

  const groups = groupByDomain
    ? Object.entries(
        sorted.reduce<Record<string, Contact[]>>((acc, c) => {
          (acc[c.domain] ??= []).push(c);
          return acc;
        }, {})
      )
    : [["All", sorted] as [string, Contact[]]];

  const openThreads = selected ? messages.filter((m) => selected.openThreadIds.includes(m.threadId)) : [];

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 rule-b px-4 py-3">
        <div>
          <h1 className="text-lg font-semibold text-ink">Contacts & relationships</h1>
          <p className="text-sm text-ink-secondary">People you email most, ranked.</p>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-ink-secondary">
          <input type="checkbox" checked={groupByDomain} onChange={(e) => setGroupByDomain(e.target.checked)} className="accent-departure" />
          Group by company
        </label>
      </div>

      {groups.map(([domain, list]) => (
        <div key={domain}>
          {groupByDomain && (
            <div className="rule-b bg-surface px-4 py-1.5 font-narrow text-[11px] font-bold uppercase tracking-wider text-ink-tertiary">
              {domain} <span className="tabular">· {list.length}</span>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="rule-b text-left text-ink-tertiary">
                  <th className="px-4 py-2 font-normal"></th>
                  <SortableHead label="Name" active={sort === "name"} onClick={() => setSort("name")} />
                  <th className="px-3 py-2 font-normal">Domain</th>
                  <SortableHead label="Messages" active={sort === "messages"} onClick={() => setSort("messages")} align="right" />
                  <SortableHead label="Your avg reply" active={sort === "reply"} onClick={() => setSort("reply")} align="right" />
                  <SortableHead label="Last contact" active={sort === "lastContact"} onClick={() => setSort("lastContact")} align="right" />
                  <th className="px-3 py-2 text-right font-normal">Open threads</th>
                  <th className="px-3 py-2 text-right font-normal">VIP</th>
                </tr>
              </thead>
              <tbody>
                {list.map((c) => {
                  const isVip = board.isVip(c.id, c.isVip);
                  return (
                    <tr key={c.id} className="rule-b cursor-pointer hover:bg-surface" onClick={() => setSelected(c)}>
                      <td className="px-4 py-2">
                        <InitialsAvatar name={c.name} size={28} />
                      </td>
                      <td className="px-3 py-2 font-medium text-ink">{c.name}</td>
                      <td className="px-3 py-2 text-ink-tertiary">{c.domain}</td>
                      <td className="px-3 py-2 text-right tabular text-ink">{c.messageCount}</td>
                      <td className="px-3 py-2 text-right tabular text-ink">
                        {c.yourAvgReplyHours !== null ? `${c.yourAvgReplyHours}h` : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular text-ink-tertiary">
                        {formatFullDateTime(c.lastContactAt)}
                      </td>
                      <td className="px-3 py-2 text-right tabular text-ink-tertiary">{c.openThreadIds.length}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            board.toggleVip(c.id);
                          }}
                          aria-label={isVip ? "Remove VIP" : "Mark VIP"}
                          className="inline-flex"
                        >
                          <Star size={15} className={isVip ? "fill-current text-platform-1" : "text-ink-tertiary"} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <Dialog open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <DialogContent className="max-w-lg rounded-lg">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <InitialsAvatar name={selected.name} size={32} />
                  {selected.name}
                </DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-4 gap-2 text-center">
                <Stat label="Messages" value={selected.messageCount} />
                <Stat label="Avg reply" value={selected.yourAvgReplyHours !== null ? `${selected.yourAvgReplyHours}h` : "—"} />
                <Stat label="Open threads" value={selected.openThreadIds.length} />
                <Stat label="Last contact" value={formatFullDateTime(selected.lastContactAt)} small />
              </div>

              <div>
                <h4 className="mb-1.5 font-narrow text-[11px] font-bold uppercase tracking-wider text-ink-tertiary">
                  Tone history
                </h4>
                <div className="flex gap-1">
                  {selected.toneHistory.map((t) => (
                    <span
                      key={t.month}
                      title={`${t.month}: ${t.tone}`}
                      className="h-5 w-5 rounded-lg"
                      style={{ background: TONE_COLOR[t.tone] }}
                    />
                  ))}
                </div>
              </div>

              {openThreads.length > 0 && (
                <div>
                  <h4 className="mb-1.5 font-narrow text-[11px] font-bold uppercase tracking-wider text-ink-tertiary">
                    Open threads
                  </h4>
                  <ul className="space-y-1 text-sm">
                    {openThreads.map((m) => (
                      <li key={m.id} className="text-ink-secondary">
                        {m.subject}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SortableHead({
  label,
  active,
  onClick,
  align = "left",
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  align?: "left" | "right";
}) {
  return (
    <th className={"px-3 py-2 font-normal " + (align === "right" ? "text-right" : "text-left")}>
      <button onClick={onClick} className={active ? "font-semibold text-ink" : "hover:text-ink"}>
        {label}
      </button>
    </th>
  );
}

function Stat({ label, value, small }: { label: string; value: string | number; small?: boolean }) {
  return (
    <div>
      <div className={small ? "tabular text-xs text-ink" : "tabular text-lg font-bold text-ink"}>{value}</div>
      <div className="font-narrow text-[9px] font-bold uppercase tracking-wider text-ink-tertiary">{label}</div>
    </div>
  );
}
