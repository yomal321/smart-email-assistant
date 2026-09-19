// settings row <-> Settings mapper, both directions (GET maps a row to the
// camelCase shape the Settings page renders; PATCH maps a partial Settings
// update back to the snake_case columns to write).
import "server-only";
import type { Settings } from "@/lib/data/types";

export interface SettingsRow {
  account_id: string;
  signature: string | null;
  style_samples: string | null;
  summary_length: string;
  digest_enabled: boolean;
  digest_time: string | null;
  exclusion_rules: string[];
  retention_days: number | null;
  timezone: string;
  work_hours_start: string;
  work_hours_end: string;
  priority_weights: { vip: number; deadline: number; direct_question: number; age: number };
}

export function mapSettingsRowToSettings(row: SettingsRow): Settings {
  return {
    signature: row.signature,
    styleSamples: row.style_samples,
    summaryLength: row.summary_length as Settings["summaryLength"],
    digestEnabled: row.digest_enabled,
    digestTime: row.digest_time,
    exclusionRules: row.exclusion_rules ?? [],
    retentionDays: row.retention_days,
    timezone: row.timezone,
    workHoursStart: row.work_hours_start,
    workHoursEnd: row.work_hours_end,
    priorityWeights: {
      vip: row.priority_weights.vip,
      deadline: row.priority_weights.deadline,
      directQuestion: row.priority_weights.direct_question,
      age: row.priority_weights.age,
    },
  };
}

// Only the fields present in `partial` are mapped — PATCH /api/settings
// writes exactly what the caller sent, never the untouched fields back to
// their current value (a `Partial` update, not a round-trip GET+set).
export function mapSettingsToUpdate(partial: Partial<Settings>): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  if ("signature" in partial) update.signature = partial.signature;
  if ("styleSamples" in partial) update.style_samples = partial.styleSamples;
  if ("summaryLength" in partial) update.summary_length = partial.summaryLength;
  if ("digestEnabled" in partial) update.digest_enabled = partial.digestEnabled;
  if ("digestTime" in partial) update.digest_time = partial.digestTime;
  if ("exclusionRules" in partial) update.exclusion_rules = partial.exclusionRules;
  if ("retentionDays" in partial) update.retention_days = partial.retentionDays;
  if ("timezone" in partial) update.timezone = partial.timezone;
  if ("workHoursStart" in partial) update.work_hours_start = partial.workHoursStart;
  if ("workHoursEnd" in partial) update.work_hours_end = partial.workHoursEnd;
  if (partial.priorityWeights) {
    update.priority_weights = {
      vip: partial.priorityWeights.vip,
      deadline: partial.priorityWeights.deadline,
      direct_question: partial.priorityWeights.directQuestion,
      age: partial.priorityWeights.age,
    };
  }
  return update;
}
