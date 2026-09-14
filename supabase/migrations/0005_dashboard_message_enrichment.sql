-- 0005_dashboard_message_enrichment.sql
-- Change 009-dashboard-messages-api (Dashboard Messages API, Backend Phase 1 of 6)
-- Adds the columns the dashboard's Inbox, Board Sheet, Review queue, and
-- Overview already render but nothing in the schema backs yet: platform,
-- confidence, priority/priority_score, reasons, tone, tldr, entities,
-- attachments, gmail_url, unread/starred/status/snooze/handled bookkeeping,
-- sla_target_hours, and Triage Pipeline's model/run bookkeeping.
-- Additive only -- emails.category and emails_category_check (0002) are
-- deliberately untouched (spec FR1, design Key Decision 1).
-- See .specclaw/changes/009-dashboard-messages-api/design.md, "Data Model Changes"

alter table emails
  add column platform            text,
  add column confidence          int,
  add column priority            text check (priority in ('urgent','normal','low')),
  add column priority_score      int,
  add column reasons             jsonb,
  add column tone                text check (tone in ('tense','neutral','warm')),
  add column tone_evidence       text,
  add column tldr                text,
  add column entities            jsonb,
  add column attachments         jsonb,
  add column gmail_url            text,
  add column is_unread           boolean not null default true,
  add column is_starred          boolean not null default false,
  add column status              text not null default 'open'
                                 check (status in ('open','archived','snoozed','done')),
  add column snoozed_until       timestamptz,
  add column handled_at          timestamptz,
  add column handled_action      text check (handled_action in ('archived','done','snoozed')),
  add column sla_target_hours    int,
  add column model_run           text,
  add column processed_at        timestamptz,
  add column is_from_user        boolean not null default false;

alter table emails add constraint emails_platform_check
  check (platform is null or platform in
    ('needs-reply','meeting','invoice','fyi','newsletter','automated','spam-ish'));

comment on column emails.platform is
  'Dashboard-facing 7-value classification, distinct from and independent of category (emails_category_check, 0002). Written only by Triage Pipeline (009-dashboard-messages-api); null means not yet triaged or triage_error is set.';
comment on column emails.confidence is
  'Model-written only (Triage Pipeline), 0-100. Set to 100 by PATCH /api/messages/:id/platform on a human reassignment (spec FR8) -- a manual override is a certain signal.';
comment on column emails.priority is
  'Model-written only (Triage Pipeline). Null until triaged, same convention as platform.';
comment on column emails.priority_score is
  'Model-written only (Triage Pipeline), 0-100.';
comment on column emails.reasons is
  'Model-written only (Triage Pipeline); jsonb array of short strings, empty array (not null) when the model finds none.';
comment on column emails.tone is
  'Model-written only (Triage Pipeline).';
comment on column emails.tone_evidence is
  'Model-written only (Triage Pipeline); nullable, the model may return no supporting quote.';
comment on column emails.tldr is
  'Model-written only (Triage Pipeline); nullable -- only long threads get one (spec FR3).';
comment on column emails.entities is
  'Model-written only (Triage Pipeline); jsonb object with dates/amounts/people/links/addresses arrays, each defaulting to empty rather than omitted.';
comment on column emails.attachments is
  'Honest placeholder (spec FR2): column exists for a later phase, but nothing in 009-dashboard-messages-api writes a non-null value -- Gmail MIME data, not something an LLM infers from subject/body.';
comment on column emails.gmail_url is
  'Not written by this change; reserved for a future ingestion-time link to the message in Gmail.';
comment on column emails.is_unread is
  'Dashboard read/unread state, defaulting true. Not written by Triage Pipeline; mutated by the dashboard API (future read/unread routes) once built.';
comment on column emails.is_starred is
  'Dashboard star state, defaulting false. Written by PATCH /api/messages/:id/star (spec FR8).';
comment on column emails.status is
  'Dashboard workflow state. Written by the mutation routes -- POST /api/messages/archive|done|snooze|restore (spec FR8) -- never by Triage Pipeline.';
comment on column emails.snoozed_until is
  'Set by POST /api/messages/snooze, cleared by /restore (spec FR8). Null otherwise.';
comment on column emails.handled_at is
  'Set by the archive/done/snooze mutation routes, cleared by /restore (spec FR8).';
comment on column emails.handled_action is
  'Mirrors the mutation route that last handled this row (archive/done/snooze); cleared by /restore (spec FR8).';
comment on column emails.sla_target_hours is
  'Honest placeholder (spec FR2): stays null in this phase per proposal.md''s already-resolved open question. sla.state reads as "ontime" whenever this is null.';
comment on column emails.model_run is
  'Set by Triage Pipeline''s "Write triage success" node to the model id llm-gateway.json actually called (spec FR5) -- not invented, read from that workflow.';
comment on column emails.processed_at is
  'Set by Triage Pipeline''s "Write triage success" node to now() on a successful triage write (spec FR5).';
comment on column emails.is_from_user is
  'Honest placeholder (spec FR2): stays false for every row this phase touches -- sent-mail ingestion is a later phase.';
