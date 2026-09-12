"use client";

import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SearchBar } from "@/components/SearchBar";

/**
 * Dispatched when the command-palette trigger below is activated.
 * `components/CommandPalette.tsx` (T6) listens for this window event to
 * open itself — a plain custom event keeps this task and T6 independent of
 * each other's internals instead of introducing a new shared-state file.
 */
export const COMMAND_PALETTE_OPEN_EVENT = "command-palette:open";

/**
 * Deliberately not styled as a search input (rounded pill + magnifying-glass
 * icon) — on `/inbox` this trigger sits directly beside `InboxSearch`'s real
 * search box, and two look-alike search fields side by side reads as a bug,
 * not two distinct affordances. A command-key glyph + compact `kbd` keeps
 * this legible as "jump to / run a command" instead of a second search.
 */
function CommandPaletteTrigger() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(COMMAND_PALETTE_OPEN_EVENT))}
      aria-label="Open command palette"
      title="Command palette"
      className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus:ring-2 focus:ring-ring/30 focus:outline-none"
    >
      <svg viewBox="0 0 24 24" fill="none" aria-hidden className="h-4 w-4">
        <polygon
          points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
      <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
        Ctrl K
      </kbd>
    </button>
  );
}

/**
 * Reads/writes the Inbox search text as the `q` URL search param (rather
 * than component state or a new context) so this task stays self-contained:
 * whichever task builds `app/inbox/page.tsx` can read the same query with
 * its own `useSearchParams()` call, no import from this file required.
 */
function InboxSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.get("q") ?? "";

  function setQuery(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next) {
      params.set("q", next);
    } else {
      params.delete("q");
    }
    const suffix = params.toString();
    router.replace(suffix ? `${pathname}?${suffix}` : pathname, { scroll: false });
  }

  return (
    <div className="w-full max-w-sm">
      <SearchBar value={query} onChange={setQuery} />
    </div>
  );
}

function TopBarContent() {
  const pathname = usePathname();
  const isInbox = pathname === "/inbox" || pathname.startsWith("/inbox/");

  return (
    <header className="sticky top-0 z-20 flex items-center gap-4 border-b border-border bg-card py-3 pr-4 pl-16 md:pl-4">
      <div className="min-w-0 flex-1">{isInbox && <InboxSearch />}</div>
      <CommandPaletteTrigger />
    </header>
  );
}

const FALLBACK_HEADER = (
  <header className="sticky top-0 z-20 flex items-center gap-4 border-b border-border bg-card py-3 pr-4 pl-16 md:pl-4">
    <div className="min-w-0 flex-1" />
    <CommandPaletteTrigger />
  </header>
);

export function TopBar() {
  return (
    <Suspense fallback={FALLBACK_HEADER}>
      <TopBarContent />
    </Suspense>
  );
}
