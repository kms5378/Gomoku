import type { StoneColor } from "./gomoku";
import type { RoomRecord } from "./types";

export const FORFEIT_GRACE_MS = 15_000;
export const PRESENCE_HEARTBEAT_MS = 5_000;

type ForfeitRoom = Pick<RoomRecord, "status" | "black_player" | "white_player">;

export function getOpponentPlayerId(room: Pick<RoomRecord, "black_player" | "white_player"> | null, myColor: StoneColor | null): string | null {
  if (!room || !myColor) {
    return null;
  }

  return myColor === "black" ? room.white_player : room.black_player;
}

export function millisecondsUntilForfeit(lastSeenAt: string | null, nowMs: number): number | null {
  if (!lastSeenAt) {
    return null;
  }

  const elapsedMs = nowMs - Date.parse(lastSeenAt);

  return Math.max(0, FORFEIT_GRACE_MS - elapsedMs);
}

export function canClaimForfeit({
  room,
  myColor,
  opponentLastSeenAt,
  nowMs,
  isClaiming
}: {
  room: ForfeitRoom | null;
  myColor: StoneColor | null;
  opponentLastSeenAt: string | null;
  nowMs: number;
  isClaiming: boolean;
}): boolean {
  if (!room || room.status !== "playing" || !myColor || isClaiming) {
    return false;
  }

  return millisecondsUntilForfeit(opponentLastSeenAt, nowMs) === 0;
}
