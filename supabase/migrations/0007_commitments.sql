-- 0007_commitments.sql
-- Change 011-followups-contacts-api (Follow-ups & Contacts API, Backend Phase 3)
-- Adds the commitments and nudges tables.
-- See .specclaw/changes/011-followups-contacts-api/design.md, "Data Model Changes"

-- Deploy together with 0006_threads_and_contacts.sql and the email-normaliser.json
-- edit in the same wave — commitments.counterparty_id references contacts(id)
-- (created by 0006), and that workflow edit writes to these new tables.
create table commitments (
  id uuid primary key default gen_random_uuid(),
  email_id uuid not null references emails(id),
  direction text not null check (direction in ('you-promised','promised-to-you')),
  text text not null,
  trigger_sentence text not null,
  counterparty_id uuid references contacts(id),
  due_date date,
  status text not null default 'open' check (status in ('open','met','missed')),
  confidence int not null,
  created_at timestamptz not null default now()
);

create table nudges (
  id uuid primary key default gen_random_uuid(),
  commitment_id uuid references commitments(id),
  email_id uuid references emails(id),
  body text not null,
  sent_at timestamptz
);
