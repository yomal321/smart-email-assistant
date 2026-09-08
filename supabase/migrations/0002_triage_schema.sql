-- 0002_triage_schema.sql
-- Change 004-triage (Triage, Phase 2)
-- Adds Triage Pipeline's output columns and makes the category taxonomy a database-enforced constraint.
-- See .specclaw/changes/004-triage/design.md, "Data Model Changes"

alter table emails add column summary text;         -- nullable; model-written only, never by ingestion
alter table emails add column triage_error text;     -- nullable; set only on a failed/rejected triage attempt

comment on column emails.summary is
  'Written only by Triage Pipeline (004-triage). Ingestion + Email Normaliser never write this column.';
comment on column emails.triage_error is
  'Set only when Triage Pipeline''s attempt fails or is rejected (FR7). Null means either not yet attempted or succeeded — check category to distinguish those two.';

alter table emails add constraint emails_category_check
  check (category is null or category in ('needs_reply', 'fyi', 'waiting_on_someone_else', 'promotional', 'low_priority'));
