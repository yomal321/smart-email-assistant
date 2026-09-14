# Party Report: 007-web-dashboard

**Reviewed:** 2026-09-11
**Tier:** deep (classifier) — An unresolved architectural decision on access model (anon key from browser vs. service-role key through server) would change the file layout and security boundary, a public-facing container now accesses an RLS-off database (first such client, new trust boundary), and a tsvector column is added to the persisted emails table.
**Panel:** party-po(sonnet), party-architect(opus), party-ba(sonnet), party-security(opus), party-visionary(fable)
**Verdict:** CHANGES_REQUESTED

## Summary

24 findings: 5 BLOCK, 13 WARN, 6 NOTE upheld — 0 withdrawn

## Findings

### [BLOCK] party-architect — "Displays the returned draft" assumes a response shape from an existing n8n webhook the proposal never specifies, and the co-change to that workflow is not in the impact list
**Quotes:** > **Draft Review Modal** — calls the existing `POST /webhook/generate-draft` endpoint, displays `draft_body` next to the source thread.
**Quotes:** > Draft review modal: triggers `POST /webhook/generate-draft` with the shared secret, displays the returned draft, writes `drafts.status` (`pending`→`sent`/`discarded`)
**Quotes:** > **Files affected:** ~20–30 (estimated) — new Next.js app under a new top-level directory, plus one new migration
**Problem:** The artifact names the endpoint as *existing*, which means its request and response contract was fixed by change 006 for a curl/webhook caller, not for a UI. Nothing in the proposal states that it returns `draft_body` synchronously in the HTTP response body rather than acknowledging and writing the row asynchronously — yet the whole modal is designed around "displays the returned draft." These are two different dashboard designs: one renders the POST response, the other must poll or subscribe to `drafts` for the row to appear. If the endpoint does not already return the body, the n8n workflow must change in the same commit, and the impact list ("plus one new migration") names no n8n change at all. Also unspecified on a contract two components now share: how "the shared secret" is transmitted (header vs. body field), the success status code, the response on generation failure, and the timeout an LLM-backed call needs. Round 2: `party-security`'s WARN on the same line independently found the secret's location unstated, which is the same unspecified request contract reached from the trust-boundary side; nothing filed by any seat addresses the response shape or the 006 co-change.
**Fix:** State in the artifact what `POST /webhook/generate-draft` returns today (verbatim response shape and status codes) and how the secret is passed; if it does not return `draft_body`, list the 006 workflow as a co-change in Impact, or specify the poll/subscribe path on `drafts` instead.
**Status:** upheld

### [BLOCK] party-architect — The search migration adds a `tsvector` column with no named writer, no backfill, and no co-change to the ingestion path that writes `emails`
**Quotes:** > Full-text search over `emails.subject`/`body`, which requires a new migration (`0005`) adding a `tsvector` `search_vector` column + GIN index — not present in the schema today
**Quotes:** > **Files affected:** ~20–30 (estimated) — new Next.js app under a new top-level directory, plus one new migration
**Quotes:** > Phases 1–4 (ingestion, triage, action extraction, draft generation) are live and verified
**Problem:** A `search_vector` column is a derived fact about every row of `emails`, and the proposal names no mechanism that populates it. Three structurally different answers exist — a generated/stored column, a trigger on `emails`, or the ingestion workflow writing it on insert — and they have different blast radii: the third is a co-change to the live ingestion container, which the impact list does not name. Nor does the artifact mention backfilling the rows already in `emails` from four live phases; ship the migration without it and search silently returns nothing for all existing mail while the acceptance path looks green on new mail. Adjacently under-specified on the same contract: the inbox displays `category`/`summary` but search is scoped to `subject`/`body`, with no statement of text-search configuration or whether `summary` is indexed. Round 2: `party-po` proposes cutting search from this change's scope, which would move this defect rather than resolve it — the population mechanism and backfill are still unnamed wherever `0005` lands, so the finding is not withdrawn on that basis.
**Fix:** Name the population mechanism in the proposal (generated column / trigger / ingestion write), state the backfill step explicitly, and if ingestion writes it, list the ingestion workflow as a co-change in Impact.
**Status:** upheld

