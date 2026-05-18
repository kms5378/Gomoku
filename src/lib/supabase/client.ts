"use client";

import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

export function hasSupabaseConfig(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && getSupabaseBrowserKey());
}

export function getSupabaseClient(): SupabaseClient | null {
  if (!hasSupabaseConfig()) {
    return null;
  }

  browserClient ??= createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    getSupabaseBrowserKey() as string
  );

  return browserClient;
}

function getSupabaseBrowserKey(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

export async function ensureAnonymousSession(client: SupabaseClient): Promise<Session> {
  const {
    data: { session }
  } = await client.auth.getSession();

  if (session) {
    return session;
  }

  const { data, error } = await client.auth.signInAnonymously();

  if (error || !data.session) {
    throw new Error(error?.message ?? "Anonymous sign-in failed.");
  }

  return data.session;
}

export function normalizeRpcRow<T>(data: T | T[] | null): T | null {
  if (Array.isArray(data)) {
    return data[0] ?? null;
  }

  return data;
}
