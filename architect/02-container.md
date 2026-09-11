# L2 — Containers

**Editable source:** [02-container.drawio](02-container.drawio)

Zoom one level in: the three deployable pieces and how they talk.

```mermaid
flowchart TB
    user(["<b>User</b><br/><i>[Person]</i>"])

    subgraph sys ["Smart Email Assistant"]
        direction TB
        web["<b>Web Dashboard</b><br/><i>[Next.js App Router + TypeScript · Vercel]</i><br/>Unified inbox, action-item sidebar,<br/>draft review modal"]
        n8n["<b>Automation Engine</b><br/><i>[n8n · Docker + Caddy on AWS EC2]</i><br/>Ingestion, normalisation,<br/>and all AI pipelines"]
        db[("<b>Database</b><br/><i>[Supabase · PostgreSQL]</i><br/>accounts · emails · tasks<br/>full-text search via tsvector")]
    end

    gmail["<b>Gmail</b><br/><i>[External System]</i>"]
    pubsub["<b>Google Cloud Pub/Sub</b><br/><i>[External System]</i><br/>Carries Gmail watch events"]
    outlook["<b>Microsoft Outlook</b><br/><i>[External System]</i>"]
    gemini["<b>Gemini Flash API</b><br/><i>[External System]</i>"]

    user -->|"Uses · HTTPS"| web
    web -->|"Reads emails and tasks<br/>Supabase client"| db
    web -->|"Requests a draft reply<br/>HTTPS webhook"| n8n
    n8n -->|"Writes normalised emails,<br/>tasks and drafts · SQL"| db

    gmail -->|"Publishes new-mail<br/>notification"| pubsub
    pubsub -->|"Pushes event"| n8n
    outlook -->|"Graph webhook<br/>on new mail"| n8n
    n8n -.->|"Fetches full message<br/>Gmail API"| gmail
    n8n -.->|"Fetches full message<br/>Graph API"| outlook
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

## The three containers

| Container | Technology | Host | Responsibility |
|---|---|---|---|
| **Web Dashboard** | Next.js App Router, TypeScript | Vercel (free) | Everything the user sees. Reads only. |
| **Automation Engine** | n8n, Docker Compose + Caddy | AWS EC2 (free tier) | Every credential, every outbound call, every AI pipeline. |
| **Database** | Supabase / PostgreSQL | Supabase (free) | The contract between the other two. |

## Why the boundaries sit here

**n8n owns every credential.** OAuth tokens for both providers and the Gemini API key live in one container. The dashboard has none of them. If a provider changes its auth model, exactly one container changes.

**The database is the interface.** The dashboard does not ask n8n for the inbox — it reads Supabase directly. n8n does not render anything — it writes rows. Neither needs to be running for the other to be useful, and phases 1–4 are verifiable with no frontend at all.

**One synchronous call between containers.** The dashboard calls n8n for exactly one thing: draft generation, on demand. Everything else is asynchronous through the database. That single webhook is the only place where a slow n8n makes the UI wait.

## Push, never poll

| Provider | Mechanism | Path |
|---|---|---|
| Gmail | `watch()` → Google Cloud Pub/Sub | Gmail → Pub/Sub → n8n |
| Outlook | Microsoft Graph webhook subscription | Outlook → n8n |

Pub/Sub exists in the diagram only because Gmail requires it — Outlook posts to n8n directly. It is transport, not a component we designed.

Both subscriptions expire and must be renewed (Gmail's `watch()` within 7 days, Graph subscriptions on their own clock). That renewal job is n8n's, and it is the most likely silent failure in the whole system: nothing breaks loudly, mail just stops arriving.

## Deployment

| Container | Host | Tier | Operational burden |
|---|---|---|---|
| Web Dashboard | Vercel | Free | None — managed |
| Automation Engine | AWS EC2 (Ubuntu) | Free tier | **Self-managed**: TLS, patching, uptime |
| Database | Supabase | Free | None — managed |
| Pub/Sub transport | Google Cloud | Free | None — managed |

The EC2 instance is the only self-managed box and therefore the only real ops risk. Caddy handles TLS renewal automatically; ports 80/443/22 must be open in the instance's Security Group (AWS's cloud-level firewall) — the classic trap here is a Security Group inbound rule scoped to a single source IP that later moves (e.g. an ISP-assigned address changing), silently locking out SSH access.
