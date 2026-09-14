-- 0006_threads_and_contacts.sql
-- Change 011-followups-contacts-api (Follow-ups & Contacts API, Backend Phase 3)
-- Adds emails.is_from_user, thread_entries, contacts, contact_tone_history, and the contact_aggregates view.
-- See .specclaw/changes/011-followups-contacts-api/design.md, "Data Model Changes"

-- Deploy together with the email-normaliser.json edit in the same wave (spec NFR5) —
-- these tables/column must exist before that workflow's new write nodes run,
-- or every subsequent ingested email fails outright.
alter table emails
  add column is_from_user boolean not null default false;

create table thread_entries (
  id uuid primary key default gen_random_uuid(),
  email_id uuid not null references emails(id),
  author_is_you boolean not null,
  author_name text not null,
  at timestamptz not null,
  gist text not null
);

create table contacts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  name text, email text not null, domain text, avatar_url text,
  is_vip boolean not null default false,
  unique (account_id, email)
);

create table contact_tone_history (
  contact_id uuid not null references contacts(id),
  month date not null,
  tone text not null check (tone in ('tense','neutral','warm')),
  primary key (contact_id, month)
);

-- Joins on the 'address' key, matching the shape email-normaliser.json's
-- Normalize node actually writes into emails.participants ({role, name,
-- address} per element) -- not 'email', which no participant object uses.
create view contact_aggregates as
  select
    c.id as contact_id,
    count(e.id) as message_count,
    max(e.received_at) as last_contact_at
  from contacts c
  left join emails e
    on e.participants @> jsonb_build_array(jsonb_build_object('address', c.email))
  group by c.id;
-- yourAvgReplyHours / openThreadIds are computed in contact-mapping.ts (a later
-- task), not here — reply-pairing logic doesn't belong in a group-by view.