### [WARN] party-architect — The layer that owns Supabase access is left open, and it is the decision that shapes every data-access file in the change
**Quotes:** > **Access model.** `architecture.md`'s Level 2 diagram shows the dashboard reading via a "Supabase client." With RLS off, does that mean the anon key (full read+write on every table, from the browser) or does the dashboard route all Supabase access through Next.js server components/route handlers using a service-role key that never reaches the client?
**Quotes:** > **Unified Inbox** — server-rendered list of `emails`, showing `category` and `summary`, sorted by `received_at`.
**Problem:** This is a seam question, not a detail: browser-client-direct and server-component-only produce different module layouts, different test seams, and a different answer for every one of the four pieces. The artifact has already half-answered it — the inbox is described as "server-rendered" — while leaving the general rule open, so two implementers would build two different data layers from the same approved document, and a later switch touches every read and write in the app. The artifact also states the chosen seam contradicts a diagram it cites ("Level 2 diagram shows the dashboard reading via a 'Supabase client'"); if the server-side answer is taken, `architecture.md` is a co-change in the same commit and is not listed in Impact. Round 2: `party-security` filed a BLOCK on the same open question from the exposure side and proposes the server-only answer; that convergence strengthens rather than resolves the point here, because the co-change to `architecture.md`'s Level 2 diagram is exactly what their fix triggers and it is still absent from Files affected.
**Fix:** Resolve the access seam in the proposal before planning and state it once as a rule covering all reads and all status writes; if it diverges from the Level 2 diagram, add `architecture.md` to Files affected.
**Status:** upheld

### [WARN] party-architect — Two write paths into `tasks` and `drafts` with no component named as owner of status-transition validity
**Quotes:** > Per the architecture's stated boundary: the dashboard's only outbound write to n8n is the draft-generation POST. Everything else is either a read from Supabase or a narrow status-column write (`tasks.status`, `drafts.status`) directly against tables this container already owns display of.
**Quotes:** > the project's "RLS intentionally off" decision (`README.md`) was made when the only client was n8n holding a direct Postgres credential server-side.
**Problem:** The artifact states that until now n8n was "the only client" writing these tables, and then adds a second direct writer of the same rows. The transitions themselves (`open`→`done`/`dismissed`, `pending`→`sent`/`discarded`) are stated as arrows but no layer is named as enforcing them: not the schema (the values are described as merely "reserved"), not a shared helper, not the callee. Two writers plus no owner of the transition rule means the first time a transition gains a precondition — say `sent` requires a non-null `draft_body` — it gets implemented in one writer and not the other. Open Question 5 makes this concrete: whether `sent` exists at all is still open, and that changes the write contract the dashboard ships. Round 2: `party-security`'s BLOCK asks for reverse transitions (`done`→`open`, `discarded`→`pending`) and `party-visionary` forecasts a third value (`snoozed`/`edited`); both expand the value set this change writes, and neither names an owner for it either — which is the defect, not the specific values.
**Fix:** Name the layer that owns transition validity — a CHECK/enum constraint in migration `0005`, or a single route handler both the modal and sidebar call — and settle whether `sent` is in the value set before implementation, since it is a schema-visible contract, not a UI choice.
**Status:** upheld

### [WARN] party-architect — No test seam is named for any of the four pieces, and three of them depend on a live service
**Quotes:** > Build the Web Dashboard container from `architect/03b` and `architecture.md`'s Level 2/3b diagrams: a Next.js (App Router, TypeScript) app deployed to Vercel with four pieces —
**Quotes:** > Draft review modal: triggers `POST /webhook/generate-draft` with the shared secret, displays the returned draft, writes `drafts.status` (`pending`→`sent`/`discarded`)
**Quotes:** > **Complexity:** large (new deployable container, first client-facing surface, first client-side/server-side Supabase read path, new write paths into two existing tables)
**Problem:** The proposal describes the first client-facing container in the project and says nothing about how any of it is tested. As written, the inbox, sidebar and search need a live Supabase with representative rows, and the draft modal needs a live n8n webhook backed by an LLM — a non-deterministic, network-dependent, wall-clock-bounded dependency. With no stub boundary named (no fake Supabase client, no injectable webhook base URL, no fixture dataset), the tests for the modal in particular are the kind that get written once and then skipped, and the search tests silently depend on whatever the backfill left behind. Round 2: several seats now propose acceptance criteria that require exactly these seams — a markup-bearing email rendering as literal text, an unauthenticated request returning 401, a search term that matches nothing rendering an empty state — and none of them is executable without a fixture dataset and an injectable data-access module.
**Fix:** Name the two stub seams in the proposal — the Supabase data-access module and the draft-webhook client — as injectable interfaces, and state the fixture dataset the inbox/sidebar/search tests run against so the suite is deterministic without network.
**Status:** upheld

