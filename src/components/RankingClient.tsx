"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ensureGomokuAccount, fetchGomokuRanking, hasGomokuServerConfig } from "@/src/lib/gomoku-api";
import { formatWinRate, rankProfiles, type RankedProfile } from "@/src/lib/ranking";

export function RankingClient() {
  const isConfigured = hasGomokuServerConfig();
  const [entries, setEntries] = useState<RankedProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadRanking() {
      if (!isConfigured) {
        setIsLoading(false);
        return;
      }

      setError(null);
      setIsLoading(true);

      try {
        const nickname = window.localStorage.getItem("gomoku:nickname") ?? "Guest";
        const [account, profiles] = await Promise.all([ensureGomokuAccount(nickname), fetchGomokuRanking()]);

        if (isMounted) {
          setEntries(rankProfiles(profiles, account.id));
        }
      } catch (rankingLoadError) {
        if (isMounted) {
          setError(rankingLoadError instanceof Error ? rankingLoadError.message : "랭킹을 불러오지 못했습니다.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadRanking();

    return () => {
      isMounted = false;
    };
  }, [isConfigured]);

  const myEntry = entries.find((entry) => entry.isCurrentUser);

  return (
    <main className="rankingLayout">
      <header className="roomHeader">
        <div>
          <Link className="backLink" href="/">
            로비
          </Link>
          <h1>랭킹</h1>
        </div>
        <Link className="secondaryButton linkButton headerAction" href="/">
          방 만들기
        </Link>
      </header>

      {!isConfigured ? (
        <div className="notice" role="status">
          실시간 서버 URL이 필요합니다. `NEXT_PUBLIC_GOMOKU_SERVER_URL`을 설정한 뒤 다시 배포하세요.
        </div>
      ) : null}

      {myEntry ? (
        <section className="myRankBar" aria-label="내 순위">
          <div>
            <span>내 순위</span>
            <strong>{myEntry.rank}위</strong>
          </div>
          <div>
            <span>승점</span>
            <strong>{myEntry.rating}</strong>
          </div>
          <div>
            <span>전적</span>
            <strong>
              {myEntry.wins}승 {myEntry.losses}패 {myEntry.draws}무
            </strong>
          </div>
        </section>
      ) : null}

      <section className="rankingSurface">
        {isLoading ? (
          <p className="notice" role="status">
            랭킹을 불러오는 중입니다.
          </p>
        ) : null}

        {error ? (
          <p className="errorText" role="alert">
            {error}
          </p>
        ) : null}

        {isConfigured && !isLoading && !error && entries.length === 0 ? (
          <p className="notice" role="status">
            아직 랭킹 데이터가 없습니다.
          </p>
        ) : null}

        {entries.length > 0 ? (
          <div className="rankingTableShell">
            <table className="rankingTable">
              <thead>
                <tr>
                  <th scope="col">순위</th>
                  <th scope="col">닉네임</th>
                  <th scope="col">승점</th>
                  <th scope="col">전적</th>
                  <th scope="col">승률</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr className={entry.isCurrentUser ? "currentPlayerRow" : undefined} key={entry.id}>
                    <td>{entry.rank}</td>
                    <td>
                      <span className="rankNickname">{entry.nickname}</span>
                      {entry.isCurrentUser ? <span className="youBadge">나</span> : null}
                    </td>
                    <td>
                      <strong>{entry.rating}</strong>
                    </td>
                    <td>
                      {entry.wins}승 {entry.losses}패 {entry.draws}무
                    </td>
                    <td>{formatWinRate(entry.winRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </main>
  );
}
