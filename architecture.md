# Smart Email Assistant — Architecture (C4)

Diagrams follow the [C4 model](https://c4model.com): each level zooms one step further in.
Scope is **v1**, as defined in [smart-email-assistant-proposal.md](smart-email-assistant-proposal.md) and [.specclaw/changes/001-smart-email-assistant/proposal.md](.specclaw/changes/001-smart-email-assistant/proposal.md).

**Colour key**

| Colour | Meaning |
|---|---|
| Dark blue | Person |
| Blue | The system, or a container inside it |
| Light blue | A component inside a container |
| Grey | External system we do not own |

---

## Level 1 — System Context

*Who uses it, and what it talks to.*

```mermaid
flowchart TB
    user(["<b>User</b><br/><i>Person</i><br/>Owner of both mailboxes"])

    sys["<b>Smart Email Assistant</b><br/><i>Software System</i><br/>Triages mail, extracts action items,<br/>drafts replies for review"]

    gmail["<b>Gmail</b><br/><i>External System</i><br/>Mail source + push notifications"]
    outlook["<b>Microsoft Outlook</b><br/><i>External System</i><br/>Mail source + push notifications"]
    gemini["<b>Gemini Flash API</b><br/><i>External System</i><br/>Classification, extraction, drafting"]

    user -->|"Reads triaged inbox, reviews<br/>action items and drafts"| sys
    sys -->|"Reads mail, subscribes to<br/>new-mail events · OAuth"| gmail
    sys -->|"Reads mail, subscribes to<br/>new-mail events · OAuth"| outlook
    sys -->|"Sends email text,<br/>gets structured JSON"| gemini

    classDef person fill:#08427B,stroke:#052E56,color:#ffffff
    classDef system fill:#1168BD,stroke:#0B4884,color:#ffffff
    classDef ext fill:#999999,stroke:#6B6B6B,color:#ffffff
    class user person
    class sys system
    class gmail,outlook,gemini ext
```

**Reading the diagram**

- Single user, single system, three externals. Nothing else exists at v1.
- Every arrow to a mail provider is **read-only**. The system never sends mail — that is a hard product rule, not a deferral.

---

## Level 2 — Containers

*The deployable pieces inside the system, and how they communicate.*

```mermaid
flowchart TB
    user(["<b>User</b><br/><i>Person</i>"])

    subgraph sys ["Smart Email Assistant"]
        direction TB
        web["<b>Web Dashboard</b><br/><i>Next.js App Router + TypeScript · Vercel</i><br/>Unified inbox, action-item sidebar,<br/>draft review"]
        n8n["<b>Automation Engine</b><br/><i>n8n · Docker + Caddy on Oracle Cloud ARM</i><br/>Ingestion, normalisation,<br/>and all AI pipelines"]
        db[("<b>Database</b><br/><i>Supabase · PostgreSQL</i><br/>accounts · emails · tasks<br/>full-text search via tsvector")]
    end

    gmail["<b>Gmail</b><br/><i>External System</i>"]
    pubsub["<b>Google Cloud Pub/Sub</b><br/><i>External System</i><br/>Carries Gmail watch events"]
    outlook["<b>Microsoft Outlook</b><br/><i>External System</i>"]
    gemini["<b>Gemini Flash API</b><br/><i>External System</i>"]

    user -->|"Uses · HTTPS"| web
    web -->|"Reads emails and tasks<br/>Supabase client"| db
    web -->|"Requests a draft reply<br/>HTTPS webhook"| n8n
    n8n -->|"Writes normalised emails,<br/>tasks and drafts"| db

    gmail -->|"Publishes new-mail<br/>notification"| pubsub
    pubsub -->|"Pushes event"| n8n
    outlook -->|"Graph webhook<br/>on new mail"| n8n
    n8n -->|"Fetches full message<br/>Gmail API"| gmail
    n8n -->|"Fetches full message<br/>Graph API"| outlook
    n8n -->|"Prompt in,<br/>structured JSON out"| gemini

    classDef person fill:#08427B,stroke:#052E56,color:#ffffff
    classDef container fill:#438DD5,stroke:#2E6295,color:#ffffff
    classDef ext fill:#999999,stroke:#6B6B6B,color:#ffffff
    classDef boundary fill:#ffffff,stroke:#1168BD,stroke-dasharray:5 5,color:#1168BD
    class user person
    class web,n8n,db container
    class gmail,outlook,gemini,pubsub ext
    class sys boundary
```

**Why the boundaries sit here**

- The frontend never calls an LLM or a mail provider directly. It reads the database, and asks n8n when it needs work done.
- n8n owns every credential and every outbound call, so a provider change stays in one container.
- The database is the only thing both other containers share — it is the contract between them.

---

## Level 3a — Components: Automation Engine (n8n)

*One n8n workflow per box. Everything AI passes through the LLM Gateway.*

```mermaid
flowchart TB
    subgraph n8nbox ["Automation Engine · n8n"]
        direction TB

        gin["<b>Gmail Ingestion</b><br/><i>Workflow</i><br/>Pub/Sub trigger, fetch message"]
        oin["<b>Outlook Ingestion</b><br/><i>Workflow</i><br/>Graph webhook, fetch message"]
        norm["<b>Email Normaliser</b><br/><i>Workflow</i><br/>Maps both providers onto one<br/>internal email schema"]

        triage["<b>Triage Pipeline</b><br/><i>Workflow · every new email</i><br/>Category + one-line summary"]
        action["<b>Action Extraction Pipeline</b><br/><i>Workflow · every new email</i><br/>Task text + optional deadline"]
        draft["<b>Draft Generation Pipeline</b><br/><i>Workflow · on demand</i><br/>Reply grounded in thread<br/>and past sent mail"]

        hook["<b>Draft Webhook</b><br/><i>HTTP endpoint</i><br/>Entry point for the dashboard"]
        llm["<b>LLM Gateway</b><br/><i>Sub-workflow</i><br/>Every model call routes here.<br/>Swapping models is one node."]
    end

    pubsub["Google Cloud Pub/Sub"]
    outlook["Microsoft Outlook"]
    gmail["Gmail"]
    gemini["Gemini Flash API"]
    db[("Database<br/>Supabase")]
    web["Web Dashboard"]

    pubsub --> gin
    outlook --> oin
    gin -.->|"Fetch body"| gmail
    oin -.->|"Fetch body"| outlook
    gin -->|"Raw Gmail message"| norm
    oin -->|"Raw Graph message"| norm

    norm -->|"Writes email row"| db
    norm --> triage
    norm --> action

    web -->|"POST draft request"| hook
    hook --> draft
    draft -->|"Reads thread and<br/>past sent mail"| db

    triage -->|"Writes category<br/>and summary"| db
    action -->|"Writes task,<br/>FK to source email"| db
    draft -->|"Writes draft<br/>for review"| db

    triage --> llm
    action --> llm
    draft --> llm
    llm -->|"Single outbound<br/>model call"| gemini

    classDef component fill:#85BBF0,stroke:#5D82A8,color:#000000
    classDef gateway fill:#3C7FB1,stroke:#22536F,color:#ffffff
    classDef ext fill:#999999,stroke:#6B6B6B,color:#ffffff
    classDef container fill:#438DD5,stroke:#2E6295,color:#ffffff
    classDef boundary fill:#ffffff,stroke:#438DD5,stroke-dasharray:5 5,color:#438DD5
    class gin,oin,norm,triage,action,draft,hook component
    class llm gateway
    class pubsub,outlook,gmail,gemini ext
    class db,web container
    class n8nbox boundary
```

**The one rule enforced from day one:** triage, extraction and drafting never call a model directly — they call the **LLM Gateway**. The fallback router (local Ollama, paid escalation) is designed but *not built* in v1; this box is where it attaches later without touching any pipeline.

Two normalisation points are worth noting: provider differences die at the **Email Normaliser**, and model differences die at the **LLM Gateway**. Everything between those two boxes is provider- and model-agnostic.

---

## Level 3b — Components: Web Dashboard (Next.js)

```mermaid
flowchart TB
    subgraph webbox ["Web Dashboard · Next.js App Router"]
        direction TB
        inbox["<b>Unified Inbox</b><br/><i>Server Component</i><br/>Gmail + Outlook in one list,<br/>category and summary per row"]
        tasks["<b>Action Item Sidebar</b><br/><i>Component</i><br/>Tasks shown beside their<br/>source email"]
        review["<b>Draft Review Modal</b><br/><i>Client Component</i><br/>Requests a draft, shows it<br/>next to the thread"]
        search["<b>Search</b><br/><i>Component</i><br/>Postgres full-text query"]
        data["<b>Data Access Layer</b><br/><i>Supabase client</i><br/>Typed reads, auth session"]
    end

    user(["<b>User</b><br/><i>Person</i>"])
    db[("Database<br/>Supabase")]
    hook["Draft Webhook<br/>n8n"]

    user --> inbox
    user --> tasks
    user --> review
    user --> search

    inbox --> data
    tasks --> data
    search --> data
    review --> data
    data -->|"SQL over HTTPS"| db
    review -->|"POST draft request"| hook

    classDef component fill:#85BBF0,stroke:#5D82A8,color:#000000
    classDef person fill:#08427B,stroke:#052E56,color:#ffffff
    classDef container fill:#438DD5,stroke:#2E6295,color:#ffffff
    classDef boundary fill:#ffffff,stroke:#438DD5,stroke-dasharray:5 5,color:#438DD5
    class inbox,tasks,review,search,data component
    class user person
    class db,hook container
    class webbox boundary
```

The dashboard has exactly one write path — the draft request — and it goes to n8n, not the database. Everything else is a read.

---

## Supporting view — Data model

```mermaid
erDiagram
    ACCOUNTS ||--o{ EMAILS : syncs
    EMAILS   ||--o{ TASKS  : yields

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
        text category "from triage"
        text summary "from triage"
        tsvector search_vector
        timestamptz received_at
    }
    TASKS {
        uuid id PK
        uuid email_id FK
        text task_text
        date deadline "nullable"
        text status
    }
```

---

## Supporting view — New email arriving

```mermaid
sequenceDiagram
    autonumber
    participant P as Gmail / Outlook
    participant N as n8n
    participant G as Gemini Flash
    participant D as Supabase
    participant W as Dashboard

    P->>N: Push notification (new mail)
    N->>P: Fetch full message
    N->>N: Normalise to internal schema
    N->>D: Insert email row
    par Triage
        N->>G: via LLM Gateway
        G-->>N: category + summary
        N->>D: Update email row
    and Action extraction
        N->>G: via LLM Gateway
        G-->>N: task + optional deadline
        N->>D: Insert task row (or nothing)
    end
    W->>D: Read inbox and tasks
```

---

## Deployment at a glance

| Container | Host | Tier |
|---|---|---|
| Web Dashboard | Vercel | Free |
| Automation Engine (n8n) | Oracle Cloud ARM VM — Docker Compose + Caddy | Free |
| Database | Supabase | Free |
| Pub/Sub transport | Google Cloud | Free |

---

## Deliberately absent from these diagrams

Auto-send, multi-tenancy, a mobile app, calendar integration, semantic/vector search, learned per-sender priority rules, and the fallback model router are all out of scope for v1. The router is *designed* — it attaches at the LLM Gateway — but is not drawn because it is not built.
