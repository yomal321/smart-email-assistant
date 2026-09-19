"use client";

import * as React from "react";
import type { Contact } from "@/lib/data";

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
    console.error(`[contacts-provider] ${path} failed`, err);
  }
}

function patchItem(path: string, payload: Record<string, unknown>): void {
  void fireMutation(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

interface ContactsContextValue {
  contacts: Contact[];
  isLoading: boolean;
  setVip: (contactId: string, value: boolean) => void;
}

const ContactsContext = React.createContext<ContactsContextValue | null>(null);

export function ContactsProvider({ children }: { children: React.ReactNode }) {
  const [contacts, setContacts] = React.useState<Contact[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  // Fetch-on-mount, replacing the getContacts() fixture seed. Follows
  // action-items-provider.tsx's read-hook pattern: AbortController to
  // cancel on unmount, parse body.error on failure, no throw on error.
  React.useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        let res = await fetch("/api/contacts", { signal: controller.signal });
        if (res.status === 401) {
          // Transient race: the very first fetch right after login can land
          // before the just-set session cookie is recognized server-side.
          // One short retry clears it every time observed live; a genuinely
          // unauthorized session still fails the same way on the retry.
          await new Promise((r) => setTimeout(r, 400));
          res = await fetch("/api/contacts", { signal: controller.signal });
        }
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(
            (body && typeof body.error === "string" && body.error) || `request failed with status ${res.status}`
          );
        }
        setContacts(body as Contact[]);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("[contacts-provider] failed to load contacts", err);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    load();

    return () => controller.abort();
  }, []);

  const setVip = React.useCallback((contactId: string, value: boolean) => {
    setContacts((prev) => prev.map((c) => (c.id === contactId ? { ...c, isVip: value } : c)));
    patchItem(`/api/contacts/${contactId}/vip`, { value });
  }, []);

  return (
    <ContactsContext.Provider value={{ contacts, isLoading, setVip }}>{children}</ContactsContext.Provider>
  );
}

export function useContacts(): ContactsContextValue {
  const ctx = React.useContext(ContactsContext);
  if (!ctx) throw new Error("useContacts must be used within ContactsProvider");
  return ctx;
}
