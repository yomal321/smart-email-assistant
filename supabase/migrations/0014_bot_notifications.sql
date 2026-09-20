-- 0014_bot_notifications.sql
-- Change 012-assistant-bot (Personal Assistant Bot, Phase A)
-- Dedup log for the two per-entity proactive pushes (FR12 urgent/VIP alert,
-- FR13 deadline nudge). Morning Brief and Evening Review need no row here --
-- their Schedule Trigger already fires exactly once per day (FR15).
--
-- Shape follows nudges (0007_commitments.sql): a nullable FK per possible
-- source type, only one populated per row, rather than a generic polymorphic
-- (entity_type, entity_id) pair -- consistent with this project's preference
-- for typed nullable FKs over a polymorphic reference.

create table bot_notifications (
  id uuid primary key default gen_random_uuid(),
  channel text not null default 'telegram'
    check (channel in ('telegram', 'whatsapp')),  -- whatsapp reserved for a later phase; unused today
  chat_id text not null,
  notification_type text not null
    check (notification_type in ('urgent_alert', 'deadline_nudge')),
  email_id uuid references emails(id),  -- set for notification_type = 'urgent_alert'
  task_id uuid references tasks(id),    -- set for notification_type = 'deadline_nudge'
  sent_at timestamptz not null default now()
);

comment on column bot_notifications.email_id is
  'Nullable; populated only for urgent_alert rows. Mirrors nudges.email_id -- a row about one specific source, not a generic log line.';
comment on column bot_notifications.task_id is
  'Nullable; populated only for deadline_nudge rows. Mirrors nudges.commitment_id.';

-- A single composite UNIQUE(notification_type, chat_id, email_id, task_id)
-- would NOT enforce this dedup: Postgres treats every NULL as distinct from
-- every other NULL, so two urgent_alert rows (task_id always null on both)
-- would never collide on a plain UNIQUE constraint. Two partial unique
-- indexes, scoped by notification_type, sidestep that entirely -- each only
-- ever compares the one FK column that type actually populates.
create unique index bot_notifications_urgent_alert_uidx
  on bot_notifications (chat_id, email_id)
  where notification_type = 'urgent_alert';

create unique index bot_notifications_deadline_nudge_uidx
  on bot_notifications (chat_id, task_id)
  where notification_type = 'deadline_nudge';
