"use client";

import * as React from "react";

export type Theme = "light" | "dark" | "system";
export type Density = "comfortable" | "dense";

interface PreferencesContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  density: Density;
  setDensity: (d: Density) => void;
}

const PreferencesContext = React.createContext<PreferencesContextValue | null>(null);

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* ignore — private browsing or blocked storage */
  }
}

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>("system");
  const [density, setDensityState] = React.useState<Density>("comfortable");

  // Deliberate setState-in-effect: localStorage is unavailable during SSR,
  // so the first client render must match the server's "system"/"comfortable"
  // defaults exactly (hydration-safe) and only then adopt the stored
  // preference — reading it during the initial render instead would read
  // real client storage before hydration and mismatch the server's HTML.
  /* eslint-disable react-hooks/set-state-in-effect */
  React.useEffect(() => {
    const storedTheme = readStorage("gmail-dashboard:theme") as Theme | null;
    const storedDensity = readStorage("gmail-dashboard:density") as Density | null;
    if (storedTheme) setThemeState(storedTheme);
    if (storedDensity) setDensityState(storedDensity);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  React.useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") {
      root.removeAttribute("data-theme");
    } else {
      root.setAttribute("data-theme", theme);
    }
  }, [theme]);

  React.useEffect(() => {
    document.documentElement.setAttribute("data-density", density);
  }, [density]);

  const setTheme = React.useCallback((t: Theme) => {
    setThemeState(t);
    writeStorage("gmail-dashboard:theme", t);
  }, []);

  const setDensity = React.useCallback((d: Density) => {
    setDensityState(d);
    writeStorage("gmail-dashboard:density", d);
  }, []);

  return (
    <PreferencesContext.Provider value={{ theme, setTheme, density, setDensity }}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences(): PreferencesContextValue {
  const ctx = React.useContext(PreferencesContext);
  if (!ctx) throw new Error("usePreferences must be used within PreferencesProvider");
  return ctx;
}
