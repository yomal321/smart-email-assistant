"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { PLATFORMS } from "@/lib/data";
import { useBoard } from "./board-provider";
import { useContacts } from "./contacts-provider";
import { daysFromNow } from "@/lib/data/now";
import type { SearchResult } from "@/lib/data/types";

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const board = useBoard();
  const { contacts } = useContacts();
  const messages = board.messages;
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<SearchResult[] | null>(null);

  // Debounced server-side search (GET /api/search) once the palette input
  // has anything typed — falls back to the first-6-loaded behavior below
  // when the query is empty, so the palette isn't blank on open.
  React.useEffect(() => {
    // Nothing to debounce with an empty query — the derived groups below
    // already ignore stale `results` once `query` is empty, so there's no
    // need to clear it here.
    if (query.trim().length === 0) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then((res) => res.json())
        .then((body) => setResults(Array.isArray(body) ? body : []))
        .catch(() => {});
    }, 200);
    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [query]);

  const hasQuery = query.trim().length > 0;
  const searchedMessages = hasQuery ? (results?.filter((r) => r.type === "message") ?? []) : null;
  const searchedContacts = hasQuery ? (results?.filter((r) => r.type === "contact") ?? []) : null;

  function go(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  async function handleResyncNow() {
    onOpenChange(false);
    await fetch("/api/sync/resync", { method: "POST" });
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Command palette" description="Search actions, routes, messages, and contacts">
      <CommandInput placeholder="Type a command or search…" value={query} onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Actions">
          <CommandItem
            onSelect={() => {
              board.archive(messages.filter((m) => m.status === "open" && m.ai?.priority === "low").map((m) => m.id));
              onOpenChange(false);
            }}
          >
            Clear low-priority
            <CommandShortcut>E</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={handleResyncNow}>Resync now</CommandItem>
          <CommandItem
            onSelect={() => {
              const stale = messages.filter((m) => m.status === "open" && !m.isUnread && m.ai?.platform === "newsletter");
              board.snooze(stale.map((m) => m.id), daysFromNow(3));
              onOpenChange(false);
            }}
          >
            Triage new mail
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Go to">
          <CommandItem onSelect={() => go("/")}>Overview</CommandItem>
          <CommandItem onSelect={() => go("/inbox")}>Inbox</CommandItem>
          <CommandItem onSelect={() => go("/actions")}>Action items</CommandItem>
          <CommandItem onSelect={() => go("/drafts")}>Drafts</CommandItem>
          <CommandItem onSelect={() => go("/follow-ups")}>Follow-ups</CommandItem>
          <CommandItem onSelect={() => go("/contacts")}>Contacts</CommandItem>
          <CommandItem onSelect={() => go("/analytics")}>Analytics</CommandItem>
          <CommandItem onSelect={() => go("/rules")}>Rules</CommandItem>
          <CommandItem onSelect={() => go("/settings")}>Settings</CommandItem>
          <CommandItem onSelect={() => go("/review")}>Review queue</CommandItem>
          {PLATFORMS.map((p) => (
            <CommandItem key={p.platform} onSelect={() => go(`/inbox?platform=${p.platform}`)}>
              Platform {p.number} · {p.label}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Messages">
          {searchedMessages
            ? searchedMessages.map((r) => (
                // value includes the live query so cmdk's own fuzzy filter
                // (which re-matches every item's rendered text against the
                // typed query, independent of our server-side filtering)
                // never hides an already-server-matched result.
                <CommandItem key={r.id} value={`${query} ${r.title} ${r.subtitle}`} onSelect={() => go(`/inbox?open=${r.id}`)}>
                  {r.subtitle} — {r.title}
                </CommandItem>
              ))
            : messages.slice(0, 6).map((m) => (
                <CommandItem key={m.id} onSelect={() => go(`/inbox?open=${m.id}`)}>
                  {m.sender.name} — {m.subject}
                </CommandItem>
              ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Contacts">
          {searchedContacts
            ? searchedContacts.map((r) => (
                <CommandItem key={r.id} value={`${query} ${r.title} ${r.subtitle}`} onSelect={() => go("/contacts")}>
                  {r.title} · {r.subtitle}
                </CommandItem>
              ))
            : contacts.slice(0, 6).map((c) => (
                <CommandItem key={c.id} onSelect={() => go("/contacts")}>
                  {c.name} · {c.email}
                </CommandItem>
              ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
