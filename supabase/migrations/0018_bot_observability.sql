-- 0018_bot_observability.sql
-- Backs the /bot page's expanded build (BOT-PAGE-PLAN.md options B1 and B2).
-- Additive/widening only: one CHECK constraint is replaced with a wider one
-- (no existing row is touched or invalidated -- every value already in the
-- table is still valid under the new list), and one new table is added.

-- B1: log the two daily digests too. 012-assistant-bot's FR15 deliberately
-- gave Morning Brief and Evening Review no bot_notifications row, because a
-- once-daily Schedule Trigger needs no dedup key to protect against
-- re-firing. That reasoning is still correct -- these two values get no
-- unique index, unlike urgent_alert/deadline_nudge above. But "needs no
-- dedup" isn't the same as "shouldn't be recorded": without a row, the
-- /bot page's activity log and stats can only ever see half of what the
-- bot actually sends. Logging is for observability, not correctness.
alter table bot_notifications drop constraint bot_notifications_notification_type_check;
alter table bot_notifications add constraint bot_notifications_notification_type_check
  check (notification_type in ('urgent_alert', 'deadline_nudge', 'morning_brief', 'evening_review'));

comment on column bot_notifications.notification_type is
  'urgent_alert/deadline_nudge are deduplicated per (type, email_id|task_id) -- see bot_notifications_urgent_alert_uidx / bot_notifications_deadline_nudge_uidx (0014). morning_brief/evening_review (0018) are logged once per successful send with no dedup key: the Schedule Trigger already fires at most once per day (012-assistant-bot FR15), so a duplicate here would mean two genuine sends, not a re-fire to guard against.';

-- B2: persist FR8's free-text daily cap. It currently lives only in
-- assistant-brain.json's workflow static data (`Check free-text cap` /
-- `Increment counter and reply`), which the dashboard cannot read and which
-- does not survive an n8n cold start (a known weakness the original design
-- accepted for a v1). This table is the persisted equivalent.
create table bot_free_text_usage (
  usage_date date primary key,
  count int not null default 0
);

comment on table bot_free_text_usage is
  'One row per UTC calendar day (matching Check free-text cap''s existing UTC bucket, not settings.timezone -- this is a soft usage budget, not a user-facing "today" calculation). Upserted only by assistant-brain.json; read by GET /api/hub/bot-stats to show remaining daily budget. A missing row for today means zero questions asked today, not an error.';
