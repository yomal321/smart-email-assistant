# Capabilities & User Outcomes

What this system can actually do today, and what each capability means for the person using it — the single mailbox owner. Grouped by how solid the ground under each capability is: **live and verified**, **built but not yet verified**, and **not built yet**.

---

## Live & verified (Phases 1–4)

These run against a real deployment today. Every acceptance criterion has been exercised against live Gmail, not just code-reviewed. Evidence: `.specclaw/changes/*/verify-report.md`.

### 1. Gmail ingestion
**What it does.** Watches the mailbox via Gmail push notifications (Pub/Sub), fetches each new message in full, and normalizes it into one internal schema shared with a future Outlook path.

**Outcome for the user.** New mail shows up in the system within moments of arriving — nothing to poll, nothing to import manually. The user never has to think about *how* mail gets in.

### 2. Triage
**What it does.** Every incoming email gets a category (`needs_reply`, `fyi`, `waiting_on_someone_else`, `promotional`, `low_priority`) and a one-line summary.

**Outcome for the user.** The inbox becomes scannable instead of readable — a glance at category + summary tells the user whether an email needs action, without opening it. This is the mechanism behind the "triage in under two minutes" goal.

### 3. Action extraction
**What it does.** Reads each thread for commitments and pulls them into a `tasks` row, foreign-keyed to the exact email it came from.

**Outcome for the user.** Commitments buried in long threads surface as a checkable task list, not something the user has to remember to reread for. Because every task links back to its source email, a wrong extraction is obvious at a glance rather than silently trusted — the user never has to take the AI's word for it.

### 4. On-demand draft generation
**What it does.** An authenticated HTTP endpoint (`POST /webhook/generate-draft`) generates a reply grounded in the thread and, where available, the user's own past sent mail for style. The draft is stored as `pending` — nothing is ever sent automatically.

**Outcome for the user.** Routine replies can start from a drafted paragraph instead of a blank compose window, while the human still makes every send decision. The "no auto-send" guarantee is structural — there is no Gmail-send credential anywhere near this code path, so it can't happen even by misconfiguration.

---

## Built, pending verification (Phase 5 — Web Dashboard)

The dashboard's information architecture is fully built (15/15 tasks) as a **UI/UX prototype running on fixture data** — no live Supabase or n8n connection yet. It exists to validate the design before real data is wired in. Source: `dashboard/README.md`.

### 5. Unified inbox view
**What it does.** A single scrollable list showing category badges and one-line summaries per email, with sort and category filtering.

**Outcome for the user (once wired to real data).** Replaces "querying Supabase directly" as the only way to see triage output — the whole point of the dashboard existing. Today, in the prototype, it shows what that experience will feel like.

### 6. Analytics overview
**What it does.** KPI cards, a volume-over-time chart, and a category-breakdown chart, each with an accessible data-table toggle, computed from the fixture data.

**Outcome for the user.** A future answer to "is this actually helping?" — email volume and category mix at a glance, rather than a mental estimate.

### 7. Action item sidebar
**What it does.** Tasks displayed next to their source email, with mark done / dismissed / reopen controls.

**Outcome for the user.** Closes the loop between "the system found a commitment" and "the user disposed of it," without leaving the inbox view.

### 8. Draft review modal
**What it does.** Requests a draft and shows it beside the source thread; mark sent / discarded / reopen. In the prototype, generation is simulated with a delay and an occasional induced failure so the error state is exercised.

**Outcome for the user.** The draft always sits next to the email it's replying to, so trusting or rejecting it is a one-glance decision, not an act of faith in the model.

### 9. Search
**What it does.** Currently a client-side substring match over subject/body in the prototype; the real version will use Postgres `tsvector` full-text search (schema not yet migrated).

**Outcome for the user.** Finding a specific email without scrolling — though full-text ranking isn't live yet.

### 10. Settings — theme & density
**What it does.** Light/dark/system theme and layout density, persisted to the browser's `localStorage`.

**Outcome for the user.** A dashboard that matches personal preference and stays comfortable during daily, repeated use — this is meant to be opened many times a day, not once.

### 11. Command palette (⌘K / Ctrl+K)
**What it does.** Keyboard-driven navigation between Overview, Inbox, and Settings.

**Outcome for the user.** Faster navigation for a power-user workflow used repeatedly across a normal day.

---

## Trust & safety guarantees (apply across the whole system)

Not a feature the user "uses" directly, but the property that makes everything above safe to rely on.

| Guarantee | What it prevents |
|---|---|
| No Gmail-send credential anywhere in the system | Nothing — human or bug — can make this system send mail on the user's behalf |
| Every task and draft is foreign-keyed to its source email | A hallucinated task or reply is caught by looking at it beside the source, not by trusting the model |
| Draft endpoint: constant-time secret check, brute-force cooldown, 5-regenerations/hour cap | Credential guessing and runaway draft generation are both bounded |
| Prompt-injection delimiters around untrusted email content | An email trying to hijack the drafting model's instructions is contained — verified against a real injected payload |

---

## Not built yet (roadmap / ideas only)

Nothing in this section exists as working code. Listed so it's clear what the user should *not* expect yet.

- **Outlook ingestion** — proposed and reviewed, but parked with unresolved blocking findings.
- **Deadline view, Daily brief, Follow-up reminders, Weekly recap** — four candidate post-Phase-5 features in `feature-ideas.md`; none proposed or approved yet. Follow-up reminders and the weekly recap's "replied to N" both need the system to see the user's own sent mail, which it doesn't ingest today.
- **Fallback model router** (retry on a paid model when the free tier rate-limits) — designed, not built.
- **Explicitly out of scope for v1:** multi-user support, calendar integration, semantic/vector search, learned per-sender priority.

---

## The one open question that matters most

The Phase 5 prototype deliberately does **not** address: which Supabase access model (anon key vs. service-role key) the real dashboard uses, and what gates access to it, given the project has row-level security off by design. Until that's decided, the dashboard cannot move from fixture data to the live database. See `.specclaw/changes/007-web-dashboard/proposal.md`.
