import { describe, expect, it } from "vitest";
import { bothPlayersRequestedRestart, canSubmitMove, resolvePlayerColor, swappedPlayersForNextGame } from "./room-rules";

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

  it("requires both restart requests and swaps colors for the next game", () => {
    expect(bothPlayersRequestedRestart({ restart_black: true, restart_white: false })).toBe(false);
    expect(bothPlayersRequestedRestart({ restart_black: true, restart_white: true })).toBe(true);
    expect(swappedPlayersForNextGame(room)).toEqual({
      black_player: "white-id",
      white_player: "black-id"
    });
  });
});
