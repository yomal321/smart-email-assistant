# L3a — Components: Automation Engine (n8n)

**Editable source:** [03a-component-automation-engine.drawio](03a-component-automation-engine.drawio)

Inside the n8n container. One workflow per box — the proposal's rule against visual spaghetti, drawn.

```mermaid
flowchart TB
    subgraph n8nbox ["Automation Engine · [Container: n8n]"]
        direction TB

        gin["<b>Gmail Ingestion</b><br/><i>[Workflow]</i><br/>Pub/Sub trigger,<br/>fetch full message"]
        oin["<b>Outlook Ingestion</b><br/><i>[Workflow]</i><br/>Graph webhook,<br/>fetch full message"]
        hook["<b>Draft Webhook</b><br/><i>[HTTP endpoint]</i><br/>Entry point for<br/>the dashboard"]

        norm["<b>Email Normaliser</b><br/><i>[Workflow]</i><br/>Maps both providers onto<br/>one internal email schema"]

        triage["<b>Triage Pipeline</b><br/><i>[Workflow · every new email]</i><br/>Category + one-line summary"]
        action["<b>Action Extraction</b><br/><i>[Workflow · every new email]</i><br/>Task text + optional deadline"]
        draft["<b>Draft Generation</b><br/><i>[Workflow · on demand]</i><br/>Reply grounded in thread<br/>and past sent mail"]

        llm["<b>LLM Gateway</b><br/><i>[Sub-workflow]</i><br/>Every model call routes here.<br/>Swapping models is one node."]
    end

    pubsub["Google Cloud Pub/Sub"]
    outlook["Microsoft Outlook"]
    gmail["Gmail"]
    gemini["Gemini Flash API"]
    db[("Database<br/>Supabase")]
    web["Web Dashboard"]

    pubsub -->|"Push event"| gin
    outlook -->|"Graph webhook"| oin
    gin -.->|"Fetch body"| gmail
    oin -.->|"Fetch body"| outlook
    gin -->|"Raw Gmail message"| norm
    oin -->|"Raw Graph message"| norm

    norm -->|"Writes email row"| db
    norm --> triage
    norm --> action

    web -->|"POST draft request"| hook
    hook --> draft
    draft -->|"Reads thread and past sent mail,<br/>writes draft for review"| db

    triage -->|"Writes category<br/>and summary"| db
    action -->|"Writes task<br/>FK to source email"| db

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

## Components

| Component | Type | Runs when | Writes |
|---|---|---|---|
| Gmail Ingestion | Workflow | Pub/Sub event | — (hands off to Normaliser) |
| Outlook Ingestion | Workflow | Graph webhook | — (hands off to Normaliser) |
| Email Normaliser | Workflow | After either ingestion | `emails` row |
| Triage Pipeline | Workflow | Every new email | `emails.category`, `emails.summary` |
| Action Extraction | Workflow | Every new email | `tasks` row, or nothing |
| Draft Generation | Workflow | On demand only | draft, for review |
| Draft Webhook | HTTP endpoint | Dashboard request | — (invokes Draft Generation) |
| **LLM Gateway** | Sub-workflow | Every AI call | — |

## The two normalisation points

This is the shape worth defending as the system grows.

**Provider differences die at the Email Normaliser.** Gmail and Outlook have different message formats, different id schemes, different threading semantics. Two ingestion workflows absorb that, and everything downstream sees one internal schema. Adding a third provider means adding one ingestion workflow — no pipeline changes.

**Model differences die at the LLM Gateway.** Triage, extraction and drafting never call Gemini. They call the gateway. Swapping the model, adding retry-on-429, adding a local Ollama fallback, or routing draft generation to a paid model while triage stays free — all of that is a change inside one box.

Everything between those two boxes is provider-agnostic *and* model-agnostic. That is the whole architectural bet of the project, and it is why the gateway is drawn in a different colour.

## Three pipelines, not one prompt

| Pipeline | Trigger | Output contract |
|---|---|---|
| Triage | Every new email | `{ category, summary }` |
| Action extraction | Every new email | `{ task_text, deadline? }` or none |
| Draft generation | On demand | `{ draft_body }` |

Separate pipelines rather than one large prompt, for three reasons the proposal implies: each has its own structured-output schema and can be validated independently; each fails independently (a hallucinated task does not poison the summary); and drafting is on-demand while the other two are per-email, so their cost profiles differ by orders of magnitude.

Triage and extraction fan out from the Normaliser in parallel — neither depends on the other's output.

## Where the fallback router goes

Sketched as future work in v1 ("when 429s actually appear"), not built. It has appeared — live testing during 011-followups-contacts-api hit Gemini's real daily cap after a handful of test emails, each firing three parallel Gemini calls (Triage, Action Extraction, Commitment Extraction). The raw quota error (captured by briefly enabling `neverError` on the Gemini HTTP node — see `.specclaw/learnings.md` L27) confirmed the exact ceiling: `GenerateRequestsPerDayPerProjectPerModel-FreeTier`, value `20`, model `gemini-3.6-flash`. Twenty requests a day is roughly 6–7 real emails before the whole pipeline goes dark for the rest of the day — not a testing artifact, the real operating ceiling.

Router design, attaching inside the LLM Gateway as originally planned — no pipeline changes, same choke point:

- **Primary** — Gemini Flash free tier, all pipelines.
- **Fallback** — OpenRouter (one API key, many models) when Gemini's response is specifically `RESOURCE_EXHAUSTED`/429, not on other failure types (a genuine model outage or malformed request should still surface as a real failure, not silently reroute). Chosen over the originally-sketched local Ollama fallback because the daily cap is exhausted by ordinary volume, not just bursts, and a local model means standing up a second always-on host — infrastructure this single-EC2-instance project doesn't already carry. OpenRouter needs only a second HTTP-header credential on a node that's already making outbound calls.
- **Model** — a cheap, structured-output-capable model (e.g. `openai/gpt-4o-mini`) for Triage/Action/Commitment volume; quality matters more than throughput for Draft Generation, so it may warrant a stronger model even at higher per-call cost.

Real cost from here: once the free tier caps out for the day, OpenRouter calls are paid per-token — no longer a free architecture past that point, by design (the alternative is the pipeline going dark until the next day's reset).

## Failure modes this diagram makes visible

- **Subscription expiry** — nothing in this container renews the Gmail `watch()` or the Graph subscription yet. When they lapse, no arrow fires and no error appears. Mail simply stops.
- **Ingestion succeeds, AI fails** — the email row exists with a null category. The inbox should render that state, not hide the email.
- **Draft generation is the only synchronous path** — it is the one place a slow model call is visible to a waiting human.
