"use client";

import * as React from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PreferencesProvider } from "@/components/board/preferences-provider";

// App-wide providers only — theme/density preferences and tooltips, which the
// hub, the mail module and /login all need.
//
// The five email data providers deliberately do NOT live here any more: they
// are mounted by app/mail/layout.tsx so they only ever fetch inside the mail
// module, and the hub never pays for loading the whole email board. That also
// makes the f8dc5e8 login bug structurally impossible rather than guarded
// against — /login sits outside both shells, so there is no data provider
// there to fire its one fetch before a session cookie exists.
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PreferencesProvider>
      <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
    </PreferencesProvider>
  );
}
