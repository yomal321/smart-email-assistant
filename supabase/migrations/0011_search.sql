-- Phase 4 of 6 (BACKEND-REQUIREMENTS.md §6) — backs GET /api/search.
-- `generated always as ... stored` instead of a trigger function: Postgres
-- maintains it on every insert/update to subject/body with no per-writer
-- wiring, covering the Normaliser and any future backfill job alike.
-- architect/04-data-model.md already documents this column; this migration
-- is what makes that line true. See PHASE-4-IMPLEMENTATION-PLAN.md Wave 1.

alter table emails add column search_vector tsvector
  generated always as (
    to_tsvector('english', coalesce(subject, '') || ' ' || coalesce(body, ''))
  ) stored;

create index emails_search_vector_idx on emails using gin (search_vector);
