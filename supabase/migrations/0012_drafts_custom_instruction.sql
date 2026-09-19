-- 0012_drafts_custom_instruction.sql
-- Adds the "Custom" tone: a free-text instruction the mailbox owner writes to
-- steer one specific reply ("ask them to push the deadline to Monday, be
-- apologetic"), instead of picking one of the four preset tones.
--
-- Deploy BEFORE the matching n8n/workflows/draft-generation.json edit. That
-- workflow's "Write draft" node inserts tone='custom' + custom_instruction;
-- run in the other order and every generation fails the tone CHECK with a 502.

alter table drafts drop constraint drafts_tone_check;
alter table drafts add constraint drafts_tone_check
  check (tone in ('formal', 'friendly', 'brief', 'firm', 'custom'));

alter table drafts
  add column custom_instruction text;

comment on column drafts.tone is
  'Requested tone for this generation (formal|friendly|brief|firm|custom), written once at generation time by draft-generation.json. Widened from the 0008 four-value set to include ''custom'', which draws its direction from custom_instruction instead of a preset. Null for pre-existing rows.';
comment on column drafts.custom_instruction is
  'The mailbox owner''s free-text direction for this one generation, written once at generation time by draft-generation.json, and non-null only when tone = ''custom''. Persisted (not merely passed through) so a regenerated draft stays self-describing after a reload -- otherwise a custom draft is indistinguishable from its preset-tone siblings with no visible reason for the difference. Bounded to 500 characters at the workflow boundary, and wrapped in its own <<<USER_INSTRUCTION_START/END>>> delimiters in the prompt so it can steer the reply without overriding the standing rules.';