### [NOTE] party-architect — Rebuttal to party-po: `0005` is only independently shippable if the search-vector writer is in the schema, and the proposal does not say it is
**Quotes:** > **Search migration ownership.** `0005_search_schema.sql` (tsvector column + index) doesn't exist yet — is it built as part of this change, or as a small prerequisite change that ships and verifies independently first?
**Quotes:** > Full-text search over `emails.subject`/`body`, which requires a new migration (`0005`) adding a `tsvector` `search_vector` column + GIN index — not present in the schema today
**Problem:** `party-po`'s fix treats "`0005` lands as its own small, independently verifiable change" as available on the face of the artifact. Structurally it is available only under one of the three population mechanisms — a generated column or an in-database trigger, both of which live entirely inside the migration. If the column is instead populated by the ingestion workflow writing it on insert, then `0005` and the ingestion container are a single coupled change and cannot verify separately, and the backfill of existing rows is a third element in the same commit. The proposal states neither mechanism, so the separability premise is unresolved rather than false. I take no position on the ordering itself; the coupling fact is that the migration, its writer, and the backfill must land together whichever change they land in.
**Fix:** Resolving the population mechanism named in my second finding also settles whether `0005` is separable; until then, neither ordering can be costed.
**Status:** upheld

### [WARN] party-ba — Success criteria driving the entire scope are quoted with no source
**Quotes:** > The project's own success criteria — "inbox triaged in under two minutes," "used daily by choice," "at least half of routine replies start from a generated draft" — are all criteria about a human using a UI, and no UI exists yet.
**Problem:** These three quoted metrics are the entire justification for why a four-feature dashboard (inbox, sidebar, draft modal, search) is the right scope rather than something narrower. The proposal never cites where they come from — no reference to a v1 proposal file, a spec section, or a prior decision record. Without a citation, a reader cannot check whether these are the actual success criteria, a paraphrase, or criteria invented to justify the build that's already being planned around `architect/03b`.
**Fix:** Cite the document/section these three criteria are quoted from.
**Status:** upheld

### [WARN] party-ba — No acceptance criteria exist for the claim the proposal is built on
**Quotes:** > This is also the last unbuilt piece of the original v1 scope. Everything upstream of it has already been built to feed it: `emails.category`/`summary`, `tasks`, and `drafts` all exist as tables today with no reader.
**Problem:** The proposal's stated problem is framed entirely around three success criteria (two-minute triage, daily use by choice, half of replies starting from a draft), but the document contains no Acceptance Criteria section anywhere, and none of the four Scope bullets is tied to a testable pass/fail condition against those criteria. "Ships four working UI pieces" is not the same claim as "meets the success criteria that justified building it," and only the latter is what the Problem section promises. At ship time there is nothing in this document that could fail to verify whether the real problem was solved.
**Fix:** Add acceptance criteria that map each Scope item back to the specific success criterion it's meant to move, or drop the success-criteria framing from the Problem section if it isn't actually being tested.
**Status:** upheld

### [WARN] party-ba — "No UI exists" is treated as identical to "success criteria unmet," but shipping a working UI doesn't guarantee either outcome criterion
**Quotes:** > there is no way to use any of it except by querying Supabase directly or hitting the draft webhook with curl. The project's own success criteria — "inbox triaged in under two minutes," "used daily by choice," "at least half of routine replies start from a generated draft" — are all criteria about a human using a UI, and no UI exists yet.
**Problem:** "No UI exists" is a build-gap fact and is true by the proposal's own account (tables have "no reader"). But two of the three cited criteria — "used daily by choice" and "at least half of routine replies start from a generated draft" — are adoption/trust outcomes, not UI-existence facts. If this dashboard ships and every feature in Scope works exactly as specified, the operator could still not trust the triage categories, still not open the dashboard daily, and still draft replies from scratch — and those success criteria would remain unmet even though the stated problem ("no UI exists") is fully solved. The proposal never distinguishes "we lack the surface to use the system" from "we lack evidence the system will get used," and only tests the former by building it.
**Fix:** Either narrow the Problem section to the build-gap claim it can actually support ("no UI exists to read tables that already have data"), or add a mechanism/criterion in Scope that speaks to the adoption criteria rather than assuming the UI's existence satisfies them.
**Status:** upheld

### [NOTE] party-ba — "Sent" is asserted as a schema-reserved value used to close the loop, but the proposal's own Open Questions section shows it may not mean what the Draft Review Modal bullet implies
**Quotes:** > Lets the user mark a draft `discarded`, or `sent` after they've manually copied it into Gmail themselves — again, values the schema already reserves for this phase (`0004_draft_generation_schema.sql`).
**Problem:** The Scope/Solution section states `drafts.status` will move `pending`→`sent`/`discarded` as settled fact, but the Open Questions section separately flags that "sent" is an unverifiable self-report and asks whether it "should be dropped ... until there's a real signal." Two sections of the same document treat the same status value with different confidence — one as a shipped feature, one as an unresolved design question — and which reading wins changes what `drafts.status` actually records.
**Fix:** Resolve the Open Question before Scope asserts `sent` as a committed value, or mark the Scope bullet itself as conditional on that open question.
**Status:** upheld

