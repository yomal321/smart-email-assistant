-- 0004_draft_generation_schema.sql
-- Change 006-draft-generation (Draft Generation, Phase 4)
-- Creates the drafts table (architect/04-data-model.md's flagged Phase 4 decision)
-- and adds Draft Generation's failure-visibility column on emails.
-- See .specclaw/changes/006-draft-generation/design.md, "Data Model Changes"

create table drafts (
  id uuid primary key default gen_random_uuid(),
  email_id uuid not null references emails(id),
  draft_body text not null,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'discarded')),  -- provisional; only 'pending' written in this phase
  created_at timestamptz not null default now()
  -- deliberately NO unique constraint on email_id: multiple drafts per email is
  -- the point (regeneration), bounded instead by the application-level cap (FR4),
  -- not a database constraint -- unlike tasks.email_id in 005-action-items.
);

comment on column drafts.email_id is
  'Mandatory FK, never optional. No uniqueness constraint -- unlike tasks.email_id, multiple drafts per email are expected (regeneration); the application-level cap (FR4) bounds this, not the schema.';
comment on column drafts.status is
  'Written only by Draft Generation, always as ''pending'' in this phase. ''sent''/''discarded'' are provisional values for Phase 5''s Draft Review Modal to write later.';

alter table emails add column draft_generation_error text;  -- nullable; set only on a failed/rejected generation attempt (FR11)

comment on column emails.draft_generation_error is
  'Written only by Draft Generation (006-draft-generation), set only when a generation attempt fails (LLM Gateway error, timeout, or malformed response). Same per-email failure-visibility convention as emails.triage_error and emails.action_extraction_error.';