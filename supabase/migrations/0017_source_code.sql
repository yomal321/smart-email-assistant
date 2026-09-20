-- Change B2 (Life Load Board). Additive only: one new not-null column with a
-- computed backfill, no existing column touched.
--
-- 0016 seeded three sources but gave the hub no way to render them without
-- colour alone (spec.md "never colour alone" — see gmail-dashboard/DESIGN.md,
-- which is the one rule from that doc still worth keeping even though its
-- colour system itself is stale). A source needs a short plate label the
-- same way a platform badge carries `NR`/`MT`/`IV` instead of just a colour.

alter table sources add column code text;

-- Backfill: first two letters of the name, uppercased. A real backfill so
-- every pre-existing row (the three 0016 seeds) is valid the moment this
-- migration runs, not left null waiting on a UI to fill it in.
update sources set code = upper(left(name, 2)) where code is null;

alter table sources alter column code set not null;

comment on column sources.code is
  'Two-letter plate label for SourcePlate (spec.md "never colour alone"). User-editable via PATCH /api/sources; defaults to the first two letters of the name at creation/backfill time.';
