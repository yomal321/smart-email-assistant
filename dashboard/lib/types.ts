// Mirrors supabase/migrations/0001-0004. Field names and enum values match the
// live schema exactly so swapping fixtures for a real Supabase read later is a
// drop-in change, not a reshape.

export type EmailCategory =
  | "needs_reply"
  | "fyi"
  | "waiting_on_someone_else"
  | "promotional"
  | "low_priority";

export interface Participant {
  role: "from" | "to" | "cc";
  name: string;
  address: string;
}

export interface Email {
  id: string;
  provider: "gmail";
  subject: string;
  body: string;
  participants: Participant[];
  category: EmailCategory | null;
  summary: string | null;
  received_at: string;
}

export type TaskStatus = "open" | "done" | "dismissed";

export interface Task {
  id: string;
  email_id: string;
  task_text: string;
  deadline: string | null;
  status: TaskStatus;
}

export type DraftStatus = "pending" | "sent" | "discarded";

export interface Draft {
  id: string;
  email_id: string;
  draft_body: string;
  status: DraftStatus;
  created_at: string;
}
