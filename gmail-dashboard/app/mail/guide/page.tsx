"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckSquare,
  Clock,
  Eye,
  FileEdit,
  Inbox as InboxIcon,
  LayoutDashboard,
  ShieldCheck,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const SECTIONS = [
  { id: "what-it-does", label: "What it does" },
  { id: "guarantees", label: "What it will never do" },
  { id: "how-it-works", label: "How it works" },
  { id: "where-things-live", label: "Where things live" },
  { id: "good-to-know", label: "Good to know" },
];

const OUTCOMES = [
  {
    title: "Triage",
    body: "Every email that arrives gets a category and a one-line summary, so the inbox becomes something you scan instead of something you read.",
  },
  {
    title: "Commitments",
    body: "Promises buried in long threads — “I'll send that Friday” — are pulled out into a task list, each one linked back to the email it came from.",
  },
  {
    title: "Drafts",
    body: "Reply drafts written in your own style, grounded in the thread. They wait for you. Approving one is your decision, every time.",
  },
];

const STEPS = [
  {
    title: "Mail arrives",
    body: "New Gmail messages are pushed in within moments and normalised into one internal shape. Nothing to import, nothing to poll. Outlook can slot into the same shape later without changing anything downstream.",
  },
  {
    title: "The assistant reads it",
    body: "Triage, commitment extraction, and drafting all go through a single AI gateway. That means the model behind all three can be swapped in one place — the behaviour you see here does not depend on any one vendor.",
  },
  {
    title: "You decide",
    body: "Results land on this dashboard for review. Mark a task done, accept or throw away a draft, correct anything the assistant got wrong. The last call is always yours.",
  },
];

const GUARANTEES = [
  {
    icon: ShieldCheck,
    title: "It cannot send mail",
    body: "There is no send credential anywhere in this system — not in the dashboard, not near draft generation. Every draft stops at “pending” and you send it yourself from your real mail client. This is a structural fact, not a setting someone could switch on.",
  },
  {
    icon: Eye,
    title: "Nothing asks to be trusted blindly",
    body: "Every extracted task sits beside the email it came from; every draft sits beside the thread it answers. If the AI got something wrong, you see it wrong next to the source — you never have to take its word for anything.",
  },
];

const DESTINATIONS = [
  {
    href: "/",
    label: "Overview",
    icon: LayoutDashboard,
    body: "The day at a glance — what came in, what is still waiting on you, what you cleared.",
  },
  {
    href: "/inbox",
    label: "Inbox",
    icon: InboxIcon,
    body: "Every message with its category and one-line summary. Filter by category or sort to find what matters first.",
  },
  {
    href: "/actions",
    label: "Action items",
    icon: CheckSquare,
    body: "Commitments the assistant found, with their source email. Mark them done, dismiss them, or reopen them.",
  },
  {
    href: "/drafts",
    label: "Drafts",
    icon: FileEdit,
    body: "Generated replies waiting for review. Read, edit, copy into your mail client — or discard.",
  },
  {
    href: "/follow-ups",
    label: "Follow-ups",
    icon: Clock,
    body: "Threads where you are waiting on someone else, so nothing quietly goes cold.",
  },
  {
    href: "/contacts",
    label: "Contacts",
    icon: Users,
    body: "Who you actually correspond with, how often, and what is currently open with each of them.",
  },
  {
    href: "/analytics",
    label: "Analytics",
    icon: BarChart3,
    body: "Volume and category trends over time — the honest answer to “is the inbox getting lighter?”",
  },
  {
    href: "/review",
    label: "Review queue",
    icon: AlertTriangle,
    body: "Anything the assistant was not confident about, held back for your judgement instead of guessed at.",
  },
  {
    href: "/rules",
    label: "Rules & automation",
    icon: SlidersHorizontal,
    body: "Your own if-this-then-that rules, layered on top of the AI triage for the cases you want handled your way.",
  },
];

const LIMITS = [
  "Built for one mailbox owner. There is no team mode, no shared inbox, no second user.",
  "Gmail today. Outlook is designed for and schema-ready, but not switched on yet.",
  "Search matches the words you type; it is not semantic search, so synonyms will not match.",
  "No calendar integration, and no learned per-sender priority — both are deliberately out of scope for now.",
  "The assistant's phrasing can change over time as the model behind the gateway is swapped. The guarantees above do not change with it.",
];

