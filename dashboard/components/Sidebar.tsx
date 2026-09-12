"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type SVGProps } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type IconComponent = (props: SVGProps<SVGSVGElement>) => React.JSX.Element;

export interface NavItem {
  href: string;
  label: string;
  icon: IconComponent;
}

function OverviewIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden {...props}>
      <rect x="3" y="3" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11" y="3" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="3" y="11" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11" y="11" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function InboxIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden {...props}>
      <path
        d="M3 8.5 5 3h10l2 5.5M3 8.5v6a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 17 14.5v-6M3 8.5h4.2a.5.5 0 0 1 .45.28l.7 1.44a.5.5 0 0 0 .45.28h2.4a.5.5 0 0 0 .45-.28l.7-1.44a.5.5 0 0 1 .45-.28H17"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SettingsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden {...props}>
      <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M16.5 10c0 .34-.03.67-.08 1l1.56 1.22a.5.5 0 0 1 .12.64l-1.5 2.6a.5.5 0 0 1-.6.22l-1.83-.74c-.53.4-1.13.72-1.77.93l-.28 1.94a.5.5 0 0 1-.5.44h-3a.5.5 0 0 1-.5-.44l-.28-1.94a5.9 5.9 0 0 1-1.77-.93l-1.83.74a.5.5 0 0 1-.6-.22l-1.5-2.6a.5.5 0 0 1 .12-.64L3.58 11c-.05-.33-.08-.66-.08-1s.03-.67.08-1L2.02 7.78a.5.5 0 0 1-.12-.64l1.5-2.6a.5.5 0 0 1 .6-.22l1.83.74c.53-.4 1.13-.72 1.77-.93l.28-1.94a.5.5 0 0 1 .5-.44h3a.5.5 0 0 1 .5.44l.28 1.94c.64.21 1.24.53 1.77.93l1.83-.74a.5.5 0 0 1 .6.22l1.5 2.6a.5.5 0 0 1-.12.64L16.42 9c.05.33.08.66.08 1Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Single source of truth for "what pages exist" — rendered here as the
 * persistent nav, and reused as-is by `components/CommandPalette.tsx` (T6)
 * so the palette's navigation entries never drift out of sync with the
 * sidebar's.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/overview", label: "Overview", icon: OverviewIcon },
  { href: "/inbox", label: "Inbox", icon: InboxIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

const DESKTOP_QUERY = "(min-width: 768px)";

function subscribeToDesktopBreakpoint(onChange: () => void) {
  const mq = window.matchMedia(DESKTOP_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function getIsDesktopSnapshot() {
  return window.matchMedia(DESKTOP_QUERY).matches;
}

function getIsDesktopServerSnapshot() {
  return false;
}

export function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  // Tracks the `md` breakpoint in JS (not just CSS) so the off-canvas panel
  // can be made `inert` while it's closed on mobile — otherwise a keyboard
  // user tabbing through a closed drawer would land on invisible links.
  const isDesktop = useSyncExternalStore(
    subscribeToDesktopBreakpoint,
    getIsDesktopSnapshot,
    getIsDesktopServerSnapshot
  );
  const panelRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!mobileOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMobileOpen(false);
        toggleRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    panelRef.current?.querySelector<HTMLElement>("a")?.focus();
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  function closeMobile() {
    setMobileOpen(false);
  }

  return (
    <>
      <button
        ref={toggleRef}
        type="button"
        onClick={() => setMobileOpen((prev) => !prev)}
        aria-expanded={mobileOpen}
        aria-controls="app-sidebar-nav"
        aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
        className="fixed top-3 left-3 z-40 flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-foreground shadow-sm transition-colors duration-150 hover:bg-muted focus:ring-2 focus:ring-ring/30 focus:outline-none md:hidden"
      >
        <svg viewBox="0 0 20 20" fill="none" aria-hidden className="h-5 w-5">
          {mobileOpen ? (
            <path d="M5 5l10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          ) : (
            <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          )}
        </svg>
      </button>

      {mobileOpen && (
        <div
          aria-hidden
          onClick={closeMobile}
          className="fixed inset-0 z-30 bg-foreground/40 transition-opacity duration-200 md:hidden"
        />
      )}

      <nav
        id="app-sidebar-nav"
        ref={panelRef}
        aria-label="Primary"
        // Only ever inert while off-canvas on a small viewport — on `md:`
        // and up the panel is a normal, always-visible, always-focusable column.
        inert={!mobileOpen && !isDesktop ? true : undefined}
        className={`fixed inset-y-0 left-0 z-40 flex w-56 shrink-0 flex-col gap-1 border-r border-border bg-card p-3 transition-transform duration-200 md:static md:z-auto md:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-2 flex items-center gap-2 border-b border-border px-2 pb-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground">
            S
          </span>
          <p className="truncate text-sm font-semibold text-foreground">Smart Email Assistant</p>
        </div>
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={closeMobile}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150 focus:ring-2 focus:ring-ring/30 focus:outline-none ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
