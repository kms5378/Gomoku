"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { buildBoardFromMoves, detectWinner, getForbiddenBlackMove, type StoneColor } from "@/src/lib/gomoku";
import { playStoneSound } from "@/src/lib/sound";
import { ensureAnonymousSession, getSupabaseClient, hasSupabaseConfig, normalizeRpcRow } from "@/src/lib/supabase/client";
import type { MoveRecord, ProfileRecord, RoomRecord } from "@/src/lib/types";
import { GomokuBoard } from "./GomokuBoard";

const NICKNAME_KEY = "gomoku:nickname";

type ProfileMap = Record<string, ProfileRecord>;

export function RoomClient({ code }: { code: string }) {
  const client = useMemo(() => getSupabaseClient(), []);
  const [nickname, setNickname] = useState("");
  const [nicknameLoaded, setNicknameLoaded] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomRecord | null>(null);
  const [moves, setMoves] = useState<MoveRecord[]>([]);
  const [profiles, setProfiles] = useState<ProfileMap>({});
  const [isJoining, setIsJoining] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const joinAttemptedRef = useRef(false);

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
          <Link className="backLink" href="/">
            로비
          </Link>
          <h1>방 {normalizedCode}</h1>
        </div>
        <div className={`statusPill ${room?.status ?? "waiting"}`}>{statusText(room)}</div>
      </header>

      <section className="gameSurface">
        <aside className="scoreRail">
          <PlayerPanel color="black" isCurrentTurn={room?.current_turn === "black"} isYou={myColor === "black"} profile={blackProfile} />
          <PlayerPanel color="white" isCurrentTurn={room?.current_turn === "white"} isYou={myColor === "white"} profile={whiteProfile} />
          {room?.status === "finished" ? (
            <button className="primaryButton" disabled={isSubmitting} onClick={requestRestart} type="button">
              재시작 요청
            </button>
          ) : null}
        </aside>

        <div className="boardColumn">
          <GomokuBoard board={board} disabled={!canPlay} onPlaceStone={submitMove} winningCells={winningLine} />
          <p className="turnText">{turnText(room, myColor)}</p>
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
  color,
  isCurrentTurn,
  isYou,
  profile
}: {
  color: StoneColor;
  isCurrentTurn: boolean;
  isYou: boolean;
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
        {profile ? `${profile.wins}승 ${profile.losses}패 ${profile.draws}무` : "상대 입장 대기"}
      </p>
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
    return "상대 대기";
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
    return "방 코드를 공유해 상대를 초대하세요.";
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
