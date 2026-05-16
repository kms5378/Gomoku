import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "supabase/migrations/202605160001_init_gomoku.sql"), "utf8");

describe("supabase migration contract", () => {
  it("defines the required room tables and RPCs", () => {
    expect(migration).toContain("create table if not exists public.profiles");
    expect(migration).toContain("create table if not exists public.rooms");
    expect(migration).toContain("create table if not exists public.moves");
    expect(migration).toContain("create table if not exists public.game_results");
    expect(migration).toContain("create or replace function public.create_room");
    expect(migration).toContain("create or replace function public.join_room");
    expect(migration).toContain("create or replace function public.submit_move");
    expect(migration).toContain("create or replace function public.request_restart");
  });

  it("guards important edge cases in the database layer", () => {
    expect(migration).toContain("Room is full.");
    expect(migration).toContain("It is not your turn.");
    expect(migration).toContain("Cell is already occupied.");
    expect(migration).toContain("Game is not active.");
    expect(migration).toContain("Move is outside the board.");
    expect(migration).toContain("rating = rating + 3");
    expect(migration).toContain("rating = rating + 1");
  });
});
