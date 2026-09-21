// PATCH /api/courses/:id — edit a course, or retire it at semester end via
// isActive: false (0016_life_load.sql: courses_source_id_idx already filters
// on is_active for pickers). No DELETE — mirrors sources.ts's reasoning:
// retiring in place preserves the course_id link on any tasks that reference it.
//
// Auth is enforced by middleware.ts (deny-by-default) before this handler
// ever runs — this route does not re-check the session cookie itself.
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { mapCourseRowToCourse, type CourseRow } from "@/lib/data/course-mapping";

const SELECT_COLUMNS = "id, source_id, code, name, semester, is_active";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);

  const update: Record<string, unknown> = {};

  if (body?.code !== undefined) {
    if (typeof body.code !== "string" || body.code.trim().length === 0) {
      return NextResponse.json({ error: "code must be a non-empty string" }, { status: 400 });
    }
    update.code = body.code.trim();
  }
  if (body?.name !== undefined) {
    if (typeof body.name !== "string" || body.name.trim().length === 0) {
      return NextResponse.json({ error: "name must be a non-empty string" }, { status: 400 });
    }
    update.name = body.name.trim();
  }
  if (body?.semester !== undefined) {
    if (body.semester !== null && typeof body.semester !== "string") {
      return NextResponse.json({ error: "semester must be a string or null" }, { status: 400 });
    }
    update.semester = body.semester;
  }
  if (body?.isActive !== undefined) {
    if (typeof body.isActive !== "boolean") {
      return NextResponse.json({ error: "isActive must be a boolean" }, { status: 400 });
    }
    update.is_active = body.isActive;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "at least one of code, name, semester, isActive is required" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from("courses").update(update).eq("id", id).select(SELECT_COLUMNS).maybeSingle();

  if (error) {
    return NextResponse.json({ error: "failed to update course" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "course not found" }, { status: 404 });
  }

  const course = mapCourseRowToCourse(data as unknown as CourseRow);
  return NextResponse.json(course);
}
