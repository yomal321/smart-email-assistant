"use client";

// Fetches a single message by id from GET /api/messages/:id — shared by any
// view that needs to show a message alongside something foreign-keyed to it
// (a draft, an action item). Mirrors use-settings.ts's read-hook shape:
// AbortController on unmount, parse body.error on failure. `messageId` may be
// null (no id to fetch yet) so this can be called unconditionally, satisfying
// the Rules of Hooks.

import { useEffect, useState } from "react";
import type { Message } from "./types";

export interface UseMessageResult {
  message: Message | null;
  loading: boolean;
}

export function useMessage(messageId: string | null): UseMessageResult {
  const [message, setMessage] = useState<Message | null>(null);
  const [loading, setLoading] = useState(messageId !== null);

  useEffect(() => {
    if (!messageId) {
      setMessage(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/messages/${messageId}`, { signal: controller.signal });
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          // 404 means the source message is gone or the id is stale — leave message null.
          if (res.status !== 404) {
            throw new Error(
              (body && typeof body.error === "string" && body.error) || `request failed with status ${res.status}`
            );
          }
          setMessage(null);
          return;
        }
        setMessage(body as Message);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error(`[use-message] failed to load message ${messageId}`, err);
        setMessage(null);
      } finally {
        setLoading(false);
      }
    }

    load();

    return () => controller.abort();
  }, [messageId]);

  return { message, loading };
}
