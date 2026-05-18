import { describe, expect, it } from "vitest";
import { FORFEIT_GRACE_MS, canClaimForfeit, getOpponentPlayerId, millisecondsUntilForfeit } from "./forfeit";

const room = {
  status: "playing" as const,
  black_player: "black-id",
  white_player: "white-id"
};

describe("forfeit rules", () => {
  it("resolves the opponent from the current player's color", () => {
    expect(getOpponentPlayerId(room, "black")).toBe("white-id");
    expect(getOpponentPlayerId(room, "white")).toBe("black-id");
    expect(getOpponentPlayerId(room, null)).toBeNull();
  });

  it("allows a forfeit claim only after the opponent heartbeat is stale", () => {
    const nowMs = Date.parse("2026-05-19T12:00:20.000Z");
    const staleLastSeenAt = "2026-05-19T12:00:04.000Z";
    const freshLastSeenAt = "2026-05-19T12:00:10.000Z";

    expect(canClaimForfeit({ room, myColor: "black", opponentLastSeenAt: staleLastSeenAt, nowMs, isClaiming: false })).toBe(true);
    expect(canClaimForfeit({ room, myColor: "black", opponentLastSeenAt: freshLastSeenAt, nowMs, isClaiming: false })).toBe(false);
    expect(canClaimForfeit({ room, myColor: "black", opponentLastSeenAt: staleLastSeenAt, nowMs, isClaiming: true })).toBe(false);
    expect(canClaimForfeit({ room: { ...room, status: "finished" }, myColor: "black", opponentLastSeenAt: staleLastSeenAt, nowMs, isClaiming: false })).toBe(false);
    expect(canClaimForfeit({ room, myColor: null, opponentLastSeenAt: staleLastSeenAt, nowMs, isClaiming: false })).toBe(false);
    expect(canClaimForfeit({ room, myColor: "black", opponentLastSeenAt: null, nowMs, isClaiming: false })).toBe(false);
  });

  it("calculates the remaining grace period for a connected opponent", () => {
    const nowMs = Date.parse("2026-05-19T12:00:10.000Z");
    const lastSeenAt = "2026-05-19T12:00:00.000Z";

    expect(millisecondsUntilForfeit(lastSeenAt, nowMs)).toBe(FORFEIT_GRACE_MS - 10_000);
    expect(millisecondsUntilForfeit(lastSeenAt, nowMs + FORFEIT_GRACE_MS)).toBe(0);
  });
});
