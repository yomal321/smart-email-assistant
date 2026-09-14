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
import { getMessages, getContacts, PLATFORMS } from "@/lib/data";
import { useBoard } from "./board-provider";
import { daysFromNow } from "@/lib/data/now";

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const board = useBoard();
  const messages = getMessages();
  const contacts = getContacts();

  function go(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Command palette" description="Search actions, routes, messages, and contacts">
      <CommandInput placeholder="Type a command or search…" />
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
          <CommandItem onSelect={() => onOpenChange(false)}>Resync now</CommandItem>
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
          {messages.slice(0, 6).map((m) => (
            <CommandItem key={m.id} onSelect={() => go(`/inbox?open=${m.id}`)}>
              {m.sender.name} — {m.subject}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Contacts">
          {contacts.slice(0, 6).map((c) => (
            <CommandItem key={c.id} onSelect={() => go("/contacts")}>
              {c.name} · {c.email}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
