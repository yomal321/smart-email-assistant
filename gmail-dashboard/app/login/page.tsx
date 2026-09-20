"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Clock, Eye, EyeOff, Loader2, Lock, TrainFront, WifiOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

type ErrorKind = "invalid" | "rate-limited" | "network";

interface LoginError {
  kind: ErrorKind;
  message: string;
}

const ERROR_ICON: Record<ErrorKind, React.ElementType> = {
  invalid: AlertTriangle,
  "rate-limited": Clock,
  network: WifiOff,
};

export default function LoginPage() {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [error, setError] = React.useState<LoginError | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.push("/");
        return;
      }
      const body = await res.json().catch(() => ({}));
      const message = typeof body.error === "string" ? body.error : "Something went wrong. Try again.";
      setError({ kind: res.status === 429 ? "rate-limited" : "invalid", message });
      setSubmitting(false);
      // A failed attempt shouldn't require the user to manually clear the
      // field before retrying -- refocus and select so typing just replaces it.
      requestAnimationFrame(() => inputRef.current?.select());
    } catch {
      setError({ kind: "network", message: "Couldn't reach the server. Check your connection and try again." });
      setSubmitting(false);
    }
  }

  const ErrorIcon = error ? ERROR_ICON[error.kind] : null;

  return (
    <div className="relative flex min-h-dvh flex-1 items-center justify-center overflow-y-auto px-4 py-12">
      {/* Ambient backdrop -- a quiet nod to the station-board identity, not decoration for its own sake */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-56 left-1/2 h-112 w-md -translate-x-1/2 rounded-full bg-departure/20 blur-3xl dark:bg-departure/15" />
      </div>

      <div className="relative w-full max-w-95 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
        {/* Brand mark */}
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex size-11 items-center justify-center rounded-xl bg-departure text-departure-ink shadow-card">
            <TrainFront className="size-5" aria-hidden />
          </div>
          <h1 className="text-lg font-semibold tracking-tight text-ink">The Departure Board</h1>
          <p className="mt-1 text-sm text-ink-tertiary">Sign in to your Smart Email Assistant</p>
        </div>

        <div className="card-surface p-6">
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div>
              <Label htmlFor="password" className="mb-1.5 block text-xs font-medium text-ink-secondary">
                Password
              </Label>
              <div className="relative">
                <Lock
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-tertiary"
                />
                <Input
                  ref={inputRef}
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError(null);
                  }}
                  autoComplete="current-password"
                  autoFocus
                  required
                  disabled={submitting}
                  aria-invalid={!!error}
                  aria-describedby={error ? "password-error" : undefined}
                  className="h-11 rounded-lg pr-11 pl-10"
                />
                {/* Full input-height tap column, not just the icon's own bounds -- 44px minimum touch target */}
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  disabled={submitting}
                  className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-ink-tertiary transition-colors hover:text-ink disabled:pointer-events-none disabled:opacity-50"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                </button>
              </div>
            </div>

            {error && ErrorIcon && (
              <div
                id="password-error"
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-signal/30 bg-signal-field px-3 py-2 text-sm text-signal"
              >
                <ErrorIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
                <span>{error.message}</span>
              </div>
            )}

            <Button type="submit" size="lg" className="h-11 w-full rounded-lg text-sm" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 aria-hidden className="size-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                "Sign in"
              )}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-ink-tertiary">
          Single-operator access. Lost the password? Check your deployment&apos;s{" "}
          <code className="rounded bg-surface-sunk px-1 py-0.5 font-mono text-[0.7rem]">DASHBOARD_LOGIN_SECRET</code>.
        </p>
      </div>
    </div>
  );
}
