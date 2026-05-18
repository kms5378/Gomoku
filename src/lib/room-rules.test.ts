import { describe, expect, it } from "vitest";
import { bothPlayersRequestedRestart, canChooseSide, canSubmitMove, resolvePlayerColor, swappedPlayersForNextGame } from "./room-rules";

const room = {
  black_player: "black-id",
  white_player: "white-id",
  status: "playing" as const,
  current_turn: "black" as const,
  restart_black: false,
  restart_white: false
};

describe("room rules", () => {
  it("resolves player colors", () => {
    expect(resolvePlayerColor(room, "black-id")).toBe("black");
    expect(resolvePlayerColor(room, "white-id")).toBe("white");
    expect(resolvePlayerColor(room, "other-id")).toBeNull();
  });

  it("allows only the current player to submit a move", () => {
    expect(canSubmitMove({ room, myColor: "black", isSubmitting: false })).toBe(true);
    expect(canSubmitMove({ room, myColor: "white", isSubmitting: false })).toBe(false);
    expect(canSubmitMove({ room, myColor: "black", isSubmitting: true })).toBe(false);
    expect(canSubmitMove({ room: { ...room, status: "finished" }, myColor: "black", isSubmitting: false })).toBe(false);
  });

  it("allows side selection only in waiting rooms with an open target side", () => {
    expect(
      canChooseSide({
        room: { ...room, status: "waiting", black_player: null, white_player: null },
        side: "black",
        userId: "player-id",
        isChoosing: false
      })
    ).toBe(true);
    expect(
      canChooseSide({
        room: { ...room, status: "waiting", black_player: "black-id", white_player: null },
        side: "white",
        userId: "other-id",
        isChoosing: false
      })
    ).toBe(true);
    expect(
      canChooseSide({
        room: { ...room, status: "waiting", black_player: "black-id", white_player: null },
        side: "white",
        userId: "black-id",
        isChoosing: false
      })
    ).toBe(true);
    expect(
      canChooseSide({
        room: { ...room, status: "waiting", black_player: "black-id", white_player: null },
        side: "black",
        userId: "other-id",
        isChoosing: false
      })
    ).toBe(false);
    expect(
      canChooseSide({
        room: { ...room, status: "playing", black_player: null, white_player: null },
        side: "black",
        userId: "player-id",
        isChoosing: false
      })
    ).toBe(false);
    expect(
      canChooseSide({
        room: { ...room, status: "waiting", black_player: null, white_player: null },
        side: "black",
        userId: "player-id",
        isChoosing: true
      })
    ).toBe(false);
    expect(
      canChooseSide({
        room: { ...room, status: "waiting", black_player: "black-id", white_player: null },
        side: "black",
        userId: "black-id",
        isChoosing: false
      })
    ).toBe(false);
    expect(
      canChooseSide({
        room: { ...room, status: "waiting", black_player: null, white_player: null },
        side: "black",
        userId: null,
        isChoosing: false
      })
    ).toBe(false);
  });

  it("requires both restart requests and swaps colors for the next game", () => {
    expect(bothPlayersRequestedRestart({ restart_black: true, restart_white: false })).toBe(false);
    expect(bothPlayersRequestedRestart({ restart_black: true, restart_white: true })).toBe(true);
    expect(swappedPlayersForNextGame(room)).toEqual({
      black_player: "white-id",
      white_player: "black-id"
    });
  });
});
