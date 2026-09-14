// POST /api/auth/login -- the one route middleware.ts allow-lists alongside
// /login itself (spec.md FR6). Checks DASHBOARD_LOGIN_SECRET (the single
// operator's shared secret, an env var -- not a database row, NFR4) and, on
// match, sets the FR2 session cookie via signSession().
//
// FR4's global rate cap mirrors n8n/workflows/draft-generation.json's
// "Check cooldown" / "Verify secret" pair in spirit (a from-scratch TS port,
// not a copy of the n8n JSON): failures are recorded in a rolling 5-minute
// window; once 10 land in that window, a 5-minute cooldown trips and
// rejects *every* request -- including ones with the correct password --
// until it elapses (spec.md AC5). The counter is in-memory only, so it is a
// best-effort deterrent that can reset on a serverless cold start
// (design.md Risks) -- the real defense is the secret's strength.
import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { signSession, SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS, SESSION_DURATION_SECONDS } from "@/lib/auth/session";

const FAILURE_WINDOW_MS = 5 * 60 * 1000;
const FAILURE_THRESHOLD = 10;

// Module-level state -- survives across requests within one warm instance,
// same caveat as draft-generation's workflow static data (design.md Risks).
let failureTimestamps: number[] = [];
let cooldownUntil = 0;

function recordFailureAndMaybeTripCooldown(now: number): void {
  failureTimestamps.push(now);
  failureTimestamps = failureTimestamps.filter((ts) => now - ts < FAILURE_WINDOW_MS);
  if (failureTimestamps.length >= FAILURE_THRESHOLD) {
    cooldownUntil = now + FAILURE_WINDOW_MS;
  }
}

// NFR2: constant-time-equivalent comparison, mirroring
// 006-draft-generation's "Verify secret" node exactly -- hash both sides to
// fixed-length SHA-256 digests first so timingSafeEqual (which throws on a
// length mismatch) always receives equal-length buffers and no raw secret
// value or length leaks through timing. Fails closed if either side is
// empty (misconfigured DASHBOARD_LOGIN_SECRET or no password sent) rather
// than letting two empty strings hash-match.
function passwordsMatch(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  const providedHash = crypto.createHash("sha256").update(provided).digest();
  const expectedHash = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(providedHash, expectedHash);
}

export async function POST(request: NextRequest) {
  const now = Date.now();

  // FR4/AC5: reached before any password check, so an active cooldown
  // rejects every request -- even one carrying the correct password.
  if (now < cooldownUntil) {
    return NextResponse.json({ error: "too many attempts, try again later" }, { status: 429 });
  }

  let password = "";
  try {
    const body: unknown = await request.json();
    if (body && typeof body === "object" && typeof (body as { password?: unknown }).password === "string") {
      password = (body as { password: string }).password;
    }
  } catch {
    // Malformed/missing JSON body -- treat exactly like a wrong password,
    // not a 500 (mirrors the "never a 500 on bad input" convention used
    // throughout this project's other auth boundary, 006-draft-generation).
  }

  const expected = process.env.DASHBOARD_LOGIN_SECRET || "";

  if (!passwordsMatch(password, expected)) {
    recordFailureAndMaybeTripCooldown(now);
    return NextResponse.json({ error: "invalid password" }, { status: 401 });
  }

  // FR3: fixed 24h expiry from issuance.
  const token = await signSession({ exp: Math.floor(now / 1000) + SESSION_DURATION_SECONDS });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    ...SESSION_COOKIE_OPTIONS,
    maxAge: SESSION_DURATION_SECONDS,
  });
  return response;
}
