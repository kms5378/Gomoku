"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  PRESENCE_HEARTBEAT_MS,
  canClaimForfeit,
  getOpponentPlayerId,
  millisecondsUntilForfeit
} from "@/src/lib/forfeit";
import { buildBoardFromMoves, detectWinner, getForbiddenBlackMove, type StoneColor } from "@/src/lib/gomoku";
import { canChooseSide } from "@/src/lib/room-rules";
import { playStoneSound } from "@/src/lib/sound";
import { ensureAnonymousSession, getSupabaseClient, hasSupabaseConfig, normalizeRpcRow } from "@/src/lib/supabase/client";
import type { MoveRecord, ProfileRecord, RoomPresenceRecord, RoomRecord } from "@/src/lib/types";
import { type ForbiddenBoardCell, GomokuBoard } from "./GomokuBoard";

const NICKNAME_KEY = "gomoku:nickname";

type ProfileMap = Record<string, ProfileRecord>;
type PresenceMap = Record<string, RoomPresenceRecord>;

export function RoomClient({ code }: { code: string }) {
  const client = useMemo(() => getSupabaseClient(), []);
  const [nickname, setNickname] = useState("");
  const [nicknameLoaded, setNicknameLoaded] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomRecord | null>(null);
  const [moves, setMoves] = useState<MoveRecord[]>([]);
  const [profiles, setProfiles] = useState<ProfileMap>({});
  const [presenceByPlayer, setPresenceByPlayer] = useState<PresenceMap>({});
  const [isJoining, setIsJoining] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isClaimingForfeit, setIsClaimingForfeit] = useState(false);
  const [choosingSide, setChoosingSide] = useState<StoneColor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const joinAttemptedRef = useRef(false);
  const lastForfeitClaimAtRef = useRef(0);

  const normalizedCode = code.toUpperCase();

  const refreshRoom = useCallback(
    async (roomId?: string) => {
      if (!client) {
        return;
      }

      const roomQuery = client.from("rooms").select("*");
      const roomResponse = roomId
        ? await roomQuery.eq("id", roomId).single()
        : await roomQuery.eq("code", normalizedCode).single();

      if (roomResponse.error) {
        throw new Error(roomResponse.error.message);
      }

      const nextRoom = roomResponse.data as RoomRecord;
      setRoom(nextRoom);

      const movesResponse = await client
        .from("moves")
        .select("*")
        .eq("room_id", nextRoom.id)
        .eq("game_index", nextRoom.game_index)
        .order("move_number", { ascending: true });

      if (movesResponse.error) {
        throw new Error(movesResponse.error.message);
      }

      setMoves((movesResponse.data ?? []) as MoveRecord[]);

      const profileIds = [nextRoom.black_player, nextRoom.white_player].filter(Boolean) as string[];

      if (profileIds.length > 0) {
        const profilesResponse = await client.from("profiles").select("*").in("id", profileIds);

        if (profilesResponse.error) {
          throw new Error(profilesResponse.error.message);
        }

        setProfiles(
          Object.fromEntries(((profilesResponse.data ?? []) as ProfileRecord[]).map((profile) => [profile.id, profile]))
        );
      }

      const presenceResponse = await client.from("room_presence").select("*").eq("room_id", nextRoom.id);

      if (presenceResponse.error) {
        setPresenceByPlayer({});
      } else {
        setPresenceByPlayer(
          Object.fromEntries(
            ((presenceResponse.data ?? []) as RoomPresenceRecord[]).map((presence) => [presence.player_id, presence])
          )
        );
      }
    },
    [client, normalizedCode]
  );

  const joinRoom = useCallback(
    async (name: string) => {
      if (!client) {
        return;
      }

      setError(null);
      setIsJoining(true);

      try {
        const session = await ensureAnonymousSession(client);
        setUserId(session.user.id);
        const cleanNickname = name.trim() || "Guest";
        window.localStorage.setItem(NICKNAME_KEY, cleanNickname);
        setNickname(cleanNickname);

        const { data, error: rpcError } = await client.rpc("join_room", {
          p_code: normalizedCode,
          p_nickname: cleanNickname
        });

        if (rpcError) {
          throw new Error(rpcError.message);
        }

        const joinedRoom = normalizeRpcRow<RoomRecord>(data as RoomRecord | RoomRecord[] | null);

        if (!joinedRoom) {
          throw new Error("Room join returned no room.");
        }

        await refreshRoom(joinedRoom.id);
      } catch (joinError) {
        joinAttemptedRef.current = false;
        setError(joinError instanceof Error ? joinError.message : "방에 입장하지 못했습니다.");
      } finally {
        setIsJoining(false);
      }
    },
    [client, normalizedCode, refreshRoom]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setNickname(window.localStorage.getItem(NICKNAME_KEY) ?? "");
      setNicknameLoaded(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!nicknameLoaded || !nickname.trim() || joinAttemptedRef.current || !client) {
      return;
    }

    joinAttemptedRef.current = true;
    void joinRoom(nickname);
  }, [client, joinRoom, nickname, nicknameLoaded]);

  useEffect(() => {
    if (!client || !room?.id) {
      return;
    }

    const channel = client
      .channel(`room:${room.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms", filter: `id=eq.${room.id}` }, () => {
        void refreshRoom(room.id).catch((subscriptionError) => {
          setError(subscriptionError instanceof Error ? subscriptionError.message : "방 상태를 갱신하지 못했습니다.");
        });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "moves", filter: `room_id=eq.${room.id}` }, () => {
        void refreshRoom(room.id).catch((subscriptionError) => {
          setError(subscriptionError instanceof Error ? subscriptionError.message : "착수 상태를 갱신하지 못했습니다.");
        });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "room_presence", filter: `room_id=eq.${room.id}` }, () => {
        void refreshRoom(room.id).catch((subscriptionError) => {
          setError(subscriptionError instanceof Error ? subscriptionError.message : "접속 상태를 갱신하지 못했습니다.");
        });
      })
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [client, refreshRoom, room?.id]);

  const board = useMemo(() => buildBoardFromMoves(moves), [moves]);
  const lastMove = moves.at(-1);
  const winningLine =
    room?.status === "finished" && lastMove
      ? detectWinner(board, { row: lastMove.row, col: lastMove.col, color: lastMove.color })?.line
      : undefined;
  const myColor = resolvePlayerColor(room, userId);
  const canPlay = Boolean(room && myColor && room.status === "playing" && room.current_turn === myColor && !isSubmitting);
  const opponentId = getOpponentPlayerId(room, myColor);
  const opponentLastSeenAt = opponentId ? (presenceByPlayer[opponentId]?.last_seen_at ?? null) : null;
  const remainingForfeitMs = millisecondsUntilForfeit(opponentLastSeenAt, nowMs);
  const opponentConnectionMessage = connectionText(room, myColor, opponentLastSeenAt, remainingForfeitMs, isClaimingForfeit);
  const forbiddenCells = useMemo<ForbiddenBoardCell[]>(() => {
    if (!room || myColor !== "black" || room.status !== "playing" || room.current_turn !== "black") {
      return [];
    }

    const cells: ForbiddenBoardCell[] = [];

    for (let row = 0; row < board.length; row += 1) {
      for (let col = 0; col < board[row].length; col += 1) {
        if (board[row][col] !== null) {
          continue;
        }

        const reason = getForbiddenBlackMove(board, { row, col, color: "black" });

        if (reason) {
          cells.push({ row, col, reason });
        }
      }
    }

    return cells;
  }, [board, myColor, room]);

  const touchPresence = useCallback(async () => {
    if (!client || !room || room.status !== "playing" || !myColor) {
      return;
    }

    const { error: presenceError } = await client.rpc("touch_room_presence", {
      p_code: room.code
    });

    if (presenceError) {
      throw new Error(presenceError.message);
    }
  }, [client, myColor, room]);

  useEffect(() => {
    if (room?.status !== "playing") {
      return;
    }

    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);

    return () => window.clearInterval(timer);
  }, [room?.status]);

  useEffect(() => {
    if (!room || room.status !== "playing" || !myColor) {
      return;
    }

    const runTouchPresence = () => {
      void touchPresence().catch((presenceError) => {
        setError(presenceError instanceof Error ? presenceError.message : "접속 상태를 갱신하지 못했습니다.");
      });
    };
    const touchWhenVisible = () => {
      if (document.visibilityState === "visible") {
        runTouchPresence();
      }
    };

    runTouchPresence();
    const timer = window.setInterval(runTouchPresence, PRESENCE_HEARTBEAT_MS);
    window.addEventListener("visibilitychange", touchWhenVisible);
    window.addEventListener("focus", runTouchPresence);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("visibilitychange", touchWhenVisible);
      window.removeEventListener("focus", runTouchPresence);
    };
  }, [myColor, room, touchPresence]);

  useEffect(() => {
    if (
      !client ||
      !room ||
      !canClaimForfeit({ room, myColor, opponentLastSeenAt, nowMs, isClaiming: isClaimingForfeit }) ||
      nowMs - lastForfeitClaimAtRef.current < PRESENCE_HEARTBEAT_MS
    ) {
      return;
    }

    lastForfeitClaimAtRef.current = nowMs;
    setIsClaimingForfeit(true);

    async function claimForfeitWin() {
      if (!client || !room) {
        return;
      }

      try {
        const { data, error: rpcError } = await client.rpc("claim_forfeit_win", {
          p_code: room.code
        });

        if (rpcError) {
          throw new Error(rpcError.message);
        }

        const nextRoom = normalizeRpcRow<RoomRecord>(data as RoomRecord | RoomRecord[] | null);
        await refreshRoom(nextRoom?.id ?? room.id);
      } catch (claimError) {
        setError(claimError instanceof Error ? claimError.message : "상대 이탈 패배 판정을 처리하지 못했습니다.");
      } finally {
        setIsClaimingForfeit(false);
      }
    }

    void claimForfeitWin();
  }, [client, isClaimingForfeit, myColor, nowMs, opponentLastSeenAt, refreshRoom, room]);

  async function submitMove(row: number, col: number) {
    if (!client || !room || !canPlay || !myColor) {
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const forbiddenReason = getForbiddenBlackMove(board, { row, col, color: myColor });

      if (forbiddenReason) {
        throw new Error(forbiddenReason === "double-three" ? "흑 3x3 금수입니다." : "흑 4x4 금수입니다.");
      }

      const { error: rpcError } = await client.rpc("submit_move", {
        p_code: room.code,
        p_row: row,
        p_col: col
      });

      if (rpcError) {
        throw new Error(rpcError.message);
      }

      playStoneSound();
      await refreshRoom(room.id);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "착수하지 못했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function requestRestart() {
    if (!client || !room) {
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const { data, error: rpcError } = await client.rpc("request_restart", {
        p_code: room.code
      });

      if (rpcError) {
        throw new Error(rpcError.message);
      }

      const nextRoom = normalizeRpcRow<RoomRecord>(data as RoomRecord | RoomRecord[] | null);
      await refreshRoom(nextRoom?.id ?? room.id);
    } catch (restartError) {
      setError(restartError instanceof Error ? restartError.message : "재시작 요청을 처리하지 못했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function chooseSide(side: StoneColor) {
    if (!client || !room || !canChooseSide({ room, side, userId, isChoosing: choosingSide !== null })) {
      return;
    }

    setError(null);
    setChoosingSide(side);

    try {
      const { data, error: rpcError } = await client.rpc("choose_side", {
        p_code: room.code,
        p_side: side
      });

      if (rpcError) {
        throw new Error(rpcError.message);
      }

      const nextRoom = normalizeRpcRow<RoomRecord>(data as RoomRecord | RoomRecord[] | null);
      await refreshRoom(nextRoom?.id ?? room.id);
    } catch (sideError) {
      setError(sideError instanceof Error ? sideError.message : "흑/백 선택을 처리하지 못했습니다.");
    } finally {
      setChoosingSide(null);
    }
  }

  if (!hasSupabaseConfig()) {
    return (
      <main className="roomLayout">
        <div className="notice" role="status">
          Supabase 환경 변수가 필요합니다. `NEXT_PUBLIC_SUPABASE_URL`과
          `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`를 설정한 뒤 다시 배포하세요.
        </div>
      </main>
    );
  }

  if (nicknameLoaded && !nickname.trim()) {
    return (
      <main className="roomLayout compact">
        <section className="homePanel">
          <h1>방 {normalizedCode}</h1>
          <label className="fieldLabel" htmlFor="roomNickname">
            닉네임
          </label>
          <input
            className="textInput"
            id="roomNickname"
            maxLength={24}
            onChange={(event) => setNickname(event.target.value)}
            placeholder="플레이어 이름"
            value={nickname}
          />
          <button className="primaryButton" disabled={isJoining || !nickname.trim()} onClick={() => joinRoom(nickname)} type="button">
            입장
          </button>
          {error ? (
            <p className="errorText" role="alert">
              {error}
            </p>
          ) : null}
        </section>
      </main>
    );
  }

  const blackProfile = room?.black_player ? profiles[room.black_player] : null;
  const whiteProfile = room?.white_player ? profiles[room.white_player] : null;

  return (
    <main className="roomLayout">
      <header className="roomHeader">
        <div>
          <nav className="topLinks" aria-label="방 이동">
            <Link className="backLink" href="/">
              로비
            </Link>
            <Link className="backLink" href="/ranking">
              랭킹
            </Link>
          </nav>
          <h1>방 {normalizedCode}</h1>
        </div>
        <div className={`statusPill ${room?.status ?? "waiting"}`}>{statusText(room)}</div>
      </header>

      <section className="gameSurface">
        <aside className="scoreRail">
          <PlayerPanel
            canChoose={canChooseSide({ room, side: "black", userId, isChoosing: choosingSide !== null })}
            color="black"
            isChoosing={choosingSide === "black"}
            isCurrentTurn={room?.status === "playing" && room.current_turn === "black"}
            isYou={myColor === "black"}
            onChooseSide={() => chooseSide("black")}
            profile={blackProfile}
          />
          <PlayerPanel
            canChoose={canChooseSide({ room, side: "white", userId, isChoosing: choosingSide !== null })}
            color="white"
            isChoosing={choosingSide === "white"}
            isCurrentTurn={room?.status === "playing" && room.current_turn === "white"}
            isYou={myColor === "white"}
            onChooseSide={() => chooseSide("white")}
            profile={whiteProfile}
          />
          {room?.status === "finished" ? (
            <button className="primaryButton" disabled={isSubmitting} onClick={requestRestart} type="button">
              재시작 요청
            </button>
          ) : null}
        </aside>

        <div className="boardColumn">
          <GomokuBoard
            board={board}
            disabled={!canPlay}
            forbiddenCells={forbiddenCells}
            lastMove={lastMove}
            onPlaceStone={submitMove}
            winningCells={winningLine}
          />
          <p className="turnText">{turnText(room, myColor)}</p>
          {opponentConnectionMessage ? <p className="connectionText">{opponentConnectionMessage}</p> : null}
          {error ? (
            <p className="errorText" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function PlayerPanel({
  canChoose,
  color,
  isChoosing,
  isCurrentTurn,
  isYou,
  onChooseSide,
  profile
}: {
  canChoose: boolean;
  color: StoneColor;
  isChoosing: boolean;
  isCurrentTurn: boolean;
  isYou: boolean;
  onChooseSide: () => void;
  profile: ProfileRecord | null;
}) {
  return (
    <div className={`playerPanel ${color}${isCurrentTurn ? " active" : ""}`}>
      <div className="playerIdentity">
        <span className={`miniStone ${color}`} />
        <div>
          <p className="playerName">
            {profile?.nickname ?? "대기 중"}
            {isYou ? " · 나" : ""}
          </p>
          <p className="playerMeta">{color === "black" ? "흑" : "백"}</p>
        </div>
      </div>
      <div className="ratingBlock">
        <strong>{profile?.rating ?? 0}</strong>
        <span>승점</span>
      </div>
      <p className="recordText">
        {profile ? `${profile.wins}승 ${profile.losses}패 ${profile.draws}무` : "자리 비어 있음"}
      </p>
      {canChoose ? (
        <button className="sideButton" disabled={isChoosing} onClick={onChooseSide} type="button">
          {isChoosing ? "선택 중" : `${color === "black" ? "흑" : "백"} 선택`}
        </button>
      ) : null}
    </div>
  );
}

function resolvePlayerColor(room: RoomRecord | null, userId: string | null): StoneColor | null {
  if (!room || !userId) {
    return null;
  }

  if (room.black_player === userId) {
    return "black";
  }

  if (room.white_player === userId) {
    return "white";
  }

  return null;
}

function statusText(room: RoomRecord | null): string {
  if (!room) {
    return "연결 중";
  }

  if (room.status === "waiting") {
    return "자리 선택";
  }

  if (room.status === "finished") {
    return room.winner ? `${room.winner === "black" ? "흑" : "백"} 승리` : "무승부";
  }

  return `${room.current_turn === "black" ? "흑" : "백"} 차례`;
}

function turnText(room: RoomRecord | null, myColor: StoneColor | null): string {
  if (!room) {
    return "방 정보를 불러오는 중입니다.";
  }

  if (room.status === "waiting") {
    return "흑/백 자리를 선택하세요. 양쪽이 채워지면 바로 시작됩니다.";
  }

  if (room.status === "finished") {
    if (room.restart_black || room.restart_white) {
      return "양쪽 모두 재시작을 누르면 같은 코드로 새 판이 시작됩니다.";
    }

    return "승패가 결정되었습니다. 재시작으로 같은 방에서 다시 대전할 수 있습니다.";
  }

  if (!myColor) {
    return "이 방에 참가한 플레이어만 착수할 수 있습니다.";
  }

  return room.current_turn === myColor ? "내 차례입니다." : "상대 차례입니다.";
}

function connectionText(
  room: RoomRecord | null,
  myColor: StoneColor | null,
  opponentLastSeenAt: string | null,
  remainingForfeitMs: number | null,
  isClaimingForfeit: boolean
): string | null {
  if (!room || room.status !== "playing" || !myColor) {
    return null;
  }

  if (isClaimingForfeit || remainingForfeitMs === 0) {
    return "상대 연결이 끊겨 패배 처리 중입니다.";
  }

  if (!opponentLastSeenAt) {
    return "상대 접속 상태를 확인하는 중입니다.";
  }

  if (remainingForfeitMs !== null && remainingForfeitMs <= 5_000) {
    return `상대 연결이 불안정합니다. ${Math.ceil(remainingForfeitMs / 1000)}초 후 이탈 패배 처리됩니다.`;
  }

  return null;
}
