"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PreferencesProvider } from "@/components/board/preferences-provider";
import { BoardProvider } from "@/components/board/board-provider";
import { ActionItemsProvider } from "@/components/board/action-items-provider";
import { ContactsProvider } from "@/components/board/contacts-provider";
import { DraftsProvider } from "@/components/board/drafts-provider";
import { CommitmentsProvider } from "@/components/board/commitments-provider";
import { AppShell } from "@/components/board/app-shell";

export function Providers({ children }: { children: React.ReactNode }) {
  // /login is reachable while unauthenticated (008-dashboard-api-foundation),
  // so it skips the dashboard chrome (sidebar/top bar) — an unauthenticated
  // visitor shouldn't see the app shell around the sign-in form.
  //
  // The five data providers below are also skipped on /login, not just
  // AppShell -- each fetches on mount exactly once (empty effect deps), so
  // mounting them pre-auth means their one fetch always 401s (no session
  // cookie yet), and a client-side router.push("/") after a successful
  // login never remounts them to retry: the whole dashboard would render
  // empty until a hard refresh. Excluding them here means login -> navigate
  // mounts them for the first time only once a session cookie already
  // exists, so their one fetch succeeds.
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";

  if (isLoginPage) {
    return (
      <PreferencesProvider>
        <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
      </PreferencesProvider>
    );
  }

  return (
    <PreferencesProvider>
      <BoardProvider>
        <ActionItemsProvider>
          <ContactsProvider>
            <DraftsProvider>
              <CommitmentsProvider>
                <TooltipProvider delayDuration={300}>
                  <AppShell>{children}</AppShell>
                </TooltipProvider>
              </CommitmentsProvider>
            </DraftsProvider>
          </ContactsProvider>
        </ActionItemsProvider>
      </BoardProvider>
    </PreferencesProvider>
  );
}
