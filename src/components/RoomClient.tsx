"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toUserErrorMessage } from "@/src/lib/errors";
import {
  ensureGomokuAccount,
  getGomokuWebSocketUrl,
  hasGomokuServerConfig,
  storeAccountToken,
  type GameState,
  type GomokuSocketMessage
} from "@/src/lib/gomoku-api";
import { buildBoardFromMoves, detectWinner, getForbiddenBlackMove, type StoneColor } from "@/src/lib/gomoku";
import { canChooseSide } from "@/src/lib/room-rules";
import { playStoneSound } from "@/src/lib/sound";
import type { MoveRecord, ProfileRecord, RoomRecord } from "@/src/lib/types";
import { type ForbiddenBoardCell, GomokuBoard } from "./GomokuBoard";

const NICKNAME_KEY = "gomoku:nickname";

type ProfileMap = Record<string, ProfileRecord>;
type ConnectRoom = (token: string, nickname: string) => void;

export function RoomClient({ code }: { code: string }) {
  const [nickname, setNickname] = useState("");
  const [nicknameLoaded, setNicknameLoaded] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomRecord | null>(null);
  const [moves, setMoves] = useState<MoveRecord[]>([]);
  const [profiles, setProfiles] = useState<ProfileMap>({});
  const [isJoining, setIsJoining] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [choosingSide, setChoosingSide] = useState<StoneColor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const connectRoomRef = useRef<ConnectRoom>(() => undefined);
  const hasJoinedRef = useRef(false);
  const hasSeenStateRef = useRef(false);
  const previousMoveCountRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);
  const shouldReconnectRef = useRef(true);
  const socketRef = useRef<WebSocket | null>(null);

  const normalizedCode = code.toUpperCase();

  const applyGameState = useCallback((state: GameState) => {
    const previousMoveCount = previousMoveCountRef.current;

    setRoom(state.room);
    setMoves(state.moves);
    setProfiles(state.profiles);
    setIsSubmitting(false);
    setChoosingSide(null);

    if (hasSeenStateRef.current && state.moves.length > previousMoveCount) {
      playStoneSound();
    }

    hasSeenStateRef.current = true;
    previousMoveCountRef.current = state.moves.length;
  }, []);

  const connectRoom = useCallback(
    (token: string, cleanNickname: string) => {
      socketRef.current?.close();
      setIsConnected(false);

      const socket = new WebSocket(getGomokuWebSocketUrl());
      socketRef.current = socket;

      socket.addEventListener("open", () => {
        setError(null);
        setIsConnected(true);
        setIsJoining(false);
        socket.send(
          JSON.stringify({
            code: normalizedCode,
            nickname: cleanNickname,
            token,
            type: "room:join"
          })
        );
      });

      socket.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data)) as GomokuSocketMessage;

        if (message.type === "account") {
          setUserId(message.account.id);
          storeAccountToken(message.account.token);
          return;
        }

        if (message.type === "room:state") {
          applyGameState(message.state);
          return;
        }

        if (message.type === "error") {
          setError(message.message);
          setIsSubmitting(false);
          setChoosingSide(null);
        }
      });

      socket.addEventListener("error", () => {
        setError("실시간 서버에 연결하지 못했습니다. 잠시 후 다시 시도합니다.");
      });

      socket.addEventListener("close", () => {
        if (socketRef.current !== socket) {
          return;
        }

        setIsConnected(false);
        setIsJoining(false);

        if (!shouldReconnectRef.current) {
          return;
        }

        if (reconnectTimerRef.current) {
          window.clearTimeout(reconnectTimerRef.current);
        }

        reconnectTimerRef.current = window.setTimeout(() => {
          connectRoomRef.current(token, cleanNickname);
        }, 1000);
      });
    },
    [applyGameState, normalizedCode]
  );

  useEffect(() => {
    connectRoomRef.current = connectRoom;
  }, [connectRoom]);

  const joinRoom = useCallback(
    async (name: string) => {
      setError(null);
      setIsJoining(true);

      try {
        const cleanNickname = name.trim() || "Guest";
        window.localStorage.setItem(NICKNAME_KEY, cleanNickname);
        setNickname(cleanNickname);

        const account = await ensureGomokuAccount(cleanNickname);
        setUserId(account.id);
        connectRoom(account.token, cleanNickname);
      } catch (joinError) {
        hasJoinedRef.current = false;
        setError(toUserErrorMessage(joinError, "방에 입장하지 못했습니다."));
        setIsConnected(false);
        setIsJoining(false);
      }
    },
    [connectRoom]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setNickname(window.localStorage.getItem(NICKNAME_KEY) ?? "");
      setNicknameLoaded(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!nicknameLoaded || !nickname.trim() || hasJoinedRef.current) {
      return;
    }

    hasJoinedRef.current = true;
    void joinRoom(nickname);
  }, [joinRoom, nickname, nicknameLoaded]);

  useEffect(() => {
    return () => {
      shouldReconnectRef.current = false;

      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
      }

      socketRef.current?.close();
    };
  }, []);

  const board = useMemo(() => buildBoardFromMoves(moves), [moves]);
  const lastMove = moves.at(-1);
  const winningLine =
    room?.status === "finished" && lastMove
      ? detectWinner(board, { row: lastMove.row, col: lastMove.col, color: lastMove.color })?.line
      : undefined;
  const myColor = resolvePlayerColor(room, userId);
  const canPlay = Boolean(
    isConnected && room && myColor && room.status === "playing" && room.current_turn === myColor && !isSubmitting
  );
  const connectionMessage = connectionText(room, isConnected);
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

  function sendGameMessage(payload: Record<string, unknown>): boolean {
    const socket = socketRef.current;

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setError("실시간 서버에 연결 중입니다. 잠시 후 다시 시도하세요.");
      return false;
    }

    socket.send(JSON.stringify(payload));
    return true;
  }

  async function submitMove(row: number, col: number) {
    if (!room || !canPlay || !myColor) {
      return;
    }

    setError(null);

    try {
      const forbiddenReason = getForbiddenBlackMove(board, { row, col, color: myColor });

      if (forbiddenReason) {
        throw new Error(forbiddenReason === "double-three" ? "흑 3x3 금수입니다." : "흑 4x4 금수입니다.");
      }

      setIsSubmitting(sendGameMessage({ col, row, type: "move:submit" }));
    } catch (submitError) {
      setError(toUserErrorMessage(submitError, "착수하지 못했습니다."));
      setIsSubmitting(false);
    }
  }

  async function requestRestart() {
    if (!room) {
      return;
    }

    setError(null);
    setIsSubmitting(sendGameMessage({ type: "room:restart" }));
  }

  async function chooseSide(side: StoneColor) {
    if (!room || !canChooseSide({ room, side, userId, isChoosing: choosingSide !== null })) {
      return;
    }

    setError(null);
    setChoosingSide(side);

    if (!sendGameMessage({ side, type: "room:chooseSide" })) {
      setChoosingSide(null);
    }
  }

  if (!hasGomokuServerConfig()) {
    return (
      <main className="roomLayout">
        <div className="notice" role="status">
          실시간 서버 URL이 필요합니다. `NEXT_PUBLIC_GOMOKU_SERVER_URL`을 설정한 뒤 다시 배포하세요.
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
        <div className={`statusPill ${room?.status ?? "waiting"}`}>{statusText(room, isConnected)}</div>
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
            <button className="primaryButton" disabled={isSubmitting || !isConnected} onClick={requestRestart} type="button">
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
          {connectionMessage ? <p className="connectionText">{connectionMessage}</p> : null}
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

function statusText(room: RoomRecord | null, isConnected: boolean): string {
  if (!isConnected) {
    return "연결 중";
  }

  if (!room) {
    return "방 입장 중";
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

function connectionText(room: RoomRecord | null, isConnected: boolean): string | null {
  if (!room || isConnected) {
    return null;
  }

  return "실시간 서버에 재연결 중입니다.";
}
