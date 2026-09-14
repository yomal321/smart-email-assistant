-- 0009_tasks_enrichment.sql
-- Change 010-dashboard-actions-drafts-api (Dashboard Actions & Drafts API, Backend Phase 2 of 6)
-- Drops the one-task-per-email cap so Action Extraction and manual adds can
-- coexist, and adds the owner/priority/origin/confidence columns the
-- dashboard's Action items module already renders.
-- See .specclaw/changes/010-dashboard-actions-drafts-api/design.md, "Data Model Changes"
--
-- DEPLOYMENT NOTE: this migration and the accompanying edit to
-- n8n/workflows/action-extraction.json's "Write task" node (which drops that
-- node's now-invalid `ON CONFLICT (email_id) DO NOTHING` clause) must ship
-- together. Applying this migration without the workflow fix breaks every
-- subsequent Action Extraction write -- an ON CONFLICT clause naming a
-- column with no matching unique constraint is a runtime error, not a
-- no-op. See spec.md NFR5.

alter table tasks drop constraint tasks_email_id_key;

-- Manual action items (origin = 'manual') have no source email --
-- action-items-provider.tsx's addManual(text, dueDate) takes no message
-- reference. 0003's own comment frames the NOT NULL FK as a
-- hallucination-mitigation device specific to *extracted* tasks; that
-- rationale doesn't extend to a manually-typed item. Action Extraction's
-- write path always supplies a real email_id and is unaffected.
alter table tasks alter column email_id drop not null;

alter table tasks
  add column owner_name text,
  add column owner_email text,
  add column priority text not null default 'normal'
    check (priority in ('urgent', 'normal', 'low')),
  add column origin text not null default 'extracted'
    check (origin in ('extracted', 'manual')),
  add column confidence int;

comment on column tasks.email_id is
  'Nullable as of this migration -- null only for origin = ''manual'' rows. Action Extraction (005-action-items) always writes a real email_id; the hallucination-mitigation guarantee in this column''s original comment still holds for every origin = ''extracted'' row.';
comment on column tasks.owner_name is
  'Nullable; null renders as "you" in the dashboard (ActionItem.owner). No writer populates a non-null value in this phase.';
comment on column tasks.owner_email is
  'Nullable; see tasks.owner_name.';
comment on column tasks.priority is
  'Written as ''normal'' by Action Extraction and by manual adds in this phase (010-dashboard-actions-drafts-api). ''urgent''/''low'' are writable via PATCH /api/action-items/:id.';
comment on column tasks.origin is
  '''extracted'' for every row Action Extraction writes, ''manual'' for every row created via POST /api/action-items. Never written any other way.';
comment on column tasks.confidence is
  'Nullable; null for every origin = ''manual'' row (there is no extraction confidence to record). No writer populates this for origin = ''extracted'' rows in this phase -- reserved for a future phase that surfaces Action Extraction''s own confidence in its output.';

alter table tasks drop constraint tasks_status_check;
alter table tasks add constraint tasks_status_check
  check (status in ('todo', 'in-progress', 'done', 'dismissed'));

comment on column tasks.status is
  'Widened from open|done|dismissed (0003) to the dashboard''s Kanban vocabulary todo|in-progress|done|dismissed. Existing ''open'' rows are left as-is -- the API layer (GET /api/action-items) maps ''open'' to ''todo'' on read rather than rewriting historical data. No writer produces ''open'' after this migration.';