### [WARN] party-po — Full-text search is unconditioned scope with no value tied to any stated success criterion, and the proposal's own open question shows a cheaper cut exists
**Quotes:** > Full-text search over `emails.subject`/`body`, which requires a new migration (`0005`) adding a `tsvector` `search_vector` column + GIN index — not present in the schema today
> **Search migration ownership.** `0005_search_schema.sql` (tsvector column + index) doesn't exist yet — is it built as part of this change, or as a small prerequisite change that ships and verifies independently first?
**Problem:** The problem statement grounds the whole proposal in three success criteria — "inbox triaged in under two minutes," "used daily by choice," "at least half of routine replies start from a generated draft" — and search returns value against none of them; its only justification is "per the original proposal's ... decision," i.e. precedent, not a value claim for this change. Despite that, Scope commits it unconditionally alongside a brand-new migration and index, the single largest net-new schema cost in the change. The proposal itself surfaces the cheaper variant (ship `0005` as an independent prerequisite) as an open question but does not take it, so the committed scope is larger than the value case in this document supports. Round 1's architect finding (no named writer, no backfill, possible ingestion co-change) only raises this scope's true cost further, reinforcing rather than undermining the cut.
**Fix:** Cut full-text search from this change's committed scope; ship the inbox/sidebar/draft-modal triad first (which does map to the stated criteria), and let `0005` land as its own small, independently verifiable change.
**Status:** upheld

### [NOTE] party-po — Access-gate cost spread across options of very different price is left fully open with no recommended default
**Quotes:** > **Auth/access gate.** No multi-tenancy is planned, but the dashboard will be reachable at a public Vercel URL. Is a single shared password, Vercel's built-in deployment protection, or something else the right minimum here?
**Problem:** These three options are not cost-equivalent: Vercel's built-in deployment protection is a platform toggle with near-zero build cost, while a custom shared-password gate is new code (middleware, secret handling, session logic) the team must write and maintain. The proposal frames this as an open choice among peers without naming that one option is essentially free and the other is a recurring maintenance surface, so the smaller-cost variant isn't visibly on the table as the default. Security's round-1 BLOCK on this same open question argues the risk of leaving it open at all; that is a severity argument on a different axis (exposure), not a cost-comparison argument, so it doesn't supersede this finding — both should stand.
**Fix:** Name Vercel's built-in deployment protection as the default unless a stated reason rules it out, and treat a custom auth gate as the variant that must justify its extra build cost.
**Status:** upheld

### [WARN] party-po — Recurring per-draft operator-attention cost (manual copy-paste into Gmail, forever) is never quantified against the metric it's meant to serve
**Quotes:** > Lets the user mark a draft `discarded`, or `sent` after they've manually copied it into Gmail themselves
> The dashboard never sends mail; there is still no Gmail credential anywhere near it.
**Problem:** Every draft that becomes "sent" requires a manual copy-paste by the operator, indefinitely — this is a permanent per-use operator-attention cost the proposal builds into the design but never sizes. The proposal's own success criterion is "at least half of routine replies start from a generated draft," which implies a daily volume of this manual step, yet no number (drafts/day, minutes/draft) appears anywhere to let a reader judge whether the modal's value clears this recurring cost.
**Fix:** State an estimated daily draft volume and per-draft copy time so the modal's ongoing cost can be weighed against the throughput it's meant to unlock.
**Status:** upheld

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

### [WARN] party-visionary — The status state-machine lives in two places (schema comment vs. dashboard UI) with nothing to keep them aligned when a status is added later
**Quotes:**
> Lets the user mark a task `done` or `dismissed` — the schema already reserves those values in `tasks.status` for "Phase 5 to write later" (`0003_action_items_schema.sql`).
> Lets the user mark a draft `discarded`, or `sent` after they've manually copied it into Gmail themselves — again, values the schema already reserves for this phase (`0004_draft_generation_schema.sql`).
> Action item sidebar reading `tasks` joined to `emails`; writes `tasks.status` (`open`→`done`/`dismissed`)

