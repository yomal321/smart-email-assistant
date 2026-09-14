// POST /api/auth/logout -- FR5. Clears the FR2 session cookie (empty value,
// Max-Age=0) and returns 200. No password/session check here: logging out
// an already-unauthenticated caller is a harmless no-op, not an error.
import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS } from "@/lib/auth/session";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    ...SESSION_COOKIE_OPTIONS,
    maxAge: 0,
  });
  return response;
}
