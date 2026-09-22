-- 0022_bot_messages.sql
-- Conversation memory for the bot's free-text path (assistant-brain.json's
-- 'Read recent turns' / 'Log turns'). Without it every message is answered in
-- isolation, so a follow-up -- "and the second one?", "when is that due?" --
-- has nothing to resolve against, which is the main thing that makes the bot
-- read as a command console rather than a chat.
--
-- Only free-text turns are stored. The deterministic command branches
-- (/today, /urgent, ...) answer from the database directly and need no
-- history, so logging them would cost writes and prompt tokens for nothing.

create table bot_messages (
  id bigserial primary key,
  chat_id text not null,                                  -- same string form as bot_notifications.chat_id (0014)
  role text not null check (role in ('user', 'assistant')),
  text text not null,
  created_at timestamptz not null default now()
);

comment on table bot_messages is
  'Free-text chat transcript, newest 6 rows per chat replayed into the free-text prompt. Written only on a successful answer (same rule as bot_free_text_usage, 0018): a failed answer is not a turn worth remembering. Unbounded today -- at the free-text cap of 10 questions/day this grows ~20 rows/day, so pruning is a retention-sweep.json job to add when it actually matters, not a constraint to design around now.';

-- The only read is "newest N for this chat", so the index matches it exactly.
create index bot_messages_chat_recent_idx on bot_messages (chat_id, created_at desc);
