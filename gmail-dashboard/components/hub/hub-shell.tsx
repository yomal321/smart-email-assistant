"use client";

// The hub's chrome — the sidebar and top bar for the main dashboard and every
// life module inside it. Deliberately not AppShell: that one is the mail
// module's identity (the Departure Board, its platform rail, its command
// palette) and mounts the mail data providers. This one shares only the design
// tokens, so the two rooms feel like one product without sharing state.

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, LayoutDashboard, CheckSquare, Target, StickyNote, Bot, Mail, Moon, Sun, Monitor } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { usePreferences } from "@/components/board/preferences-provider";
import { cn } from "@/lib/utils";

const HUB_ROUTES = [
  { href: "/", label: "Today", icon: LayoutDashboard },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/plans", label: "Plans", icon: Target },
  { href: "/notes", label: "Notes", icon: StickyNote },
  { href: "/bot", label: "Bot", icon: Bot },
];

export function HubShell({ children }: { children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const { theme, setTheme } = usePreferences();

  return (
    <div className="flex h-dvh flex-col bg-ground">
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
            <HubRail onNavigate={() => setMobileNavOpen(false)} />
          </SheetContent>
        </Sheet>

        <span className="font-narrow text-[15px] font-extrabold tracking-tight text-ink">Main dashboard</span>

        <div className="flex-1" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex h-9 w-9 items-center justify-center rounded-xl text-ink-secondary hover:bg-surface-sunk"
              aria-label="Theme"
            >
              {theme === "dark" ? <Moon size={16} /> : theme === "light" ? <Sun size={16} /> : <Monitor size={16} />}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setTheme("light")}>
              <Sun size={14} /> Light
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("dark")}>
              <Moon size={14} /> Dark
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("system")}>
              <Monitor size={14} /> System
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="hidden md:block">
          <HubRail />
        </div>
        <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
      </div>
    </div>
  );
}

function HubRail({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav
      className="flex h-full w-56 flex-col overflow-y-auto scrollbar-none border-r border-rule bg-surface-sunk px-3 py-4"
      aria-label="Primary"
    >
      <div className="flex flex-col gap-1">
        {HUB_ROUTES.map((r) => {
          const active = pathname === r.href;
          return (
            <Link
              key={r.href}
              href={r.href}
              onClick={onNavigate}
              className={cn(
                "group relative flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] transition-colors",
                active
                  ? "bg-departure-field font-semibold text-departure-field-ink"
                  : "text-ink-secondary hover:bg-surface-raised hover:text-ink"
              )}
            >
              {active && (
                <span
                  className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-full"
                  style={{ background: "var(--departure)" }}
                />
              )}
              <r.icon
                size={17}
                className={cn("shrink-0", active ? "text-departure" : "text-ink-tertiary group-hover:text-ink")}
              />
              <span className="flex-1 truncate">{r.label}</span>
            </Link>
          );
        })}
      </div>

      <div className="my-3 border-t border-rule" />

      {/* The door into the mail module. Styled as a destination rather than a
          nav item, because clicking it swaps the entire shell. */}
      <Link
        href="/mail"
        onClick={onNavigate}
        className="flex items-center gap-2.5 rounded-xl border border-rule bg-surface px-2.5 py-2.5 text-[13px] font-medium text-ink transition-colors hover:border-departure hover:bg-surface-raised"
      >
        <Mail size={17} className="shrink-0 text-departure" />
        <span className="flex-1 truncate">Mail Assistant</span>
        <span className="text-ink-tertiary">→</span>
      </Link>
    </nav>
  );
}
