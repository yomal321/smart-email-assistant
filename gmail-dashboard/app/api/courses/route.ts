// GET/POST /api/courses — the course list and manual creation, backing
// app/(hub)/courses/page.tsx. Mirrors app/api/plans/route.ts's shape.
//
// Auth is enforced by middleware.ts (deny-by-default) before this handler
// ever runs — this route does not re-check the session cookie itself.
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { mapCourseRowToCourse, type CourseRow } from "@/lib/data/course-mapping";

const SELECT_COLUMNS = "id, source_id, code, name, semester, is_active";

export async function GET() {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from("courses").select(SELECT_COLUMNS).order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "failed to read courses" }, { status: 500 });
  }

  const courses = ((data ?? []) as unknown as CourseRow[]).map(mapCourseRowToCourse);
  return NextResponse.json(courses);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const sourceId: unknown = body?.sourceId;
  const code: unknown = body?.code;
  const name: unknown = body?.name;
  const semester: unknown = body?.semester ?? null;

  if (typeof sourceId !== "string" || sourceId.trim().length === 0) {
    return NextResponse.json({ error: "sourceId must be a non-empty string" }, { status: 400 });
  }
  if (typeof code !== "string" || code.trim().length === 0) {
    return NextResponse.json({ error: "code must be a non-empty string" }, { status: 400 });
  }
  if (typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "name must be a non-empty string" }, { status: 400 });
  }
  if (semester !== null && typeof semester !== "string") {
    return NextResponse.json({ error: "semester must be a string or null" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("courses")
    .insert({ source_id: sourceId, code: code.trim(), name: name.trim(), semester })
    .select(SELECT_COLUMNS)
    .single();

  if (error) {
    return NextResponse.json({ error: "failed to create course" }, { status: 500 });
  }

  const course = mapCourseRowToCourse(data as unknown as CourseRow);
  return NextResponse.json(course);
}