export default function GuidePage() {
  return (
    <div className="flex-1 overflow-y-auto scroll-smooth">
      <div className="rule-b px-4 py-3">
        <h1 className="text-lg font-semibold text-ink">Guide</h1>
        <p className="text-xs text-ink-tertiary">What this platform is, what it does, and what it will never do.</p>
      </div>

      <nav
        aria-label="Guide sections"
        className="rule-b sticky top-0 z-10 flex gap-1 overflow-x-auto scrollbar-none bg-surface/95 px-4 py-2 backdrop-blur"
      >
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="shrink-0 rounded-lg px-2.5 py-1 font-narrow text-[11px] font-bold uppercase tracking-wide text-ink-tertiary transition-colors hover:bg-surface-raised hover:text-ink"
          >
            {s.label}
          </a>
        ))}
      </nav>

      <div className="mx-auto max-w-4xl space-y-12 px-4 py-6 pb-20">
        <section>
          <p className="font-narrow text-[11px] font-bold uppercase tracking-widest text-departure">
            Smart Email Assistant
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">
            Your inbox, already read by the time you open it.
          </h2>
          <p className="measure mt-3 text-sm leading-relaxed text-ink-secondary">
            This is an assistant for one person managing their own mail. It watches your inbox, sorts and summarises
            everything that arrives, pulls out the commitments you made in threads, and writes reply drafts on request.
            It runs alongside your real mail client — it does not replace it, and it never sends anything on your behalf.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button asChild size="lg">
              <Link href="/inbox">
                Open the inbox
                <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link href="/">See today&rsquo;s overview</Link>
            </Button>
          </div>
        </section>

        <GuideSection id="what-it-does" title="What it does" eyebrow="Three outputs">
          <div className="grid gap-3 sm:grid-cols-3">
            {OUTCOMES.map((o) => (
              <div key={o.title} className="card-surface p-4">
                <h3 className="font-narrow text-[11px] font-bold uppercase tracking-wider text-departure">{o.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-ink-secondary">{o.body}</p>
              </div>
            ))}
          </div>
        </GuideSection>

        <GuideSection id="guarantees" title="What it will never do" eyebrow="The two guarantees">
          <p className="measure mb-4 text-sm leading-relaxed text-ink-secondary">
            An assistant that reads your mail is only worth using if the limits on it are real. These two are built into
            the architecture, not into a preferences page.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {GUARANTEES.map((g) => (
              <div
                key={g.title}
                className="rounded-xl border p-4"
                style={{ borderColor: "var(--departure)", background: "var(--departure-field)" }}
              >
                <div className="flex items-center gap-2">
                  <g.icon size={17} className="shrink-0 text-departure" />
                  <h3 className="text-sm font-semibold" style={{ color: "var(--departure-field-ink)" }}>
                    {g.title}
                  </h3>
                </div>
                <p className="mt-2 text-[13px] leading-relaxed text-ink-secondary">{g.body}</p>
              </div>
            ))}
          </div>
        </GuideSection>

        <GuideSection id="how-it-works" title="How it works" eyebrow="Mail in, decisions out">
          <ol className="space-y-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="card-surface flex gap-3 p-4">
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-narrow text-[11px] font-bold tabular"
                  style={{ background: `var(--platform-${i + 1})`, color: `var(--platform-${i + 1}-ink)` }}
                >
                  {i + 1}
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-ink">{s.title}</h3>
                  <p className="measure mt-1 text-[13px] leading-relaxed text-ink-secondary">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </GuideSection>

        <GuideSection id="where-things-live" title="Where things live" eyebrow="Every page in the rail">
          <div className="grid gap-2 sm:grid-cols-2">
            {DESTINATIONS.map((d) => (
              <Link
                key={d.href}
                href={d.href}
                className="group card-surface flex gap-3 p-3.5 transition-colors hover:border-[color:var(--departure)]"
              >
                <d.icon size={17} className="mt-0.5 shrink-0 text-ink-tertiary group-hover:text-departure" />
                <div>
                  <h3 className="text-sm font-semibold text-ink">{d.label}</h3>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink-secondary">{d.body}</p>
                </div>
              </Link>
            ))}
          </div>
        </GuideSection>

        <GuideSection id="good-to-know" title="Good to know" eyebrow="Current limits">
          <ul className="space-y-2">
            {LIMITS.map((l) => (
              <li key={l} className="flex gap-2.5 text-[13px] leading-relaxed text-ink-secondary">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ink-disabled" aria-hidden />
                <span className="measure">{l}</span>
              </li>
            ))}
          </ul>
          <p className="measure mt-5 text-[13px] leading-relaxed text-ink-tertiary">
            Everything the assistant does automatically is written down in the activity log on the{" "}
            <Link href="/settings" className="text-departure underline">
              Settings
            </Link>{" "}
            page — what it did, to what, and why.
          </p>
        </GuideSection>
      </div>
    </div>
  );
}

function GuideSection({
  id,
  title,
  eyebrow,
  children,
}: {
  id: string;
  title: string;
  eyebrow: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-14">
      <div className="mb-4">
        <p className="font-narrow text-[10.5px] font-bold uppercase tracking-widest text-ink-disabled">{eyebrow}</p>
        <h2 className="mt-1 text-lg font-semibold tracking-tight text-ink">{title}</h2>
      </div>
      {children}
    </section>
  );
}
