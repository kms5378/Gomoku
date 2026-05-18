import { describe, expect, it } from "vitest";
import { formatWinRate, rankProfiles } from "./ranking";
import type { ProfileRecord } from "./types";

function profile(overrides: Partial<ProfileRecord> & Pick<ProfileRecord, "id" | "nickname">): ProfileRecord {
  return {
    rating: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    ...overrides
  };
}

describe("ranking", () => {
  it("sorts by rating, wins, draws, fewer losses, and nickname", () => {
    const ranked = rankProfiles([
      profile({ id: "a", nickname: "Beta", rating: 12, wins: 3, draws: 0, losses: 2 }),
      profile({ id: "b", nickname: "Alpha", rating: 15, wins: 2, draws: 1, losses: 3 }),
      profile({ id: "c", nickname: "Delta", rating: 15, wins: 3, draws: 0, losses: 4 }),
      profile({ id: "d", nickname: "Gamma", rating: 15, wins: 3, draws: 1, losses: 5 }),
      profile({ id: "e", nickname: "Echo", rating: 15, wins: 3, draws: 1, losses: 2 }),
      profile({ id: "f", nickname: "Bravo", rating: 15, wins: 3, draws: 1, losses: 2 })
    ]);

    expect(ranked.map((entry) => entry.id)).toEqual(["f", "e", "d", "c", "b", "a"]);
    expect(ranked.map((entry) => entry.rank)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("adds games, win rate, and current-user marker", () => {
    const [entry] = rankProfiles([profile({ id: "me", nickname: "Me", wins: 3, losses: 1, draws: 1 })], "me");

    expect(entry.games).toBe(5);
    expect(entry.winRate).toBe(60);
    expect(entry.isCurrentUser).toBe(true);
  });

  it("formats win rate safely when no games were played", () => {
    expect(formatWinRate(0)).toBe("0%");
    expect(formatWinRate(66.666)).toBe("66.7%");
  });
});
