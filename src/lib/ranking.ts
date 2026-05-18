import type { ProfileRecord } from "./types";

export type RankedProfile = ProfileRecord & {
  games: number;
  isCurrentUser: boolean;
  rank: number;
  winRate: number;
};

export function rankProfiles(profiles: ProfileRecord[], currentUserId?: string | null): RankedProfile[] {
  return [...profiles]
    .sort(compareProfiles)
    .map((profile, index) => {
      const games = profile.wins + profile.losses + profile.draws;

      return {
        ...profile,
        games,
        isCurrentUser: profile.id === currentUserId,
        rank: index + 1,
        winRate: games === 0 ? 0 : (profile.wins / games) * 100
      };
    });
}

export function formatWinRate(winRate: number): string {
  if (winRate === 0) {
    return "0%";
  }

  return `${winRate.toFixed(1)}%`;
}

function compareProfiles(left: ProfileRecord, right: ProfileRecord): number {
  return (
    right.rating - left.rating ||
    right.wins - left.wins ||
    right.draws - left.draws ||
    left.losses - right.losses ||
    left.nickname.localeCompare(right.nickname) ||
    left.id.localeCompare(right.id)
  );
}
