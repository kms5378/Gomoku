"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createGomokuRoom, hasGomokuServerConfig } from "@/src/lib/gomoku-api";

const NICKNAME_KEY = "gomoku:nickname";

export function HomeClient() {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setNickname(window.localStorage.getItem(NICKNAME_KEY) ?? "");
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  async function createRoom() {
    await runRoomAction(async () => {
      const cleanNickname = persistNickname();
      const result = await createGomokuRoom(cleanNickname);

      router.push(`/room/${result.state.room.code}`);
    });
  }

  async function joinRoom() {
    await runRoomAction(async () => {
      persistNickname();
      const code = roomCode.trim().toUpperCase();

      if (!code) {
        throw new Error("입장할 방 코드를 입력하세요.");
      }

      router.push(`/room/${code}`);
    });
  }

  async function runRoomAction(action: () => Promise<void>) {
    setError(null);
    setIsSubmitting(true);

    try {
      await action();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "요청을 처리하지 못했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function persistNickname() {
    const cleanNickname = nickname.trim() || "Guest";
    window.localStorage.setItem(NICKNAME_KEY, cleanNickname);
    setNickname(cleanNickname);
    return cleanNickname;
  }

  const isConfigured = hasGomokuServerConfig();

  return (
    <main className="homeLayout">
      <section className="heroBand">
        <div className="heroCopy">
          <p className="eyebrow">Realtime Gomoku</p>
          <h1>오목 대전</h1>
          <p className="lede">방 코드를 만들고 공유하면 같은 방에서 실시간으로 대전할 수 있습니다.</p>
        </div>
        <div className="homePanel">
          {!isConfigured ? (
            <div className="notice" role="status">
              실시간 서버 URL이 필요합니다. `NEXT_PUBLIC_GOMOKU_SERVER_URL`을 설정한 뒤 다시 배포하세요.
            </div>
          ) : null}

          <label className="fieldLabel" htmlFor="nickname">
            닉네임
          </label>
          <input
            className="textInput"
            id="nickname"
            maxLength={24}
            onChange={(event) => setNickname(event.target.value)}
            placeholder="플레이어 이름"
            value={nickname}
          />

          <div className="actionGrid">
            <button className="primaryButton" disabled={!isConfigured || isSubmitting} onClick={createRoom} type="button">
              방 만들기
            </button>
            <Link className="secondaryButton linkButton" href="/ranking">
              랭킹 보기
            </Link>
            <div className="joinInline">
              <input
                aria-label="방 코드"
                className="textInput codeInput"
                maxLength={6}
                onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
                placeholder="ABC123"
                value={roomCode}
              />
              <button className="secondaryButton" disabled={!isConfigured || isSubmitting} onClick={joinRoom} type="button">
                입장
              </button>
            </div>
          </div>

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
