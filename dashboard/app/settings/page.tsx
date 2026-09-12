"use client";

import type { ReactNode, SVGProps } from "react";
import { useAppState, type Density, type Theme } from "@/components/AppStateProvider";

function ThemeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden {...props}>
      <path
        d="M10 3v1.5M10 15.5V17M17 10h-1.5M4.5 10H3M14.6 5.4l-1.1 1.1M6.5 13.5l-1.1 1.1M14.6 14.6l-1.1-1.1M6.5 6.5 5.4 5.4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="10" cy="10" r="3.25" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function DensityIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden {...props}>
      <path
        d="M3.5 5.5h13M3.5 10h13M3.5 14.5h13"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

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
  // Applying the theme to <html> (AC5) is centralized in AppStateProvider
  // so it takes effect on every route, not just while Settings is mounted.
  const { theme, setTheme, density, setDensity } = useAppState();

  return (
    <div className="mx-auto w-full max-w-2xl p-6">
      <h1 className="text-lg font-semibold text-foreground">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Prototype preferences, stored locally in this browser only.
      </p>

      <section className="mt-8 rounded-lg border border-border bg-card p-5">
        <div className="flex items-center gap-2">
          <ThemeIcon className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Theme</h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Choose how Smart Email Assistant looks.</p>
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
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

      <section className="mt-5 rounded-lg border border-border bg-card p-5">
        <div className="flex items-center gap-2">
          <DensityIcon className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Density</h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Adjust spacing across the app.</p>
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
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
