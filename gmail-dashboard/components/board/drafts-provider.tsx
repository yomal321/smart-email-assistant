"use client";

import * as React from "react";
import type { Draft } from "@/lib/data";
import { getDrafts } from "@/lib/data";

interface DraftsContextValue {
  drafts: Draft[];
  updateBody: (id: string, body: string) => void;
  setTone: (id: string, tone: Draft["tone"]) => void;
  setLength: (id: string, length: Draft["length"]) => void;
  setStatus: (id: string, status: Draft["status"]) => void;
}

const DraftsContext = React.createContext<DraftsContextValue | null>(null);

export function DraftsProvider({ children }: { children: React.ReactNode }) {
  const [drafts, setDrafts] = React.useState<Draft[]>(() => getDrafts());

  const patch = React.useCallback((id: string, fields: Partial<Draft>) => {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...fields } : d)));
  }, []);

  const value: DraftsContextValue = {
    drafts,
    updateBody: (id, body) => patch(id, { body }),
    setTone: (id, tone) => patch(id, { tone }),
    setLength: (id, length) => patch(id, { length }),
    setStatus: (id, status) => patch(id, { status, approvedAt: status === "approved" ? new Date().toISOString() : undefined }),
  };

  return <DraftsContext.Provider value={value}>{children}</DraftsContext.Provider>;
}

export function useDrafts(): DraftsContextValue {
  const ctx = React.useContext(DraftsContext);
  if (!ctx) throw new Error("useDrafts must be used within DraftsProvider");
  return ctx;
}
