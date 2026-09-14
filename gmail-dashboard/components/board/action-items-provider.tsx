"use client";

import * as React from "react";
import type { ActionItem } from "@/lib/data";
import { getActionItems } from "@/lib/data";

interface ActionItemsContextValue {
  items: ActionItem[];
  addManual: (text: string, dueDate: string | null) => void;
  setStatus: (id: string, status: ActionItem["status"]) => void;
}

const ActionItemsContext = React.createContext<ActionItemsContextValue | null>(null);

export function ActionItemsProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ActionItem[]>(() => getActionItems());

  const addManual = React.useCallback((text: string, dueDate: string | null) => {
    setItems((prev) => [
      {
        id: `ai-manual-${Date.now()}`,
        text,
        sourceMessageId: "",
        owner: "you",
        dueDate,
        priority: "normal",
        status: "todo",
        origin: "manual",
        confidence: null,
      },
      ...prev,
    ]);
  }, []);

  const setStatus = React.useCallback((id: string, status: ActionItem["status"]) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
  }, []);

  return (
    <ActionItemsContext.Provider value={{ items, addManual, setStatus }}>{children}</ActionItemsContext.Provider>
  );
}

export function useActionItems(): ActionItemsContextValue {
  const ctx = React.useContext(ActionItemsContext);
  if (!ctx) throw new Error("useActionItems must be used within ActionItemsProvider");
  return ctx;
}
