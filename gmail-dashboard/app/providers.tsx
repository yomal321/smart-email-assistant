"use client";

import * as React from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PreferencesProvider } from "@/components/board/preferences-provider";
import { BoardProvider } from "@/components/board/board-provider";
import { ActionItemsProvider } from "@/components/board/action-items-provider";
import { DraftsProvider } from "@/components/board/drafts-provider";
import { AppShell } from "@/components/board/app-shell";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PreferencesProvider>
      <BoardProvider>
        <ActionItemsProvider>
          <DraftsProvider>
            <TooltipProvider delayDuration={300}>
              <AppShell>{children}</AppShell>
            </TooltipProvider>
          </DraftsProvider>
        </ActionItemsProvider>
      </BoardProvider>
    </PreferencesProvider>
  );
}
