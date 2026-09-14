### [BLOCK] party-architect — "Displays the returned draft" assumes a response shape from an existing n8n webhook the proposal never specifies, and the co-change to that workflow is not in the impact list

**Quotes:** > **Draft Review Modal** — calls the existing `POST /webhook/generate-draft` endpoint, displays `draft_body` next to the source thread.
**Quotes:** > Draft review modal: triggers `POST /webhook/generate-draft` with the shared secret, displays the returned draft, writes `drafts.status` (`pending`→`sent`/`discarded`)
**Quotes:** > **Files affected:** ~20–30 (estimated) — new Next.js app under a new top-level directory, plus one new migration

**Problem:** The artifact names the endpoint as *existing*, which means its request and response contract was fixed by change 006 for a curl/webhook caller, not for a UI. Nothing in the proposal states that it returns `draft_body` synchronously in the HTTP response body rather than acknowledging and writing the row asynchronously — yet the whole modal is designed around "displays the returned draft." These are two different dashboard designs: one renders the POST response, the other must poll or subscribe to `drafts` for the row to appear. If the endpoint does not already return the body, the n8n workflow must change in the same commit, and the impact list ("plus one new migration") names no n8n change at all. Also unspecified on a contract two components now share: how "the shared secret" is transmitted (header vs. body field), the success status code, the response on generation failure, and the timeout an LLM-backed call needs.

**Fix:** State in the artifact what `POST /webhook/generate-draft` returns today (verbatim response shape and status codes) and how the secret is passed; if it does not return `draft_body`, list the 006 workflow as a co-change in Impact, or specify the poll/subscribe path on `drafts` instead.

### [BLOCK] party-architect — The search migration adds a `tsvector` column with no named writer, no backfill, and no co-change to the ingestion path that writes `emails`

**Quotes:** > Full-text search over `emails.subject`/`body`, which requires a new migration (`0005`) adding a `tsvector` `search_vector` column + GIN index — not present in the schema today
**Quotes:** > **Files affected:** ~20–30 (estimated) — new Next.js app under a new top-level directory, plus one new migration
**Quotes:** > Phases 1–4 (ingestion, triage, action extraction, draft generation) are live and verified

**Problem:** A `search_vector` column is a derived fact about every row of `emails`, and the proposal names no mechanism that populates it. Three structurally different answers exist — a generated/stored column, a trigger on `emails`, or the ingestion workflow writing it on insert — and they have different blast radii: the third is a co-change to the live ingestion container, which the impact list does not name. Nor does the artifact mention backfilling the rows already in `emails` from four live phases; ship the migration without it and search silently returns nothing for all existing mail while the acceptance path looks green on new mail. Adjacently under-specified on the same contract: the inbox displays `category`/`summary` but search is scoped to `subject`/`body`, with no statement of text-search configuration or whether `summary` is indexed.

**Fix:** Name the population mechanism in the proposal (generated column / trigger / ingestion write), state the backfill step explicitly, and if ingestion writes it, list the ingestion workflow as a co-change in Impact.

### [WARN] party-architect — The layer that owns Supabase access is left open, and it is the decision that shapes every data-access file in the change

**Quotes:** > **Access model.** `architecture.md`'s Level 2 diagram shows the dashboard reading via a "Supabase client." With RLS off, does that mean the anon key (full read+write on every table, from the browser) or does the dashboard route all Supabase access through Next.js server components/route handlers using a service-role key that never reaches the client?
**Quotes:** > Unified Inbox** — server-rendered list of `emails`, showing `category` and `summary`, sorted by `received_at`.

**Problem:** This is a seam question, not a detail: browser-client-direct and server-component-only produce different module layouts, different test seams, and a different answer for every one of the four pieces. The artifact has already half-answered it — the inbox is described as "server-rendered" — while leaving the general rule open, so two implementers would build two different data layers from the same approved document, and a later switch touches every read and write in the app. The artifact also states the chosen seam contradicts a diagram it cites ("Level 2 diagram shows the dashboard reading via a 'Supabase client'"); if the server-side answer is taken, `architecture.md` is a co-change in the same commit and is not listed in Impact.

**Fix:** Resolve the access seam in the proposal before planning and state it once as a rule covering all reads and all status writes; if it diverges from the Level 2 diagram, add `architecture.md` to Files affected.

### [WARN] party-architect — Two write paths into `tasks` and `drafts` with no component named as owner of status-transition validity

**Quotes:** > Per the architecture's stated boundary: the dashboard's only outbound write to n8n is the draft-generation POST. Everything else is either a read from Supabase or a narrow status-column write (`tasks.status`, `drafts.status`) directly against tables this container already owns display of.
**Quotes:** > the project's "RLS intentionally off" decision (`README.md`) was made when the only client was n8n holding a direct Postgres credential server-side.

**Problem:** The artifact states that until now n8n was "the only client" writing these tables, and then adds a second direct writer of the same rows. The transitions themselves (`open`→`done`/`dismissed`, `pending`→`sent`/`discarded`) are stated as arrows but no layer is named as enforcing them: not the schema (the values are described as merely "reserved"), not a shared helper, not the callee. Two writers plus no owner of the transition rule means the first time a transition gains a precondition — say `sent` requires a non-null `draft_body` — it gets implemented in one writer and not the other. Open Question 5 makes this concrete: whether `sent` exists at all is still open, and that changes the write contract the dashboard ships.

**Fix:** Name the layer that owns transition validity — a CHECK/enum constraint in migration `0005`, or a single route handler both the modal and sidebar call — and settle whether `sent` is in the value set before implementation, since it is a schema-visible contract, not a UI choice.

### [WARN] party-architect — No test seam is named for any of the four pieces, and three of them depend on a live service

**Quotes:** > Build the Web Dashboard container from `architect/03b` and `architecture.md`'s Level 2/3b diagrams: a Next.js (App Router, TypeScript) app deployed to Vercel with four pieces —
**Quotes:** > Draft review modal: triggers `POST /webhook/generate-draft` with the shared secret, displays the returned draft, writes `drafts.status` (`pending`→`sent`/`discarded`)
**Quotes:** > **Complexity:** large (new deployable container, first client-facing surface, first client-side/server-side Supabase read path, new write paths into two existing tables)

**Problem:** The proposal describes the first client-facing container in the project and says nothing about how any of it is tested. As written, the inbox, sidebar and search need a live Supabase with representative rows, and the draft modal needs a live n8n webhook backed by an LLM — a non-deterministic, network-dependent, wall-clock-bounded dependency. With no stub boundary named (no fake Supabase client, no injectable webhook base URL, no fixture dataset), the tests for the modal in particular are the kind that get written once and then skipped, and the search tests silently depend on whatever the backfill left behind.

**Fix:** Name the two stub seams in the proposal — the Supabase data-access module and the draft-webhook client — as injectable interfaces, and state the fixture dataset the inbox/sidebar/search tests run against so the suite is deterministic without network.
