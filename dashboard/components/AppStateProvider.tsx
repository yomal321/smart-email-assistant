"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
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

// Theme/density are read from localStorage, so the client's real value can
// legitimately differ from the server-rendered HTML (which has no
// localStorage to read). A `useState(() => localStorage...)` lazy
// initializer avoids the setState-in-effect lint error, but it makes the
// client's *first* render (during hydration) diverge from what the server
// sent — React then logs a hydration-mismatch error for any component whose
// output depends on theme/density (e.g. Settings' selected-option styling).
// useSyncExternalStore is the primitive React ships for exactly this case:
// getServerSnapshot supplies the SSR-matching value for the hydration pass,
// then React re-renders with the real client snapshot right after —
// no setState-in-effect, no mismatch warning.
type Listener = () => void;
const storeListeners = new Set<Listener>();

function notifyStoreListeners() {
  for (const listener of storeListeners) listener();
}

function subscribeToStore(listener: Listener) {
  storeListeners.add(listener);
  return () => storeListeners.delete(listener);
}

function getThemeSnapshot(): Theme {
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
}
function getThemeServerSnapshot(): Theme {
  return "system";
}

function getDensitySnapshot(): Density {
  const stored = window.localStorage.getItem(DENSITY_STORAGE_KEY);
  return stored === "comfortable" || stored === "compact" ? stored : "comfortable";
}
function getDensityServerSnapshot(): Density {
  return "comfortable";
}

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

  const theme = useSyncExternalStore(subscribeToStore, getThemeSnapshot, getThemeServerSnapshot);
  const density = useSyncExternalStore(subscribeToStore, getDensitySnapshot, getDensityServerSnapshot);

  // Apply the theme choice to <html> globally (FR6/AC5) — centralized here
  // (rather than left to whichever route happens to be mounted) so every
  // view reflects the persisted/selected theme, not just the Settings page.
  // An explicit "light"/"dark" class always wins; "system" removes both so
  // globals.css's `prefers-color-scheme` fallback takes over.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.classList.toggle("light", theme === "light");
  }, [theme]);

  function setTheme(next: Theme) {
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
    notifyStoreListeners();
  }

  function setDensity(next: Density) {
    window.localStorage.setItem(DENSITY_STORAGE_KEY, next);
    notifyStoreListeners();
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
