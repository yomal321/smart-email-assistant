// notes row -> Note mapper (spec.md FR2). One resource, one mapper — mirrors
// task-mapping.ts's convention rather than a shared "resource mapper"
// abstraction (design.md Key Decisions).
import "server-only";
import type { Note } from "@/lib/data/types";

export interface NoteRow {
  id: string;
  title: string | null;
  body: string;
  created_at: string;
  updated_at: string;
}

export function mapNoteRowToNote(row: NoteRow): Note {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
