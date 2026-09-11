"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { tasks as initialTasks, drafts as initialDrafts } from "@/lib/data/fixtures";
import type { Draft, Task } from "@/lib/types";

const SAMPLE_REPLIES = [
  "Thanks for the note — I'll take a look and get back to you shortly.",
  "Sounds good, that works for me. Let me know if anything changes.",
  "Appreciate the heads up. I'll follow up once I've had a chance to review.",
];

export type Theme = "light" | "dark" | "system";
export type Density = "comfortable" | "compact";

const THEME_STORAGE_KEY = "smart-email-assistant:theme";
const DENSITY_STORAGE_KEY = "smart-email-assistant:density";

interface AppStateContextValue {
  tasks: Task[];
  drafts: Draft[];
  generating: boolean;
  genError: string | null;
  changeTaskStatus: (taskId: string, status: Task["status"]) => void;
  changeDraftStatus: (draftId: string, status: Draft["status"]) => void;
  generateDraft: (emailId: string) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  density: Density;
  setDensity: (density: Density) => void;
}

const AppStateContext = createContext<AppStateContextValue | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [drafts, setDrafts] = useState<Draft[]>(initialDrafts);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  const [theme, setThemeState] = useState<Theme>("system");
  const [density, setDensityState] = useState<Density>("comfortable");

  // Read persisted theme/density on mount (localStorage isn't available during SSR).
  useEffect(() => {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (storedTheme === "light" || storedTheme === "dark" || storedTheme === "system") {
      setThemeState(storedTheme);
    }
    const storedDensity = window.localStorage.getItem(DENSITY_STORAGE_KEY);
    if (storedDensity === "comfortable" || storedDensity === "compact") {
      setDensityState(storedDensity);
    }
  }, []);

  function setTheme(next: Theme) {
    setThemeState(next);
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
  }

  function setDensity(next: Density) {
    setDensityState(next);
    window.localStorage.setItem(DENSITY_STORAGE_KEY, next);
  }

  // --- Relocated verbatim from app/page.tsx (same logic, same behavior) ---

  function changeTaskStatus(taskId: string, status: Task["status"]) {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status } : t)));
  }

  function changeDraftStatus(draftId: string, status: Draft["status"]) {
    setDrafts((prev) => prev.map((d) => (d.id === draftId ? { ...d, status } : d)));
  }

  function generateDraft(emailId: string) {
    setGenerating(true);
    setGenError(null);
    setTimeout(() => {
      setGenerating(false);
      // Simulated failure path mirrors the real endpoint's 502 "draft generation failed".
      if (Math.random() < 0.15) {
        setGenError("Draft generation failed. The model call didn't come back — try again.");
        return;
      }
      const body = SAMPLE_REPLIES[Math.floor(Math.random() * SAMPLE_REPLIES.length)];
      setDrafts((prev) => {
        const existing = prev.find((d) => d.email_id === emailId);
        if (existing) {
          return prev.map((d) =>
            d.id === existing.id
              ? { ...d, draft_body: body, status: "pending", created_at: new Date().toISOString() }
              : d
          );
        }
        return [
          ...prev,
          {
            id: `d${prev.length + 1}`,
            email_id: emailId,
            draft_body: body,
            status: "pending",
            created_at: new Date().toISOString(),
          },
        ];
      });
    }, 1200);
  }

  return (
    <AppStateContext.Provider
      value={{
        tasks,
        drafts,
        generating,
        genError,
        changeTaskStatus,
        changeDraftStatus,
        generateDraft,
        theme,
        setTheme,
        density,
        setDensity,
      }}
    >
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) {
    throw new Error("useAppState must be used within an AppStateProvider");
  }
  return ctx;
}
