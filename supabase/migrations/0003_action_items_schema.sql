-- 0003_action_items_schema.sql
-- Change 005-action-items (Action Items, Phase 3)
-- Creates the tasks table sketched in architect/04-data-model.md and adds
-- Action Extraction's failure-visibility column on emails.
-- See .specclaw/changes/005-action-items/design.md, "Data Model Changes"

create table tasks (
  id uuid primary key default gen_random_uuid(),
  email_id uuid not null references emails(id),
  task_text text not null,
  deadline date,                          -- nullable; most action items won't state one
  status text not null default 'open'
    check (status in ('open', 'done', 'dismissed')),  -- provisional; only 'open' written in this phase
  created_at timestamptz not null default now(),
  unique (email_id)                        -- at most one task per email (FR10); backs the ON CONFLICT DO NOTHING guard (FR7)
);

comment on column tasks.email_id is
  'Mandatory FK, never optional -- the hallucination mitigation per architect/04-data-model.md: every task is always checkable against its source email.';
comment on column tasks.status is
  'Written only by Action Extraction, always as ''open'' in this phase. ''done''/''dismissed'' are provisional values for Phase 5''s Action Item Sidebar to write later.';

alter table emails add column action_extraction_error text;  -- nullable; set only on a failed/rejected extraction attempt (FR8)

comment on column emails.action_extraction_error is
  'Written only by Action Extraction (005-action-items), set only when an extraction attempt fails or is rejected (FR6/FR8). Null and no tasks row means either a clean "no action item" result (FR9) or not yet attempted -- these are not distinguished in this phase; see spec.md Notes.';
