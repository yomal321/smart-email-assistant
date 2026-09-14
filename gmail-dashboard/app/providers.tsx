"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PreferencesProvider } from "@/components/board/preferences-provider";
import { BoardProvider } from "@/components/board/board-provider";
import { ActionItemsProvider } from "@/components/board/action-items-provider";
import { DraftsProvider } from "@/components/board/drafts-provider";
import { AppShell } from "@/components/board/app-shell";

export function Providers({ children }: { children: React.ReactNode }) {
  // /login is reachable while unauthenticated (008-dashboard-api-foundation),
  // so it skips the dashboard chrome (sidebar/top bar) — an unauthenticated
  // visitor shouldn't see the app shell around the sign-in form.
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";

  return (
    <PreferencesProvider>
      <BoardProvider>
        <ActionItemsProvider>
          <DraftsProvider>
            <TooltipProvider delayDuration={300}>
              {isLoginPage ? children : <AppShell>{children}</AppShell>}
            </TooltipProvider>
          </DraftsProvider>
        </ActionItemsProvider>
      </BoardProvider>
    </PreferencesProvider>
  );
}
