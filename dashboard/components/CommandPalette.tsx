"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { NAV_ITEMS } from "@/components/Sidebar";
import { COMMAND_PALETTE_OPEN_EVENT } from "@/components/TopBar";

/**
 * ⌘K/Ctrl+K command palette. Navigation-only (FR2): it lists the same
 * `NAV_ITEMS` the sidebar renders (one source of truth for "what pages
 * exist") rather than a self-built or third-party fuzzy-search index.
 */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const results = NAV_ITEMS.filter((item) => item.label.toLowerCase().includes(query.trim().toLowerCase()));

  function openPalette() {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    setQuery("");
    setActiveIndex(0);
    setOpen(true);
  }

  function closePalette() {
    setOpen(false);
    previouslyFocused.current?.focus();
  }

  // Global Ctrl+K/Cmd+K shortcut, plus the TopBar trigger's custom event —
  // both open the same palette so it works "from anywhere in the shell".
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openPalette();
      }
    }
    function onOpenEvent() {
      openPalette();
    }
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener(COMMAND_PALETTE_OPEN_EVENT, onOpenEvent);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(COMMAND_PALETTE_OPEN_EVENT, onOpenEvent);
    };
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open) return null;

  function onQueryChange(next: string) {
    setQuery(next);
    setActiveIndex(0);
  }

  function selectItem(index: number) {
    const item = results[index];
    if (!item) return;
    closePalette();
    router.push(item.href);
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      closePalette();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (results.length ? (i + 1) % results.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      selectItem(activeIndex);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-foreground/40 p-4 pt-24"
      role="presentation"
      onClick={closePalette}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl"
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          <svg viewBox="0 0 20 20" fill="none" aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground">
            <path
              d="M9 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12Zm7 2-3.5-3.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-list"
            aria-activedescendant={results[activeIndex] ? `command-palette-option-${results[activeIndex].href}` : undefined}
            aria-autocomplete="list"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Search pages…"
            aria-label="Search pages"
            className="w-full rounded-md bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/30 focus:outline-none"
          />
          <kbd className="shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
            Esc
          </kbd>
        </div>

        <ul id="command-palette-list" role="listbox" aria-label="Pages" className="max-h-72 overflow-y-auto p-1.5">
          {results.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">No matching pages.</li>
          )}
          {results.map((item, index) => {
            const Icon = item.icon;
            const active = index === activeIndex;
            return (
              <li
                key={item.href}
                id={`command-palette-option-${item.href}`}
                role="option"
                aria-selected={active}
              >
                <button
                  type="button"
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectItem(index)}
                  className={`flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors duration-150 focus:ring-2 focus:ring-ring/30 focus:outline-none ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
