"use client";

import * as React from "react";
import type { Commitment, Contact } from "@/lib/data";

// "Awaiting reply" isn't part of lib/data/types.ts's contract (it's a
// fixture-only interface in lib/data/fixtures/commitments.ts, not re-exported
// through the lib/data barrel) — mirrored here with the same shape so the
// API route's response type-checks without reaching into a fixture file.
export interface AwaitingReply {
  id: string;
  subject: string;
  counterpartyId: string;
  sentAt: string;
  daysElapsed: number;
}

// Fire-and-forget mutation helper: fires a mutation route in the background
// after local state has already applied the optimistic update. Mirrors
// action-items-provider.tsx's fireMutation/patchItem shape — a failed
// background call is logged, not retried or rolled back.
async function fireMutation(path: string, init: RequestInit): Promise<void> {
  try {
    const res = await fetch(path, init);
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(
        (body && typeof body.error === "string" && body.error) || `request failed with status ${res.status}`
      );
    }
  } catch (err) {
    console.error(`[commitments-provider] ${path} failed`, err);
  }
}

function patchItem(path: string, payload: Record<string, unknown>): void {
  void fireMutation(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

// Unlike fireMutation above, the Nudge dialog needs to know whether the call
// actually succeeded (to decide whether to show "Nudged" or an error), so
// this one resolves a boolean instead of being void/fire-and-forget.
async function postForSuccess(path: string, payload: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch (err) {
    console.error(`[commitments-provider] ${path} failed`, err);
    return false;
  }
}

interface CommitmentsContextValue {
  commitments: Commitment[];
  awaitingReply: AwaitingReply[];
  isLoading: boolean;
  contactById: (id: string) => Contact | undefined;
  setCommitmentStatus: (id: string, status: "met" | "missed") => void;
  // "Awaiting reply" rows have no commitment (getAwaitingReply and
  // getCommitments are deliberately separate concepts — see spec.md
  // Overview), so the Nudge dialog needs to attach a nudge to either a real
  // commitment or a bare email id. /api/nudges accepts either.
  sendNudge: (target: { commitmentId: string } | { emailId: string }, body: string) => Promise<boolean>;
}

const CommitmentsContext = React.createContext<CommitmentsContextValue | null>(null);

export function CommitmentsProvider({ children }: { children: React.ReactNode }) {
  const [commitments, setCommitments] = React.useState<Commitment[]>([]);
  const [awaitingReply, setAwaitingReply] = React.useState<AwaitingReply[]>([]);
  const [contacts, setContacts] = React.useState<Contact[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  // Fetch-on-mount, replacing the getCommitments()/getAwaitingReply()/
  // getContacts() fixture seeds. Follows action-items-provider.tsx's
  // read-hook pattern: AbortController to cancel on unmount, parse
  // body.error on failure, error logged not thrown.
  React.useEffect(() => {
    const controller = new AbortController();

    async function fetchJson<T>(path: string): Promise<T> {
      let res = await fetch(path, { signal: controller.signal });
      if (res.status === 401) {
        // Transient race: the very first fetch right after login can land
        // before the just-set session cookie is recognized server-side. One
        // short retry clears it every time observed live; a genuinely
        // unauthorized session still fails the same way on the retry.
        await new Promise((r) => setTimeout(r, 400));
        res = await fetch(path, { signal: controller.signal });
      }
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (body && typeof body.error === "string" && body.error) || `request failed with status ${res.status}`
        );
      }
      return body as T;
    }

    async function load() {
      try {
        const [commitmentsData, awaitingReplyData, contactsData] = await Promise.all([
          fetchJson<Commitment[]>("/api/commitments"),
          fetchJson<AwaitingReply[]>("/api/awaiting-reply"),
          fetchJson<Contact[]>("/api/contacts"),
        ]);
        setCommitments(commitmentsData);
        setAwaitingReply(awaitingReplyData);
        setContacts(contactsData);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("[commitments-provider] failed to load commitments data", err);
      } finally {
        setIsLoading(false);
      }
    }

    load();

    return () => controller.abort();
  }, []);

  // Unlike the fixture's contactById, which throws on a miss, this returns
  // undefined — live data can carry an empty/unresolved counterpartyId, and
  // callers (follow-ups/page.tsx) fall back to a display name instead of
  // crashing.
  const contactById = React.useCallback(
    (id: string): Contact | undefined => contacts.find((c) => c.id === id),
    [contacts]
  );

  const setCommitmentStatus = React.useCallback((id: string, status: "met" | "missed") => {
    setCommitments((prev) => prev.map((c) => (c.id === id ? { ...c, status } : c)));
    patchItem(`/api/commitments/${id}`, { status });
  }, []);

  const sendNudge = React.useCallback(
    async (target: { commitmentId: string } | { emailId: string }, body: string): Promise<boolean> => {
      return postForSuccess("/api/nudges", { ...target, body });
    },
    []
  );

  return (
    <CommitmentsContext.Provider
      value={{ commitments, awaitingReply, isLoading, contactById, setCommitmentStatus, sendNudge }}
    >
      {children}
    </CommitmentsContext.Provider>
  );
}

export function useCommitments(): CommitmentsContextValue {
  const ctx = React.useContext(CommitmentsContext);
  if (!ctx) throw new Error("useCommitments must be used within CommitmentsProvider");
  return ctx;
}
