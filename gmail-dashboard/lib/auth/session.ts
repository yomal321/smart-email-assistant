// Session signing/verification for the single-operator dashboard session.
//
// Uses the Web Crypto API (`crypto.subtle`) instead of Node's `crypto`
// module so the exact same code runs identically in Next.js Edge Middleware
// (no Node builtins) and in Node-runtime Route Handlers — see spec.md FR2
// and design.md's Risk 2 ("Edge middleware's restricted runtime silently
// breaking auth"). `crypto`, `TextEncoder`/`TextDecoder`, and `atob`/`btoa`
// are all standard Web APIs available in both runtimes; `Buffer` is not,
// which is why base64url (de)coding below goes through `atob`/`btoa`
// instead.
//
// The token itself is a signed payload — `{ exp }` only, no user id or
// roles (there is exactly one operator) — encoded as
// `<base64url(payload)>.<base64url(HMAC-SHA256 signature)>`.
// `crypto.subtle.verify()` does the signature comparison, which gives the
// constant-time-equivalent check spec.md NFR2 asks for without hand-rolling
// one, mirroring 006-draft-generation's "verify via a primitive that
// doesn't leak timing, not a manual comparison" convention.

export class SessionConfigError extends Error {
  constructor(missingVar: string) {
    super(`${missingVar} is not set. Configure it in the server environment before using sessions.`);
    this.name = "SessionConfigError";
  }
}

export interface SessionPayload {
  exp: number; // unix seconds
}

export const SESSION_COOKIE_NAME = "session";

// FR3: sessions are fixed at 24h from issuance.
export const SESSION_DURATION_SECONDS = 60 * 60 * 24;

// Base options shared by every place that sets or clears the session
// cookie. `maxAge` is intentionally not included here — login sets it to
// SESSION_DURATION_SECONDS and logout sets it to 0, so it belongs at the
// call site, not baked into a shared constant.
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  secure: process.env.NODE_ENV === "production",
} as const;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

let cachedKeyPromise: Promise<CryptoKey> | null = null;

// Imports (and caches) the HMAC-SHA256 signing/verification key derived
// from SESSION_SECRET. Throws SessionConfigError, naming the missing
// variable, the first time it's called without one set.
function getSigningKey(): Promise<CryptoKey> {
  if (cachedKeyPromise) return cachedKeyPromise;

  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new SessionConfigError("SESSION_SECRET");

  cachedKeyPromise = crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );

  return cachedKeyPromise;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Signs { exp } into a `<payload>.<signature>` token.
export async function signSession(payload: SessionPayload): Promise<string> {
  const key = await getSigningKey();
  const payloadB64 = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadB64));
  const signatureB64 = base64UrlEncode(new Uint8Array(signature));
  return `${payloadB64}.${signatureB64}`;
}

// Verifies a session token and returns its payload, or null if the token is
// missing, malformed, unsigned by us, or expired — a present-but-invalid
// token is always treated as "no session", never thrown (see spec.md's
// "expired" and "tampered" Edge Cases, and AC11).
export async function verifySession(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, signatureB64] = parts;

  // Resolved outside the try/catch below: a missing SESSION_SECRET is a
  // server misconfiguration, not an invalid cookie, so SessionConfigError
  // is allowed to propagate rather than being swallowed into "no session" —
  // same reasoning as getSupabaseServerClient()'s config errors.
  const key = await getSigningKey();

  try {
    const signatureBytes = base64UrlDecode(signatureB64);
    // Cast needed because @types/node's Uint8Array augmentation widens its
    // default buffer type param to ArrayBufferLike, which lib.dom's
    // BufferSource (ArrayBuffer-only) then rejects — a types-only mismatch,
    // not a runtime one; the bytes underneath are a plain ArrayBuffer.
    const valid = await crypto.subtle.verify("HMAC", key, signatureBytes as BufferSource, encoder.encode(payloadB64));
    if (!valid) return null;

    const payload: unknown = JSON.parse(decoder.decode(base64UrlDecode(payloadB64)));
    if (
      typeof payload !== "object" ||
      payload === null ||
      typeof (payload as { exp?: unknown }).exp !== "number"
    ) {
      return null;
    }

    const { exp } = payload as SessionPayload;
    if (exp <= Math.floor(Date.now() / 1000)) return null;

    return { exp };
  } catch {
    // Malformed base64, malformed JSON, etc. — treat exactly like an
    // invalid signature, not a server error.
    return null;
  }
}
