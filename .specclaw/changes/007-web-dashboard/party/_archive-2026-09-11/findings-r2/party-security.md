### [BLOCK] party-security — Attacker-authored email content and LLM-authored summaries are rendered in the project's first browser surface with no sanitization named

**Quotes:**
> - **Unified Inbox** — server-rendered list of `emails`, showing `category` and `summary`, sorted by `received_at`.
> - Unified inbox view reading `emails` (id, subject, sender/participants, category, summary, received_at)
> - **Draft Review Modal** — calls the existing `POST /webhook/generate-draft` endpoint, displays `draft_body` next to the source thread.
> - Full-text search over `emails.subject`/`body`, which requires a new migration

**Problem:** Every field listed here originates outside the trust boundary. `subject`, `sender/participants` and `body` are authored by anyone who can send mail to the ingested mailbox — the single most hostile input surface the system has. `category`, `summary` and `draft_body` are model output derived from that same attacker-controlled text, and model-authored text is untrusted content. The proposal moves all of it, unfiltered, into the one place in the system where content becomes executable: a rendered HTML page. Nothing in the artifact states that these fields are escaped, rendered as text rather than markup, or stripped of links; "server-rendered" is named as a rendering strategy, not a safety property. A crafted subject line or an LLM summary that echoes injected markup from the body lands as live content in the operator's authenticated session — the same session that holds whatever Supabase credential the dashboard uses and the shared webhook secret. This is a store-then-render path with no check at the boundary. No seat rebutted this in round 1, and party-architect's finding that the webhook response shape is unspecified strengthens it: the modal renders a response body whose contract nobody has stated.

**Fix:** State in the proposal that all `emails`/`tasks`/`drafts` text fields are rendered as inert text only — no `dangerouslySetInnerHTML`, no markdown-to-HTML, no auto-linkification of body/summary content — and that if HTML email bodies are displayed at all they are rendered in a sandboxed iframe with a restrictive CSP (`default-src 'none'`) and remote images off by default. Add an acceptance criterion that an email whose subject and body contain markup renders as visible literal text.

**Status:** upheld

### [BLOCK] party-security — The access model is left open, and the unstated default for a Next.js + Supabase app is a browser-held key with full read+write on every table

