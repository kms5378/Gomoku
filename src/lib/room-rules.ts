import type { StoneColor } from "./gomoku";
import type { RoomRecord } from "./types";

export function resolvePlayerColor(room: Pick<RoomRecord, "black_player" | "white_player">, userId: string): StoneColor | null {
  if (room.black_player === userId) {
    return "black";
  }

  if (room.white_player === userId) {
    return "white";
  }

  return null;
}

export function canSubmitMove({
  room,
  myColor,
  isSubmitting
}: {
  room: Pick<RoomRecord, "status" | "current_turn">;
  myColor: StoneColor | null;
  isSubmitting: boolean;
}): boolean {
  return Boolean(myColor && room.status === "playing" && room.current_turn === myColor && !isSubmitting);
}

export function bothPlayersRequestedRestart(room: Pick<RoomRecord, "restart_black" | "restart_white">): boolean {
  return room.restart_black && room.restart_white;
}

export function swappedPlayersForNextGame(room: Pick<RoomRecord, "black_player" | "white_player">): {
  black_player: string | null;
  white_player: string;
} {
  return {
    black_player: room.white_player,
    white_player: room.black_player
  };
}
