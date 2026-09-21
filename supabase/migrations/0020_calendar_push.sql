-- 0020_calendar_push.sql
-- Closes the loop the other way: 0019 pulls calendar events into tasks,
-- this lets a task created in the hub (POST /api/action-items) push out to
-- the same Google Calendar, so it stays the one place that shows everything.

alter table tasks add column google_event_id text;

comment on column tasks.google_event_id is
  'Set by the push-to-calendar n8n workflow once a manually-created task with a due_at/starts_at has been written out as a Google Calendar event. Null for tasks never pushed (no due date, or extracted from email -- push is manual-add only, see push-to-calendar.json). Distinct from external_uid (0019): that is the ICS UID a task was PULLED in from; this is the event id a task was PUSHED out as.';