**Problem:** The valid values for `tasks.status`/`drafts.status` are declared in migration files (0003/0004), but the *transitions* a user can actually perform — which values are reachable from which, and via which UI control — are proposed to be encoded only in the dashboard's component logic. The next plausible change to this surface is adding a third outcome (e.g. `snoozed` for tasks, or `edited` for drafts): that change has to update the migration's reserved-value comment/constraint *and* the dashboard's transition logic, in two different subsystems (SQL migration vs. Next.js app), with nothing that fails if only one is touched. A migration can ship with a new status value that no UI path ever writes, or a UI button can appear for a transition the constraint doesn't allow, and both look fine until someone exercises that exact path.
**Status:** upheld — party-architect's round-1 finding on the same quotes ("no component named as owner of status-transition validity") is about the missing enforcement layer at merge time; mine is about the specific future change (a third status value) that has to touch two unlinked subsystems with no failure signal if only one is edited. The two are complementary, not duplicates, and neither seat withdrew the other's point.

### [WARN] party-visionary — Shipping self-reported "sent" as in-scope, while the proposal itself flags it may need to be dropped, forecloses ever validating the project's own success metric against real data
**Quotes:**
> Marking a draft `sent` only reflects what the user says happened after they've pasted it elsewhere — the dashboard has no way to verify it. Is that acceptable for v1, or should `sent` be dropped in favor of just `pending`/`discarded` until there's a real signal?
> Draft review modal: triggers `POST /webhook/generate-draft` with the shared secret, displays the returned draft, writes `drafts.status` (`pending`→`sent`/`discarded`)
> at least half of routine replies start from a generated draft

**Problem:** The Scope section commits to writing `sent` as a real status now, while the Open Questions section admits it might not belong. If this ships as scoped, every `sent` row from here forward is a self-report with no distinguishing marker for "verified" vs. "claimed" — because the schema and the dashboard treat it as one flat value. The project's own headline success criterion ("at least half of routine replies start from a generated draft") can only ever be measured against this column. A future change that wants to validate that metric with a real signal (e.g. polling Gmail for a matching sent message) will find the historical `sent` rows indistinguishable from honestly-self-reported ones and will have to either discard all prior data as unverifiable or build a parallel verified-status column and reconcile two truths for the same field, forever. The tension between "ship it" (Scope) and "should we drop it?" (Open Questions) is resolved by omission, not decision.
**Status:** upheld — party-ba's round-1 finding on the same quote flags the internal inconsistency between Scope and Open Questions (which section governs). Mine is a distinct claim about the artifact's downstream effect: even once resolved, the *value itself* being unmarked-self-report is a data-schema commitment that a later verification effort cannot cleanly reverse. These stand independently.

### [WARN] party-visionary — "Direct status-column write, no n8n round-trip" is stated as the dashboard's whole write model, and the next dashboard feature that needs a side effect will copy it into a case where it's wrong
**Quotes:**
> Per the architecture's stated boundary: the dashboard's only outbound write to n8n is the draft-generation POST. Everything else is either a read from Supabase or a narrow status-column write (`tasks.status`, `drafts.status`) directly against tables this container already owns display of.

**Problem:** This sentence doesn't say "for these two status columns" — it states the boundary as a general rule for the container: reads and narrow status writes go straight to Supabase, only draft-generation goes through n8n. A contributor extending the dashboard later (e.g. "re-run categorization on a task the user marked wrong," "notify me when a draft sits unreviewed for a day," "resend a draft for regeneration") will find this sentence as the documented precedent for how the dashboard writes state, and the natural generalization is "direct Postgres write is the pattern here." But those hypothetical actions have side effects that live in n8n, not in a status column — the precedent as stated doesn't distinguish "pure status toggle" (safe to write directly) from "action that should trigger a workflow" (needs the n8n round-trip this proposal reserves only for draft-generation). The rule as written generalizes past the two cases it was written for.
**Status:** upheld

### [NOTE] party-visionary — This is the first reader for tables that have had none since Phase 1–4, and every future feature that needs to expose `emails`/`tasks`/`drafts` data gets that reader for free instead of building its own
**Quotes:**
> `emails.category`/`summary`, `tasks`, and `drafts` all exist as tables today with no reader.

**Problem:** Nothing to fix — this is the compounding case. Before this change, any feature that wanted to show a human what the pipeline produced had to either query Supabase directly or build a one-off consumer. Once the Next.js/Supabase app and its read path exist, the next feature that needs to surface pipeline data (a new view, a report, a filter) is an incremental addition to an existing container rather than a new deployable, provided it follows the read path this change establishes. The proposal takes this leverage rather than stopping short of it — flagged here only because probe 5 requires the compounding case to be named when found, not only the tax.
**Status:** upheld

## Dissent

No withdrawals.
