# Supporting View — Data Model

**Editable source:** [04-data-model.drawio](04-data-model.drawio)

Not a C4 level — a supporting view. The database is the contract between the two active containers, so it is worth drawing.

```mermaid
erDiagram
    ACCOUNTS ||--o{ EMAILS : syncs
    EMAILS   ||--o{ TASKS  : yields
    EMAILS   ||--o{ DRAFTS : drafts

    ACCOUNTS {
        uuid id PK
        text provider "gmail or outlook"
        jsonb credentials
        text sync_state
    }
    EMAILS {
        uuid id PK
        uuid account_id FK
        text thread_id
        text sender
        text subject
        text body
        text category "written by triage"
        text summary "written by triage"
        tsvector search_vector
        timestamptz received_at
        text platform "7-value dashboard class, written by triage, distinct from category"
        int confidence "0-100, written by triage"
        text priority "urgent/normal/low, written by triage"
        int priority_score "0-100, written by triage"
        jsonb reasons "written by triage"
        text tone "tense/neutral/warm, written by triage"
        text tone_evidence "nullable, written by triage"
        text tldr "nullable, long threads only, written by triage"
        jsonb entities "written by triage"
        jsonb attachments "honest placeholder, unwritten this phase"
        text gmail_url "reserved, unwritten this phase"
        boolean is_unread "dashboard state, default true"
        boolean is_starred "dashboard state, written by PATCH .../star"
        text status "open/archived/snoozed/done, written by mutation routes"
        timestamptz snoozed_until "nullable, written by /snooze and /restore"
        timestamptz handled_at "nullable, written by mutation routes"
        text handled_action "archived/done/snoozed, nullable"
        int sla_target_hours "honest placeholder, unwritten this phase"
        text model_run "written by triage, from llm-gateway.json"
        timestamptz processed_at "written by triage on success"
        boolean is_from_user "honest placeholder, always false this phase"
    }
    TASKS {
        uuid id PK
        uuid email_id FK "nullable -- null only for origin='manual' (010)"
        text task_text
        date deadline "nullable"
        text status "todo/in-progress/done/dismissed (010)"
        text owner_name "nullable, unwritten this phase"
        text owner_email "nullable, unwritten this phase"
        text priority "urgent/normal/low, default normal (010)"
        text origin "extracted/manual (010)"
        int confidence "nullable, unwritten this phase"
    }
    DRAFTS {
        uuid id PK
        uuid email_id FK "no unique constraint -- multiple per email"
        text draft_body
        text generated_body "nullable, immutable original (010)"
        text tone "formal/friendly/brief/firm, nullable (010)"
        text length "brief/standard/detailed, nullable (010)"
        text status "pending/approved/sent/discarded (010)"
        timestamptz created_at
        timestamptz approved_at "nullable, set once (010)"
        int edit_distance "nullable, recomputed per edit (010)"
    }
```

## Who writes what

| Written by | Fields |
|---|---|
| Ingestion + Normaliser | `emails`: account_id, thread_id, sender, subject, body, received_at |
| Triage Pipeline | `emails`: category, summary, platform, confidence, priority, priority_score, reasons, tone, tone_evidence, tldr, entities, model_run, processed_at |
| Action Extraction | `tasks`: email_id, task_text, deadline, status='todo', priority='normal', origin='extracted' (`010-dashboard-actions-drafts-api`) |
| Draft Generation | `drafts`: email_id, draft_body, generated_body, status='pending', tone, length (`010-dashboard-actions-drafts-api`) |
| Postgres | `emails.search_vector` (generated / trigger-maintained) |
| Web Dashboard (mutation routes, `009-dashboard-messages-api`) | `emails`: is_starred (`PATCH /api/messages/:id/star`), status/snoozed_until/handled_at/handled_action (`POST /api/messages/archive\|done\|snooze\|restore`) — otherwise reads only |
| Web Dashboard (action-item/draft routes, `010-dashboard-actions-drafts-api`) | `tasks`: email_id=null/task_text/deadline/status/priority/origin='manual' (`POST\|PATCH /api/action-items*`); `drafts`: draft_body/edit_distance/tone/length (`PATCH /api/drafts/:id`), status/approved_at (`POST /api/drafts/:id/status`) — otherwise reads only |
| Unwritten this phase (honest placeholders) | `emails`: attachments, gmail_url, sla_target_hours, is_from_user, is_unread (stays at its default); `tasks`: owner_name, owner_email, confidence |

Splitting the table by writer this way makes the phasing obvious: Phase 1 fills the top block, Phase 2 the second, Phase 3 the third. Each phase is independently verifiable by querying one set of columns.

## The FK that matters

`tasks.email_id` is not bookkeeping — it is the hallucination mitigation. Every *extracted* action item can be shown beside the email it was drawn from, so a wrong task is visibly wrong rather than quietly authoritative. `010-dashboard-actions-drafts-api` makes the column nullable, but only for `origin = 'manual'` rows — a manually-typed item has no extraction behind it to be hallucinated in the first place, so there is nothing for the link to verify. Action Extraction itself never writes a null `email_id`; the guarantee holds for every row it's actually about.

## Open questions, still unresolved in the proposal

These are carried over rather than silently decided:

- **Deletion propagation.** If an email is deleted or archived at the provider, does the local `emails` row follow? And what happens to a `task` whose source email disappears — cascade, orphan, or tombstone? Cascading would silently delete commitments the user still owes.
- **Token storage.** `accounts.credentials` overlaps with n8n's own credential store. Mirroring tokens in both places means two things to keep in sync and two places to leak from.
- **Backfill policy.** On first connect: recent mail only, or full history? This decides whether `emails` holds hundreds of rows or hundreds of thousands, which in turn decides whether tsvector search is sufficient.
- **Category values.** A fixed enum keeps the inbox scannable and filterable; model-proposed labels drift and fragment. The column is `text` either way, but the constraint belongs in the schema if the enum wins.

## Why no vector column

Semantic search is explicitly out of scope for v1. Postgres `tsvector` covers "find that email about the invoice" for a single user's mailbox. A vector store would be a fourth managed service and a second copy of every email body, for a capability the success criteria never ask for.
