"use client";

import { useEffect, type ReactNode } from "react";
import { useAppState, type Density, type Theme } from "@/components/AppStateProvider";

const THEME_OPTIONS: { value: Theme; label: string; description: string }[] = [
  { value: "light", label: "Light", description: "Always use the light palette" },
  { value: "dark", label: "Dark", description: "Always use the dark palette" },
  { value: "system", label: "System", description: "Match your OS setting" },
];

const DENSITY_OPTIONS: { value: Density; label: string; description: string }[] = [
  { value: "comfortable", label: "Comfortable", description: "More breathing room between rows and cards" },
  { value: "compact", label: "Compact", description: "Tighter spacing, more on screen at once" },
];

export default function SettingsPage() {
  const { theme, setTheme, density, setDensity } = useAppState();

  // Apply the theme choice to <html> immediately (AC5) — no reload required.
  // An explicit "light"/"dark" class always wins; "system" removes both so
  // globals.css's `prefers-color-scheme` fallback takes over.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.classList.toggle("light", theme === "light");
  }, [theme]);

  return (
    <div className="mx-auto w-full max-w-2xl p-6">
      <h1 className="text-lg font-semibold text-foreground">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Prototype preferences, stored locally in this browser only.
      </p>

      <section className="mt-6 rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground">Theme</h2>
        <p className="mt-1 text-xs text-muted-foreground">Choose how Smart Email Assistant looks.</p>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {THEME_OPTIONS.map((option) => (
            <OptionCard
              key={option.value}
              name="theme"
              checked={theme === option.value}
              onSelect={() => setTheme(option.value)}
              label={option.label}
              description={option.description}
            />
          ))}
        </div>
      </section>

      <section className="mt-4 rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground">Density</h2>
        <p className="mt-1 text-xs text-muted-foreground">Adjust spacing across the app.</p>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {DENSITY_OPTIONS.map((option) => (
            <OptionCard
              key={option.value}
              name="density"
              checked={density === option.value}
              onSelect={() => setDensity(option.value)}
              label={option.label}
              description={option.description}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function OptionCard({
  name,
  checked,
  onSelect,
  label,
  description,
}: {
  name: string;
  checked: boolean;
  onSelect: () => void;
  label: string;
  description: string;
}): ReactNode {
  return (
    <label
      className={`flex cursor-pointer flex-col gap-0.5 rounded-md border px-3 py-2 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ${
        checked
          ? "border-primary bg-primary/10"
          : "border-border hover:bg-muted"
      }`}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onSelect}
        className="sr-only"
      />
      <span className="text-sm font-medium text-foreground">{label}</span>
      <span className="text-xs text-muted-foreground">{description}</span>
    </label>
  );
}
