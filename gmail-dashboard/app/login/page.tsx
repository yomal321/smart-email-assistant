"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
      setError(typeof body.error === "string" ? body.error : "invalid password");
      setSubmitting(false);
    } catch {
      setError("something went wrong, try again");
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center overflow-y-auto px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <h1 className="text-lg font-semibold text-ink">Sign in</h1>
        <div>
          <Label htmlFor="password" className="mb-1.5 block text-xs text-ink-secondary">
            Password
          </Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-lg"
            autoFocus
          />
        </div>
        {error && <p className="text-sm text-signal">{error}</p>}
        <Button type="submit" className="w-full rounded-lg" disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
