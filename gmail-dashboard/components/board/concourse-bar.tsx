"use client";

import * as React from "react";
import { Menu, Search, Moon, Sun, Monitor, Rows3, Rows2, HelpCircle, User } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PlatformRail, type RailCounts } from "@/components/station/platform-rail";
import { SyncClock } from "@/components/station/sync-clock";
import { useSyncState } from "@/lib/data/use-sync-state";
import { usePreferences } from "./preferences-provider";

export function ConcourseBar({
  counts,
  onOpenPalette,
  onOpenShortcuts,
}: {
  counts: RailCounts;
  onOpenPalette: () => void;
  onOpenShortcuts: () => void;
}) {
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const { theme, setTheme, density, setDensity } = usePreferences();
  const { data: sync, loading: syncLoading } = useSyncState();

  return (
    <div className="flex h-16 shrink-0 items-center gap-2 border-b border-rule bg-surface px-4">
      <button
        className="flex h-9 w-9 items-center justify-center rounded-xl text-ink-secondary hover:bg-surface-sunk md:hidden"
        aria-label="Open navigation"
        onClick={() => setMobileNavOpen(true)}
      >
        <Menu size={18} />
      </button>

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-[240px] p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <PlatformRail counts={counts} />
        </SheetContent>
      </Sheet>

      <span className="hidden font-narrow text-[15px] font-extrabold tracking-tight text-ink sm:inline">
        Departure Board
      </span>

      <button
        onClick={onOpenPalette}
        aria-label="Search summaries, action items, contacts"
        className="ml-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-rule bg-surface-sunk text-ink-tertiary transition-colors hover:bg-surface-raised hover:text-ink sm:h-auto sm:w-auto sm:min-w-0 sm:flex-1 sm:max-w-md sm:justify-start sm:gap-2 sm:px-3.5 sm:py-2"
      >
        <Search size={15} className="shrink-0" />
        <span className="hidden min-w-0 flex-1 truncate text-left text-sm sm:inline">
          Search summaries, action items, contacts…
        </span>
        <kbd className="hidden shrink-0 rounded-md border border-rule bg-surface px-1.5 py-0.5 text-[10px] text-ink-tertiary sm:inline">
          ⌘K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-1">
        {sync ? (
          <SyncClock state={sync} onResync={() => {}} />
        ) : (
          <span className="hidden px-2 py-1.5 text-xs text-ink-tertiary tabular sm:inline">
            {syncLoading ? "Syncing…" : "—"}
          </span>
        )}

        <button
          onClick={onOpenShortcuts}
          aria-label="Keyboard shortcuts (?)"
          className="flex h-9 w-9 items-center justify-center rounded-xl text-ink-tertiary transition-colors hover:bg-surface-sunk"
        >
          <HelpCircle size={16} />
        </button>

        <button
          onClick={() => setDensity(density === "comfortable" ? "dense" : "comfortable")}
          aria-label={`Switch to ${density === "comfortable" ? "dense" : "comfortable"} density`}
          title={`Density: ${density}`}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-ink-tertiary transition-colors hover:bg-surface-sunk"
        >
          {density === "comfortable" ? <Rows2 size={16} /> : <Rows3 size={16} />}
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label="Theme"
              className="flex h-9 w-9 items-center justify-center rounded-xl text-ink-tertiary transition-colors hover:bg-surface-sunk"
            >
              {theme === "dark" ? <Moon size={16} /> : theme === "light" ? <Sun size={16} /> : <Monitor size={16} />}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setTheme("light")}>
              <Sun size={14} className="mr-2" /> Light
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("dark")}>
              <Moon size={14} className="mr-2" /> Dark
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("system")}>
              <Monitor size={14} className="mr-2" /> System
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div
          className="ml-1 flex h-8 w-8 items-center justify-center rounded-full bg-departure text-departure-ink shadow-card"
          title={sync ? `Connected Gmail account — ${sync.status}` : "Connected Gmail account"}
        >
          <User size={16} />
        </div>
      </div>
    </div>
  );
}
