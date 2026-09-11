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

function CommandPaletteTrigger() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(COMMAND_PALETTE_OPEN_EVENT))}
      aria-label="Open command palette"
      className="flex shrink-0 items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus:ring-2 focus:ring-ring/30 focus:outline-none"
    >
      <svg viewBox="0 0 20 20" fill="none" aria-hidden className="h-4 w-4">
        <path
          d="M9 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12Zm7 2-3.5-3.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="hidden sm:inline">Search…</span>
      <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground sm:inline">
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
