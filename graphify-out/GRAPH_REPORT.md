# Graph Report - Smart Gmail Assistant  (2026-09-13)

## Corpus Check
- 247 files · ~213,618 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 910 nodes · 1863 edges · 57 communities (43 shown, 12 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 47 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Dashboard App Shell & State
- Core System Architecture
- Dashboard Design & Product Vision
- Action Items & Draft Generation Specs
- Outlook Ingestion & Triage Specs
- Founding Proposal & Gmail Ingestion Specs
- Web Dashboard Party Review (Archived)
- Rules & Settings UI
- Command Palette & Dialog System
- Message Fixture Data
- Shared UI Primitives
- shadcn Component Registry Config
- Analytics Charts
- Drafts & Follow-ups UI
- TypeScript Config
- Station Platform Rail UI
- Core Data Types & Fixtures
- Actions Page Views
- Package Dependencies (refs)
- Build Learnings Log
- Web Dashboard Proposal Concepts
- Overview Analytics Spec
- Navigation Shell Spec & Tasks
- Sync Clock & Popover UI
- Inbox & Platform Badge UI
- Preferences & Settings State
- Concourse Bar & Sheet UI
- Dashboard Data Query Helpers
- Responsive & Accessibility Sweep
- Package Dependencies List
- Table Polish & Inbox Row
- App Layout & Fonts Config
- Overview Page Build Tasks
- Board Sheet & Priority Aspect
- Delay Figure & Format Utils
- Input Group UI
- Dev Dependencies List
- Drafts Provider & Fixtures
- Action Items & Commitments Fixtures
- Dark Mode & Contrast Spec
- Sync State Fixtures
- Specclaw Workflow Config
- Package Scripts
- Agent Instructions Docs
- ESLint Config
- PostCSS Config
- File Icon Asset
- Globe Icon Asset
- Next.js Logo Asset
- Vercel Logo Asset
- Window Icon Asset
- Action Items Status
- Draft Generation Status
- Dashboard NFR4 Spec
- Specclaw Patterns Registry

## God Nodes (most connected - your core abstractions)
1. `react` - 47 edges
2. `design-spec.md — The Departure Board Build Contract` - 38 edges
3. `cn` - 23 edges
4. `lucide-react` - 21 edges
5. `PRODUCT.md — Smart Gmail Assistant Product Truth` - 20 edges
6. `Web Dashboard (Phase 5) Proposal` - 18 edges
7. `useBoard()` - 17 edges
8. `Button()` - 17 edges
9. `radix-ui` - 17 edges
10. `Party Report: 002-ingestion` - 17 edges

## Surprising Connections (you probably didn't know these)
- `Single LLM Choke Point (architectural rule)` --semantically_similar_to--> `PRODUCT.md — Smart Gmail Assistant Product Truth`  [INFERRED] [semantically similar]
  smart-email-assistant-proposal.md → gmail-dashboard/PRODUCT.md
- `Source-linked verification (hallucination mitigation)` --semantically_similar_to--> `Prompt-injection defense (delimiters)`  [INFERRED] [semantically similar]
  CAPABILITIES.md → README.md
- `Supabase access model — undecided (anon vs service-role key)` --rationale_for--> `Web Dashboard`  [AMBIGUOUS]
  PRODUCT.md → architect/03b-component-web-dashboard.md
- `Daily Brief (feature idea)` --semantically_similar_to--> `Unified Inbox`  [INFERRED] [semantically similar]
  feature-ideas.md → architect/03b-component-web-dashboard.md
- `sync_outcomes table` --conceptually_related_to--> `accounts table`  [INFERRED]
  README.md → architect/04-data-model.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Credential Ownership Resolution Across Proposal, Review, and Design** — specclaw_changes_002_ingestion_design_credential_ownership_decision, specclaw_changes_002_ingestion_party_report, specclaw_changes_002_ingestion_design [INFERRED 0.85]
- **Renewal, Catch-up Fetch, and Health Logging Form the Recovery Mechanism** — specclaw_changes_002_ingestion_design_gmail_renewal_recovery_workflow, specclaw_changes_002_ingestion_design_catchup_fetch_mechanism, specclaw_changes_002_ingestion_design_sync_outcomes_table [EXTRACTED 1.00]
- **Three Party Seats Converge on One Per-Account Cursor Fact** — specclaw_changes_002_ingestion_design_sync_cursor, specclaw_changes_002_ingestion_party_findings_r2_party_architect, specclaw_changes_002_ingestion_party_findings_r1_party_security, specclaw_changes_002_ingestion_party_findings_r1_party_visionary [EXTRACTED 1.00]
- **Outlook Ingestion Proposal's Unresolved Cross-Section Contradictions** — specclaw_changes_003_outlook_ingestion_proposal_renewal_workflow_shared_vs_separate, specclaw_changes_003_outlook_ingestion_proposal_clientstate_secret, specclaw_changes_003_outlook_ingestion_proposal_email_normaliser_extend_or_duplicate [INFERRED 0.85]
- **Triage Invocation Flow (Email Normaliser -> Triage Pipeline -> LLM Gateway)** — specclaw_changes_004_triage_design_email_normaliser_branch, specclaw_changes_004_triage_design_triage_pipeline, specclaw_changes_004_triage_design_llm_gateway [EXTRACTED 1.00]
- **Category Taxonomy Enforcement Chain (DB constraint, structured schema, taxonomy)** — specclaw_changes_004_triage_spec_category_check_constraint, specclaw_changes_004_triage_spec_structured_output_schema, specclaw_changes_004_triage_proposal_category_taxonomy [EXTRACTED 1.00]
- **Action Extraction fan-out pattern (Email Normaliser -> Action Extraction -> LLM Gateway)** — specclaw_changes_005_action_items_design_email_normaliser_branch, specclaw_changes_005_action_items_design_action_extraction_workflow, specclaw_changes_005_action_items_design_llm_gateway_reuse [EXTRACTED 0.90]
- **Draft Generation external trust boundary (webhook + auth + injection defense)** — specclaw_changes_006_draft_generation_design_draft_generation_workflow, specclaw_changes_006_draft_generation_design_webhook_contract, specclaw_changes_006_draft_generation_design_shared_secret_auth, specclaw_changes_006_draft_generation_design_prompt_injection_defense [EXTRACTED 0.90]
- **Per-email write guard convention across phases (unique-constraint vs application-level cap)** — specclaw_changes_005_action_items_design_tasks_table, specclaw_changes_006_draft_generation_design_drafts_table, specclaw_changes_005_action_items_design_guarded_idempotent_write [INFERRED 0.85]
- **Access model and gate resolution debate** — specclaw_changes_007_web_dashboard_party__archive_2026_09_11_party_report_2026_09_11_supabase_access_model_open, specclaw_changes_007_web_dashboard_party__archive_2026_09_11_party_report_2026_09_11_access_gate_cost_options, specclaw_changes_007_web_dashboard_party__archive_2026_09_11_findings_r1_party_architect, specclaw_changes_007_web_dashboard_party__archive_2026_09_11_findings_r1_party_po, specclaw_changes_007_web_dashboard_party__archive_2026_09_11_findings_r1_party_security [INFERRED 0.75]
- **Draft webhook contract and secret-handling debate** — specclaw_changes_007_web_dashboard_party__archive_2026_09_11_party_report_2026_09_11_draft_webhook_contract, specclaw_changes_007_web_dashboard_party__archive_2026_09_11_party_report_2026_09_11_draft_secret_unbounded_cost, specclaw_changes_007_web_dashboard_party__archive_2026_09_11_party_report_2026_09_11_xss_sanitization_missing, specclaw_changes_007_web_dashboard_party__archive_2026_09_11_findings_r1_party_architect, specclaw_changes_007_web_dashboard_party__archive_2026_09_11_findings_r1_party_security [INFERRED 0.75]
- **Task/draft status transition governance debate** — specclaw_changes_007_web_dashboard_party__archive_2026_09_11_party_report_2026_09_11_status_transition_ownership, specclaw_changes_007_web_dashboard_party__archive_2026_09_11_party_report_2026_09_11_status_state_machine_split, specclaw_changes_007_web_dashboard_party__archive_2026_09_11_party_report_2026_09_11_one_way_status_transitions, specclaw_changes_007_web_dashboard_party__archive_2026_09_11_party_report_2026_09_11_sent_status_ambiguity, specclaw_changes_007_web_dashboard_party__archive_2026_09_11_findings_r1_party_architect, specclaw_changes_007_web_dashboard_party__archive_2026_09_11_findings_r1_party_visionary, specclaw_changes_007_web_dashboard_party__archive_2026_09_11_findings_r1_party_security [INFERRED 0.75]
- **Navigation Shell Assembly (Sidebar + TopBar + CommandPalette mounted in layout)** — dashboard_components_sidebar, dashboard_components_topbar, dashboard_components_commandpalette, dashboard_app_layout [INFERRED 0.85]
- **Overview Analytics Data Flow (fixtures -> analytics -> KPI/chart components)** — dashboard_lib_analytics, dashboard_components_kpicard, dashboard_components_charts_volumechart, dashboard_components_charts_categorybreakdownchart, dashboard_app_overview_page [INFERRED 0.85]
- **Sweep Tasks Surface Real Bugs via Live Verification** — specclaw_changes_007_web_dashboard_tasks_t13, specclaw_changes_007_web_dashboard_tasks_t14, specclaw_learnings_l17 [INFERRED 0.75]
- **Source-beside-extraction hallucination mitigation** — source_linked_verification, tasks_table, drafts_table, action_item_sidebar, draft_review_modal [EXTRACTED 1.00]
- **Two normalisation points: provider- and model-agnosticism** — email_normaliser, llm_gateway, triage_pipeline, action_extraction, draft_generation [INFERRED 0.85]
- **New email ingestion and processing flow** — gmail_external, email_normaliser, triage_pipeline, action_extraction, supabase_database [EXTRACTED 1.00]
- **Fixture Data Shapes as Placeholder for the Proposal's Real Backend** — gmail_dashboard_design_spec_message, gmail_dashboard_product, smart_email_assistant_proposal_emails_table, smart_email_assistant_proposal_triage_pipeline [INFERRED 0.75]
- **Ten-Module Scope Confirmed Across Product Documents** — gmail_dashboard_smart_gmail_assistant_dashboard, gmail_dashboard_product, gmail_dashboard_design_spec, gmail_dashboard_readme [EXTRACTED 1.00]
- **Departure Board Direction-to-Build-to-As-Built Lifecycle** — gmail_dashboard_impeccable_surfaces_app, gmail_dashboard_design_spec, gmail_dashboard_design, gmail_dashboard_impeccable_surfaces_app_departure_board [INFERRED 0.85]

## Communities (57 total, 12 thin omitted)

### Community 0 - "Dashboard App Shell & State"
Cohesion: 0.06
Nodes (48): ContactsPage(), SortKey, TONE_COLOR, daysUntilOrPast(), FollowUpsPage(), OverviewPage(), ReviewQueuePage(), ActionItemsContext (+40 more)

### Community 1 - "Core System Architecture"
Cohesion: 0.09
Nodes (62): accounts table, Action Extraction, Action Item Sidebar, L1 — System Context, L2 — Containers, L3a — Components: Automation Engine (n8n), L3b — Components: Web Dashboard (Next.js), Supporting View — Data Model (+54 more)

### Community 2 - "Dashboard Design & Product Vision"
Cohesion: 0.07
Nodes (65): DESIGN.md — The Departure Board (As-Built Design System), design-spec.md — The Departure Board Build Contract, ActionItem data shape, BalanceBand component, BoardRow component, BoardSheet component, The Colour Law (three colour rules), Commitment data shape (+57 more)

### Community 3 - "Action Items & Draft Generation Specs"
Cohesion: 0.07
Nodes (49): Design: Action Items (Phase 3), Accepted gap: no-task/no-error indistinguishable from not-attempted, emails.action_extraction_error column, Action Extraction n8n workflow, Deadline resolution with reference date and pinned YYYY-MM-DD format, Email Normaliser additive fan-out branch (Call Action Extraction), Guarded idempotent write convention (UNIQUE + ON CONFLICT DO NOTHING), LLM Gateway reused unmodified (+41 more)

### Community 4 - "Outlook Ingestion & Triage Specs"
Cohesion: 0.08
Nodes (47): Party Findings Round 1 - party-architect (003-outlook-ingestion), Party Findings Round 1 - party-ba (003-outlook-ingestion), Party Findings Round 1 - party-po (003-outlook-ingestion), Party Findings Round 2 - party-architect (003-outlook-ingestion), Party Findings Round 2 - party-ba (003-outlook-ingestion), Party Findings Round 2 - party-po (003-outlook-ingestion), Party Report: 003-outlook-ingestion, Proposal: Outlook Ingestion (Phase 1b) (+39 more)

### Community 5 - "Founding Proposal & Gmail Ingestion Specs"
Cohesion: 0.09
Nodes (41): Smart Email Assistant Proposal (v1), Five-Phase Delivery Order, Gemini Flash Intelligence Pipelines, Single n8n LLM Sub-workflow Choke Point, Model Strategy (Gemini Flash primary / Ollama fallback deferred / Kimi K3 rejected), n8n Ingestion Layer, Next.js App Router Frontend, Supabase Storage Layer (accounts/emails/tasks) (+33 more)

### Community 6 - "Web Dashboard Party Review (Archived)"
Cohesion: 0.08
Nodes (37): Web Dashboard Design (Phase 5), lib/analytics.ts pure KPI/series functions, Lift shared state into AppStateProvider, Charting library left as implementation-time choice, Self-built command palette over library, Class-based dark mode strategy, Party Findings r1 - Architect, Party Findings r1 - BA (+29 more)

### Community 7 - "Rules & Settings UI"
Cohesion: 0.12
Nodes (14): ACTIONS, FIELDS, OPERATORS, RulesPage(), PriorityFilter, SortKey, Input(), Select() (+6 more)

### Community 8 - "Command Palette & Dialog System"
Cohesion: 0.13
Nodes (15): CommandDialog(), CommandEmpty(), CommandGroup(), CommandInput(), CommandItem(), CommandList(), CommandSeparator(), CommandShortcut() (+7 more)

### Community 9 - "Message Fixture Data"
Cohesion: 0.10
Nodes (22): contactById(), dashedBand, devonMeeting, filler, FillerSpec, fillerSpecs, fillerToMessage(), handled (+14 more)

### Community 10 - "Shared UI Primitives"
Cohesion: 0.15
Nodes (12): Badge(), badgeVariants, Label(), Slider(), TabsList(), tabsListVariants, Toggle(), toggleVariants (+4 more)

### Community 11 - "shadcn Component Registry Config"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 12 - "Analytics Charts"
Cohesion: 0.14
Nodes (12): AnalyticsPage(), BusiestHoursHeatmap(), cellValue(), DAYS, CategoryBreakdown(), DATA, WEEKS, BUCKETS (+4 more)

### Community 13 - "Drafts & Follow-ups UI"
Cohesion: 0.19
Nodes (9): LENGTHS, SNIPPETS, TONES, NudgeTarget, CommitView(), EmptyState(), Button(), buttonVariants (+1 more)

### Community 14 - "TypeScript Config"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 15 - "Station Platform Rail UI"
Cohesion: 0.18
Nodes (8): PlatformRail(), ROUTES, SAVED_VIEWS, TonePill(), Tooltip(), TooltipContent(), TooltipProvider(), TooltipTrigger()

### Community 16 - "Core Data Types & Fixtures"
Cohesion: 0.13
Nodes (13): ACTIVITY_LOG, CONTACTS, RULES, ActivityLogEntry, Attachment, Contact, Entities, MessageAi (+5 more)

### Community 17 - "Actions Page Views"
Cohesion: 0.15
Nodes (11): ActionRow(), ActionsContent(), daysUntil(), group(), KanbanView(), DraftsPage(), DropdownMenuContent(), DropdownMenuItem() (+3 more)

### Community 18 - "Package Dependencies (refs)"
Cohesion: 0.12
Nodes (15): name, private, version, cmdk, eslint, eslint-config-next, react-dom, shadcn (+7 more)

### Community 19 - "Build Learnings Log"
Cohesion: 0.13
Nodes (15): dashboard/components/AppStateProvider.tsx, SpecClaw Build Learnings Log, L1: Sync Cursor Ownership Across n8n Sub-Workflow Boundary, L10: n8n Code Node Blocks require('crypto') by Default, L11: n8n Code Node Blocks $env Access by Default, L12: Incomplete 'Every Occurrence' Placeholder Enumeration, L13: AppStateProvider set-state-in-effect Lint Error, L2: OIDC Token Verification via tokeninfo Endpoint (+7 more)

### Community 20 - "Web Dashboard Proposal Concepts"
Cohesion: 0.14
Nodes (14): Access Model Question (anon vs service-role key), Auth/Access Gate Question, Bento Box Grid Layout, Command Palette (Cmd+K), Data-Dense Dashboard (BI/Analytics) Style, Draft Edit Before Send Question, Executive Dashboard KPI Row Conventions, Fixture-Data-Only Boundary (+6 more)

### Community 21 - "Overview Analytics Spec"
Cohesion: 0.24
Nodes (14): Accessible Chart Data-Table Fallback, Category-Breakdown Chart, KPI Card Row, Overview/Analytics Page, Email Volume-Over-Time Chart, dashboard/components/CategoryBreakdownChart.tsx, dashboard/components/VolumeChart.tsx (charts/VolumeChart.tsx per design.md), Web Dashboard (Phase 5) Spec (+6 more)

### Community 22 - "Navigation Shell Spec & Tasks"
Cohesion: 0.19
Nodes (14): Navigation Shell (Sidebar + Top Bar), Settings/Preferences Page, dashboard/app/layout.tsx, dashboard/app/settings/page.tsx, dashboard/components/CommandPalette.tsx, dashboard/components/Sidebar.tsx, dashboard/components/TopBar.tsx, FR1: Persistent Navigation Shell (+6 more)

### Community 23 - "Sync Clock & Popover UI"
Cohesion: 0.20
Nodes (8): ClockFace(), LABELS, round3(), SyncClock(), Popover(), PopoverContent(), PopoverTrigger(), formatRelativeToNow()

### Community 24 - "Inbox & Platform Badge UI"
Cohesion: 0.21
Nodes (9): InboxContent(), SAVED_VIEWS, FilterBar(), FilterState, confidenceEdge(), PlatformBadge(), RailCounts, Platform (+1 more)

### Community 25 - "Preferences & Settings State"
Cohesion: 0.19
Nodes (12): SettingsPage(), ConcourseBar(), Density, PreferencesContext, PreferencesContextValue, PreferencesProvider(), readStorage(), Theme (+4 more)

### Community 26 - "Concourse Bar & Sheet UI"
Cohesion: 0.21
Nodes (4): Sheet(), SheetContent(), SheetTitle(), lucide-react

### Community 28 - "Dashboard Data Query Helpers"
Cohesion: 0.32
Nodes (11): getBalance(), getBoardMessages(), getHandledMessages(), getInboxMessages(), getKpis(), getMessagesByPlatform(), getPlatformCounts(), getPriorityQueue() (+3 more)

### Community 29 - "Responsive & Accessibility Sweep"
Cohesion: 0.22
Nodes (11): Full Keyboard Operability, Responsive Design Down to 375px, dashboard/README.md, FR10: Keyboard Operability, NFR2: Stack Conventions (Server Components default), NFR5: Responsive Down to 375px, T13: Responsive and Dark-Mode Sweep, T14: Keyboard and Contrast Audit (+3 more)

### Community 30 - "Package Dependencies List"
Cohesion: 0.18
Nodes (11): dependencies, class-variance-authority, cmdk, cn, lucide-react, next, radix-ui, react (+3 more)

### Community 31 - "Table Polish & Inbox Row"
Cohesion: 0.27
Nodes (10): Table Polish (Sort/Filter/Bulk/Loading/Empty States), dashboard/app/inbox/page.tsx, dashboard/app/page.tsx, dashboard/components/ActionItemSidebar.tsx, dashboard/components/InboxRow.tsx, FR7: Inbox Sort/Filter/Bulk Actions, FR8: Empty States, FR9: Loading/Skeleton States (+2 more)

### Community 32 - "App Layout & Fonts Config"
Cohesion: 0.24
Nodes (6): archivo, archivoNarrow, metadata, Providers(), nextConfig, next

### Community 33 - "Overview Page Build Tasks"
Cohesion: 0.22
Nodes (9): dashboard/app/overview/page.tsx, dashboard/components/KpiCard.tsx, dashboard/lib/analytics.ts, dashboard/lib/data/fixtures.ts, dashboard/lib/format.ts, FR4: Expanded Fixture Data, T1: Expand Fixture Data, T11: Build KPI Cards and Overview Page Shell (+1 more)

### Community 34 - "Board Sheet & Priority Aspect"
Cohesion: 0.25
Nodes (5): LABELS, PriorityAspect(), Checkbox(), DropdownMenu(), DropdownMenuTrigger()

### Community 35 - "Delay Figure & Format Utils"
Cohesion: 0.36
Nodes (5): DelayFigure(), Flap(), Sla, DelayDisplay, formatDelay()

### Community 36 - "Input Group UI"
Cohesion: 0.28
Nodes (5): InputGroup(), InputGroupAddon(), inputGroupAddonVariants, InputGroupButton(), inputGroupButtonVariants

### Community 38 - "Dev Dependencies List"
Cohesion: 0.22
Nodes (9): devDependencies, eslint, eslint-config-next, tailwindcss, @tailwindcss/postcss, @types/node, @types/react, @types/react-dom (+1 more)

### Community 39 - "Drafts Provider & Fixtures"
Cohesion: 0.32
Nodes (6): DraftsContext, DraftsContextValue, DraftsProvider(), DRAFTS, getDrafts(), Draft

### Community 40 - "Action Items & Commitments Fixtures"
Cohesion: 0.25
Nodes (6): ACTION_ITEMS, AWAITING_REPLY, AwaitingReply, COMMITMENTS, daysAgo(), Commitment

### Community 41 - "Dark Mode & Contrast Spec"
Cohesion: 0.33
Nodes (6): Full Dark Mode Parity, WCAG AA Color Contrast (4.5:1), dashboard/app/globals.css, FR6: Full Dark Mode, NFR3: WCAG AA Contrast Requirement, T3: Dark Mode and Chart/KPI Color Tokens

### Community 42 - "Sync State Fixtures"
Cohesion: 0.33
Nodes (5): SYNC_STATE, SYNC_STATE_FAILED, SYNC_STATE_OFFLINE, SYNC_STATE_SYNCING, SyncState

### Community 43 - "Specclaw Workflow Config"
Cohesion: 0.33
Nodes (6): SpecClaw Configuration, Branch-per-Change Git Strategy, Dynamically Synthesized Per-Task Build Subagents, Autonomous Build-Verify-Review Loop (Loop Engineering), Model Routing Ladder (planning/coding/review), Party Mode (Adversarial Proposal Review Panel)

### Community 44 - "Package Scripts"
Cohesion: 0.40
Nodes (5): scripts, build, dev, lint, start

## Ambiguous Edges - Review These
- `Supabase access model — undecided (anon vs service-role key)` → `Web Dashboard`  [AMBIGUOUS]
  PRODUCT.md · relation: rationale_for
- `Daily Brief (feature idea)` → `digests table (optional, not built)`  [AMBIGUOUS]
  feature-ideas.md · relation: shares_data_with
- `The Departure Board (Direction Thesis)` → `Cyclorama Dawn (design raise source)`  [AMBIGUOUS]
  gmail-dashboard/.impeccable/surfaces/app.md · relation: references
- `The Departure Board (Direction Thesis)` → `Darkroom Safelight Bay (design raise source)`  [AMBIGUOUS]
  gmail-dashboard/.impeccable/surfaces/app.md · relation: references
- `The Departure Board (Direction Thesis)` → `Flash Scrawl Club Sleeve (design raise source)`  [AMBIGUOUS]
  gmail-dashboard/.impeccable/surfaces/app.md · relation: references
- `The Departure Board (Direction Thesis)` → `Iridescent Cloud Edge (design raise source)`  [AMBIGUOUS]
  gmail-dashboard/.impeccable/surfaces/app.md · relation: references
- `The Departure Board (Direction Thesis)` → `Streaming Title Wall (design raise source)`  [AMBIGUOUS]
  gmail-dashboard/.impeccable/surfaces/app.md · relation: references

## Knowledge Gaps
- **213 isolated node(s):** `SortKey`, `TONE_COLOR`, `TONES`, `LENGTHS`, `SNIPPETS` (+208 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 318 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Supabase access model — undecided (anon vs service-role key)` and `Web Dashboard`?**
  _Edge tagged AMBIGUOUS (relation: rationale_for) - confidence is low._
- **What is the exact relationship between `Daily Brief (feature idea)` and `digests table (optional, not built)`?**
  _Edge tagged AMBIGUOUS (relation: shares_data_with) - confidence is low._
- **What is the exact relationship between `The Departure Board (Direction Thesis)` and `Cyclorama Dawn (design raise source)`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **What is the exact relationship between `The Departure Board (Direction Thesis)` and `Darkroom Safelight Bay (design raise source)`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **What is the exact relationship between `The Departure Board (Direction Thesis)` and `Flash Scrawl Club Sleeve (design raise source)`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **What is the exact relationship between `The Departure Board (Direction Thesis)` and `Iridescent Cloud Edge (design raise source)`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **What is the exact relationship between `The Departure Board (Direction Thesis)` and `Streaming Title Wall (design raise source)`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._