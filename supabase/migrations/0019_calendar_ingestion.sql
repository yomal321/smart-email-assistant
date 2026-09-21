-- 0019_calendar_ingestion.sql
-- Backs the ICS ingestion pipeline: each source (Work / two universities)
-- gets a subscribable feed URL, and tasks written from a feed need a dedup
-- key the way email-extracted tasks already dedupe on `email_id`.
--
-- Additive only. Every existing row stays valid: ics_url/last_synced_at are
-- nullable (a source with no feed configured yet), external_uid is nullable
-- (every pre-existing task is email/manual, not feed-derived).

alter table sources add column ics_url text;
alter table sources add column last_synced_at timestamptz;

comment on column sources.ics_url is
  'ICS subscription feed URL for this source (university LMS or work calendar). Null until set via PATCH /api/sources/:id. Polled by the ics-sync n8n workflow.';
comment on column sources.last_synced_at is
  'Set by the ics-sync n8n workflow after each successful pull of this source''s feed. Null means never synced (or ics_url is unset).';

alter table tasks add column external_uid text;

comment on column tasks.external_uid is
  'The ICS VEVENT UID for a feed-derived task. Null for email-extracted or manually-typed rows, which dedupe on email_id instead. Paired with source_id (tasks_source_external_uid_idx) since UIDs are only unique within one feed.';

create unique index tasks_source_external_uid_idx
  on tasks (source_id, external_uid) where external_uid is not null;
