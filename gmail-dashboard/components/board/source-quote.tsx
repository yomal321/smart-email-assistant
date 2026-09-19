"use client";

import { ExternalLink } from "lucide-react";
import type { Message } from "@/lib/data";
import { cn } from "@/lib/utils";

/**
 * The source text a draft is answering. Emails ingested before the normaliser
 * started writing thread_entries have none, and the dashboard never stores the
 * raw body (field minimisation, NFR1) — so the fallback is the Gmail deeplink,
 * never an AI summary dressed up as the sender's words.
 */
export function SourceQuote({ message, className }: { message: Message; className?: string }) {
  const gist = message.thread[message.thread.length - 1]?.gist;

  if (gist) {
    return <div className={cn("whitespace-pre-wrap", className)}>{gist}</div>;
  }

  return (
    <div className={cn("text-ink-tertiary", className)}>
      <p>The original text isn&rsquo;t stored for this message.</p>
      <a
        href={message.gmailUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-1.5 inline-flex items-center gap-1.5 font-medium text-ink underline decoration-1 underline-offset-2 hover:text-ink-secondary"
      >
        Open in Gmail <ExternalLink size={13} />
      </a>
    </div>
  );
}
