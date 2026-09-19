"use client";

import * as React from "react";
import { PLATFORMS } from "@/lib/data";
import { useBoard } from "./board-provider";
import { useActionItems } from "./action-items-provider";
import { useDrafts } from "./drafts-provider";
import { useCommitments } from "./commitments-provider";
import { ConcourseBar } from "./concourse-bar";
import { PlatformRail, type RailCounts } from "@/components/station/platform-rail";
import { UndoBar } from "./undo-bar";
import { CommandPalette } from "./command-palette";
import { ShortcutSheet } from "./shortcut-sheet";

export function AppShell({ children }: { children: React.ReactNode }) {
  const board = useBoard();
  const actionItems = useActionItems();
  const drafts = useDrafts();
  const commitments = useCommitments();
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);

  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const typing = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      if (typing) return;
      if (e.key === "/") {
        e.preventDefault();
        setPaletteOpen(true);
      }
      if (e.key === "?") {
        setShortcutsOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const open = board.messages.filter((m) => m.status === "open" || m.status === "snoozed");
  const reviewQueue = board.messages.filter((m) => m.ai === null || (m.ai && m.ai.confidence < 50));
  const platformCounts = Object.fromEntries(
    PLATFORMS.map((p) => [
      p.platform,
      open.filter((m) => m.ai?.platform === p.platform && m.ai.confidence >= 50).length,
    ])
  ) as RailCounts["platforms"];

  const openActionItems = actionItems.items.filter((i) => i.status !== "done").length;
  const pendingDrafts = drafts.drafts.filter((d) => d.status === "pending").length;
  const followUps =
    commitments.awaitingReply.length + commitments.commitments.filter((c) => c.status === "open").length;

  const counts: RailCounts = {
    overview: 0,
    inbox: open.length,
    actions: openActionItems,
    drafts: pendingDrafts,
    followUps,
    reviewQueue: reviewQueue.length,
    platforms: platformCounts,
  };

  return (
    <React.Suspense fallback={null}>
      <div className="flex h-dvh flex-col bg-ground">
        <ConcourseBar counts={counts} onOpenPalette={() => setPaletteOpen(true)} onOpenShortcuts={() => setShortcutsOpen(true)} />
        <div className="flex flex-1 overflow-hidden">
          <div className="hidden lg:block">
            <PlatformRail counts={counts} compact={false} />
          </div>
          <div className="hidden md:block lg:hidden">
            <PlatformRail counts={counts} compact />
          </div>
          <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
        </div>
        <UndoBar />
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
        <ShortcutSheet open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      </div>
    </React.Suspense>
  );
}