**Quotes:**
> - An access gate appropriate for a personal, single-user, internet-reachable dashboard (see Open Questions — RLS is off project-wide, so this can't be "ship it open")
> - **Access model.** `architecture.md`'s Level 2 diagram shows the dashboard reading via a "Supabase client." With RLS off, does that mean the anon key (full read+write on every table, from the browser) or does the dashboard route all Supabase access through Next.js server components/route handlers using a service-role key that never reaches the client?
> - **Auth/access gate.** No multi-tenancy is planned, but the dashboard will be reachable at a public Vercel URL. Is a single shared password, Vercel's built-in deployment protection, or something else the right minimum here?

**Problem:** The proposal correctly identifies the exposure and then ships the decision forward as an open question, which means the implementation phase inherits a default rather than a choice. With RLS off project-wide, the conventional path — a `NEXT_PUBLIC_SUPABASE_ANON_KEY` in a client component — hands every anonymous visitor to the public Vercel URL full read and write on `emails`, `tasks` and `drafts`, including the full body text of the operator's mailbox. That is the permissive outcome, it is the path of least resistance, and it looks identical to a working dashboard from the operator's browser. The same is true of the gate: "reachable at a public Vercel URL" with the gate unresolved means the first deploy is a working, unauthenticated, internet-reachable read of the mailbox, and nothing in the design makes that state distinguishable from the intended one. An access decision that is still open at approval time resolves itself open. Party-architect reached the same line from the seam angle (WARN, module layout) and party-po from the cost angle (NOTE); neither covers the fail-open consequence, and two independent seats landing on the same unresolved line raises rather than lowers the case for closing it before planning.

**Fix:** Close both questions in the proposal before planning, in the narrowest form that works: all Supabase access confined to server components and route handlers holding a service-role key that is never exposed to the client bundle (no `NEXT_PUBLIC_` Supabase key at all), and the gate enforced in middleware that denies by default on every route including API routes — not only on page routes — so a missing or unset gate secret returns 401 rather than allowing through. Add an acceptance criterion that an unauthenticated request to the deployed URL and to every route handler returns 401/403, and one that greps the built client bundle for the service-role key and any Supabase URL+key pair.

**Status:** upheld

### [BLOCK] party-security — Task and draft status writes are specified as one-way transitions with no reverse path and no view of what was dismissed

**Quotes:**
> - Action item sidebar reading `tasks` joined to `emails`; writes `tasks.status` (`open`→`done`/`dismissed`)
> - Draft review modal: triggers `POST /webhook/generate-draft` with the shared secret, displays the returned draft, writes `drafts.status` (`pending`→`sent`/`discarded`)
> Lets the user mark a task `done` or `dismissed`

**Problem:** Both writes are stated with a single arrow in one direction. There is no `done`→`open`, no `discarded`→`pending`, and no view anywhere in the four listed pieces that shows dismissed tasks or discarded drafts. A misclick in a sidebar — the interaction with the smallest target and the least confirmation in the whole design — permanently removes an action item from the only surface that displays it, and the operator has no way to find it again except by querying Supabase directly, which is precisely the workflow this change exists to eliminate. The effect is small per item and unbounded in aggregate; there is no undo stated for any of it. Party-architect and party-visionary both flagged the transition set from their own angles (unowned validity, schema/UI drift) without naming the missing recovery path, which is the runtime-irreversibility half and remains unaddressed.

**Fix:** Specify the reverse transitions as in scope (`done`/`dismissed`→`open`, `discarded`→`pending`), or at minimum a filter that surfaces dismissed/done items so a mistaken write is visible and correctable from the UI. State that status writes never delete rows and that the previous status is recoverable. If `sent` is retained despite being a self-report, it must also be reversible, since the operator is the only signal and operators mis-click.

**Status:** upheld

### [WARN] party-security — The draft-generation trigger is an unbounded, cost-bearing outbound call behind a shared secret whose location is never stated

**Quotes:**
> - Draft review modal: triggers `POST /webhook/generate-draft` with the shared secret, displays the returned draft, writes `drafts.status` (`pending`→`sent`/`discarded`)
> Per the architecture's stated boundary: the dashboard's only outbound write to n8n is the draft-generation POST.

**Problem:** Two things are unbounded here. First, the secret: the proposal names the shared secret as something the dashboard sends but never says which half of the app holds it. If the modal fires this from the browser, the secret is in the client bundle and in every devtools network tab, and anyone who reaches the public URL can drive the draft pipeline directly, bypassing the dashboard entirely. Second, the spend: each POST costs LLM tokens, and nothing in the design bounds how many can be fired — no rate limit, no per-draft idempotency, no debounce on the button. A held-down click, a retry loop on a slow response, or an unauthenticated caller who has the leaked secret spends real money, and tokens spent are not recoverable. Party-architect independently found that the same call's transmission method ("header vs. body field"), timeout, and failure response are unspecified; an unspecified timeout on an LLM-backed call is exactly the condition that produces the retry loop this finding bounds. The narrowest grant that still works is a server-side route handler that holds the secret, accepts only an email/thread id from the client, and refuses to re-trigger for a thread that already has a pending draft.

**Fix:** State that the shared secret lives only in server-side environment config and that the browser calls a first-party route handler, never n8n directly. Add a per-thread idempotency check and a simple rate limit on that handler, and specify what the modal shows on timeout or non-2xx — an explicit error, not a silent empty modal that invites the operator to click again.

**Status:** upheld

### [WARN] party-security — Operator search text reaches Postgres full-text query parsing with no stated handling

**Quotes:**
> - **Search** — full-text search over `emails` via Postgres `tsvector`, per the original proposal's "full-text search only for v1" decision.
> - Full-text search over `emails.subject`/`body`, which requires a new migration (`0005`) adding a `tsvector` `search_vector` column + GIN index — not present in the schema today

**Problem:** The search box is free-form text crossing from the browser into a database query, and the proposal says nothing about how it gets there. Raw `to_tsquery` rejects ordinary human input — a query containing `&`, `!`, `:` or an unbalanced quote raises a syntax error rather than returning no results — so the failure here is a 500 on normal typing at best, and a string-interpolated query at worst. On an internet-reachable URL whose gate is still an open question, an unbounded search term over a GIN index is also a free way to make the database do arbitrary work. Party-po proposes cutting search from this change's scope entirely; if that cut is taken the exposure leaves with it, but the proposal as written still commits search unconditionally, so the finding stands against the artifact under review rather than against a hypothetical revision.

**Fix:** Specify parameterized queries with `websearch_to_tsquery` (which tolerates arbitrary human input rather than throwing), a length cap on the search term, and a stated result limit. State that a search that matches nothing renders an explicit empty state rather than an error.

**Status:** upheld

### [NOTE] party-security — The "no Gmail credential anywhere near it" boundary is asserted, not enforced

**Quotes:**
> The dashboard never sends mail; there is still no Gmail credential anywhere near it.
> - Any send-mail capability, direct or indirect

**Problem:** This is the right boundary and the strongest safety property in the proposal — it is also stated purely as a claim about intent. Nothing in the design names the mechanism that keeps it true: the dashboard's Vercel environment is a new deployment target that did not exist before, and "no Gmail credential near it" holds only as long as nobody adds one. A sentence in the artifact asserting that a surface is not security-sensitive is the input this seat exists to distrust; here the assertion happens to be correct, but it is load-bearing and unenforced. Party-visionary's observation that this container becomes the default reader for all pipeline data makes the unenforced boundary more load-bearing over time, not less, since future features arrive in the same deployment.

**Fix:** Record the boundary as a checkable invariant rather than prose — the Vercel project's environment variables contain no Gmail/OAuth credential, and the dashboard calls exactly one n8n endpoint (`/webhook/generate-draft`) and no other. That turns a promise into something a later change can be caught violating.

**Status:** upheld

### [NOTE] party-security — Rebuttal to party-po: naming a platform gate as the default on build-cost grounds settles the cheaper option without settling whether the gate covers route handlers or fails closed

**Quotes:**
> **Auth/access gate.** No multi-tenancy is planned, but the dashboard will be reachable at a public Vercel URL. Is a single shared password, Vercel's built-in deployment protection, or something else the right minimum here?

**Problem:** Party-po's NOTE on this same line recommends the platform gate as the default because it is "a platform toggle with near-zero build cost" against "new code ... the team must write and maintain." I do not dispute the cost ranking and I am not asking for the more expensive option. The objection is that build cost is not the axis that decides whether this gate is safe: the properties that matter here are whether the gate covers every route the dashboard exposes — including the route handler that holds the webhook secret and the status-write endpoints — and what happens when the gate's configuration is absent or misapplied. A gate chosen on cost alone, adopted without either property stated, can ship as an unprotected surface that looks protected, which is the fail-open outcome my second finding describes. Party-po's finding is theirs to keep or withdraw; this rebuts only the implication that the cost comparison closes the question.

**Fix:** Whichever gate is chosen, state in the proposal that it denies by default and applies to all routes including API/route handlers, and add the acceptance criterion that an unauthenticated request to each route handler returns 401/403. That requirement is neutral between party-po's cheap option and the expensive one.

**Status:** upheld
