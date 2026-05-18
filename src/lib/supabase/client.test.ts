import { afterEach, describe, expect, it, vi } from "vitest";
import { hasSupabaseConfig } from "./client";

describe("supabase client config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts Supabase's current publishable key variable name", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

    expect(hasSupabaseConfig()).toBe(true);
  });

  it("keeps backward compatibility with anon key variable name", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-test");

    expect(hasSupabaseConfig()).toBe(true);
  });

  it("requires both URL and a browser-safe key", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

    expect(hasSupabaseConfig()).toBe(false);
  });
});
