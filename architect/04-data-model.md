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
        uuid email_id FK
        text task_text
        date deadline "nullable"
        text status
    }
    DRAFTS {
        uuid id PK
        uuid email_id FK "no unique constraint -- multiple per email"
        text draft_body
        text status "pending/sent/discarded"
        timestamptz created_at
    }
```

## Who writes what

| Written by | Fields |
|---|---|
| Ingestion + Normaliser | `emails`: account_id, thread_id, sender, subject, body, received_at |
| Triage Pipeline | `emails`: category, summary, platform, confidence, priority, priority_score, reasons, tone, tone_evidence, tldr, entities, model_run, processed_at |
| Action Extraction | `tasks`: entire row |
| Draft Generation | `drafts`: entire row |
| Postgres | `emails.search_vector` (generated / trigger-maintained) |
| Web Dashboard (mutation routes, `009-dashboard-messages-api`) | `emails`: is_starred (`PATCH /api/messages/:id/star`), status/snoozed_until/handled_at/handled_action (`POST /api/messages/archive\|done\|snooze\|restore`) — otherwise reads only |
| Unwritten this phase (honest placeholders) | `emails`: attachments, gmail_url, sla_target_hours, is_from_user, is_unread (stays at its default) |

Splitting the table by writer this way makes the phasing obvious: Phase 1 fills the top block, Phase 2 the second, Phase 3 the third. Each phase is independently verifiable by querying one set of columns.

## The FK that matters

`tasks.email_id` is not bookkeeping — it is the hallucination mitigation. Every extracted action item can be shown beside the email it was drawn from, so a wrong task is visibly wrong rather than quietly authoritative. If that link were optional, the task list would become a set of unverifiable claims.

## Open questions, still unresolved in the proposal

These are carried over rather than silently decided:

- **Deletion propagation.** If an email is deleted or archived at the provider, does the local `emails` row follow? And what happens to a `task` whose source email disappears — cascade, orphan, or tombstone? Cascading would silently delete commitments the user still owes.
- **Token storage.** `accounts.credentials` overlaps with n8n's own credential store. Mirroring tokens in both places means two things to keep in sync and two places to leak from.
- **Backfill policy.** On first connect: recent mail only, or full history? This decides whether `emails` holds hundreds of rows or hundreds of thousands, which in turn decides whether tsvector search is sufficient.
- **Category values.** A fixed enum keeps the inbox scannable and filterable; model-proposed labels drift and fragment. The column is `text` either way, but the constraint belongs in the schema if the enum wins.

## Why no vector column

Semantic search is explicitly out of scope for v1. Postgres `tsvector` covers "find that email about the invoice" for a single user's mailbox. A vector store would be a fourth managed service and a second copy of every email body, for a capability the success criteria never ask for.
