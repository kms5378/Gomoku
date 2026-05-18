import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const initialMigration = readFileSync(join(process.cwd(), "supabase/migrations/202605160001_init_gomoku.sql"), "utf8");
const forbiddenMoveMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/202605180001_black_forbidden_moves.sql"),
  "utf8"
);
const sideSelectionMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/202605180002_choose_side.sql"),
  "utf8"
);
const migration = `${initialMigration}\n${forbiddenMoveMigration}\n${sideSelectionMigration}`;

describe("supabase migration contract", () => {
  it("defines the required room tables and RPCs", () => {
    expect(migration).toContain("create table if not exists public.profiles");
    expect(migration).toContain("create table if not exists public.rooms");
    expect(migration).toContain("create table if not exists public.moves");
    expect(migration).toContain("create table if not exists public.game_results");
    expect(migration).toContain("create or replace function public.create_room");
    expect(migration).toContain("create or replace function public.join_room");
    expect(migration).toContain("create or replace function public.choose_side");
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

  it("enforces black double-three and double-four forbidden moves", () => {
    expect(migration).toContain("create or replace function public.black_forbidden_reason");
    expect(migration).toContain("Black double-four is forbidden.");
    expect(migration).toContain("Black double-three is forbidden.");
    expect(migration).toContain("direction_has_open_three_threat");
    expect(migration).toContain("direction_has_four_threat");
  });

  it("lets players choose black or white before the game starts", () => {
    expect(migration).toContain("alter column black_player drop not null");
    expect(migration).toContain("insert into public.rooms (code)");
    expect(migration).toContain("p_side public.stone_color");
    expect(migration).toContain("Side can only be selected before the game starts.");
    expect(migration).toContain("Black side is already taken.");
    expect(migration).toContain("White side is already taken.");
    expect(migration).toContain("status = case");
    expect(migration).toContain("black_player is null or white_player is null");
    expect(migration).toContain("grant execute on function public.choose_side(text, public.stone_color) to authenticated");
  });
});
