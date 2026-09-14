-- 0008_drafts_enrichment.sql
-- Change 010-dashboard-actions-drafts-api (Dashboard Actions & Drafts API, Backend Phase 2 of 6)
-- Adds the tone/length/approval-history columns the dashboard's Drafts
-- module already renders.
-- See .specclaw/changes/010-dashboard-actions-drafts-api/design.md, "Data Model Changes"

alter table drafts
  add column generated_body text,
  add column tone text check (tone in ('formal', 'friendly', 'brief', 'firm')),
  add column length text check (length in ('brief', 'standard', 'detailed')),
  add column approved_at timestamptz,
  add column edit_distance int;

comment on column drafts.generated_body is
  'The LLM''s raw output at generation time, immutable -- draft_body is the editable copy (identical to this on first insert). Feeds the commit-view diff and PATCH /api/drafts/:id''s edit_distance computation. Written by n8n/workflows/draft-generation.json''s "Write draft" node (010-dashboard-actions-drafts-api); null for every pre-existing row (no way to reconstruct an original for a draft written before this column existed).';
comment on column drafts.tone is
  'Requested tone for this generation (formal|friendly|brief|firm), written once at generation time by draft-generation.json. Null for pre-existing rows.';
comment on column drafts.length is
  'Requested length for this generation (brief|standard|detailed), written once at generation time by draft-generation.json. Null for pre-existing rows.';
comment on column drafts.approved_at is
  'Set once, by POST /api/drafts/:id/status when status transitions to ''approved'' -- never moved on a subsequent call with the same status. Null until then.';
comment on column drafts.edit_distance is
  'Word-level distance between the current draft_body and generated_body, recomputed by PATCH /api/drafts/:id on every body edit (010-dashboard-actions-drafts-api). Feeds the approval-history table''s "Edited" column. Null until the first edit.';

alter table drafts drop constraint drafts_status_check;
alter table drafts add constraint drafts_status_check
  check (status in ('pending', 'approved', 'sent', 'discarded'));

comment on column drafts.status is
  'Widened from pending|sent|discarded (0004) to include ''approved'' -- the dashboard''s commit-view step between editing and sending. Written by POST /api/drafts/:id/status.';
