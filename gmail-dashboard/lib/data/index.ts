// The typed data-access layer. Views import only from here (or from
// ./types directly) — never from a fixture — so a real Gmail + LLM backend
// can replace the implementation of these functions without touching a
// single component. See design-spec.md §10 and §11.2.
//
// All raw collections and derived selectors that used to live here read
// from lib/data/fixtures/*; every one of them has since been replaced by a
// live provider (BoardProvider, ActionItemsProvider, ContactsProvider,
// DraftsProvider, CommitmentsProvider) or a read hook (use-message.ts,
// use-saved-views.ts, etc.) backed by app/api/**. Nothing here re-adds that
// layer — components should keep reading from the providers/hooks, not a
// getX() free function.

export * from "./types";
