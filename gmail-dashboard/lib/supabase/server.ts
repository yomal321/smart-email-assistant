// Server-only Supabase client. The service-role key must never reach a
// client bundle — importing `server-only` turns an accidental import from
// a "use client" file into a build failure instead of a silent leak.
// See design.md Key Decision 1 and spec.md AC9.
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export class SupabaseConfigError extends Error {
  constructor(missingVar: string) {
    super(`${missingVar} is not set. Configure it in the server environment before using the Supabase client.`);
    this.name = "SupabaseConfigError";
  }
}

let cachedClient: SupabaseClient | null = null;

// Constructs (and caches) a Supabase client from SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY. Throws SupabaseConfigError, naming the missing
// variable, the first time it's called without one of them set — never a
// generic Supabase SDK stack trace.
export function getSupabaseServerClient(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new SupabaseConfigError("SUPABASE_URL");
  if (!serviceRoleKey) throw new SupabaseConfigError("SUPABASE_SERVICE_ROLE_KEY");

  cachedClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });

  return cachedClient;
}
