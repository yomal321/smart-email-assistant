// Deny-by-default auth guard (spec.md FR6, design.md Key Decision 5). Every
// request is checked against the FR2 session cookie except the two
// allow-listed paths below — `/login` (so an unauthenticated user can reach
// the login page) and `/api/auth/login` (so they can actually log in).
// Page requests without a valid session redirect to `/login`; `/api/**`
// requests without a valid session return 401 JSON with no page body.
//
// verifySession() already treats a missing, malformed, unsigned, or expired
// token as "no session" and returns null rather than throwing — so a
// present-but-invalid cookie is handled identically to an absent one here,
// never a 500 (spec.md AC11). A missing SESSION_SECRET is a server
// misconfiguration, not a cookie problem, and is allowed to propagate as a
// thrown SessionConfigError rather than being swallowed.
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySession } from "@/lib/auth/session";

const ALLOWED_PATHS = new Set(["/login", "/api/auth/login"]);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (ALLOWED_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySession(token);

  if (session) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return NextResponse.redirect(new URL("/login", request.url));
}

// Runs on every request except Next.js's own static asset paths — those
// aren't "page requests" or "/api/** requests" in FR6's sense, and gating
// them would break the login page's own CSS/JS before a session can even
// be established.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
