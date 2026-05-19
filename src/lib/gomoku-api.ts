import type { MoveRecord, ProfileRecord, RoomRecord } from "./types";

const ACCOUNT_TOKEN_KEY = "gomoku:account-token";
const DEFAULT_SERVER_BASE_URL = "https://54.180.79.43.nip.io/gomoku";

export type AccountRecord = ProfileRecord & {
  token: string;
};

export type GameState = {
  room: RoomRecord;
  moves: MoveRecord[];
  profiles: Record<string, ProfileRecord>;
};

export type CreateRoomResult = {
  account: AccountRecord;
  state: GameState;
};

export type GomokuSocketMessage =
  | { type: "account"; account: AccountRecord }
  | { type: "error"; message: string }
  | { type: "pong"; now: number }
  | { type: "room:state"; state: GameState };

export function hasGomokuServerConfig(): boolean {
  return Boolean(getGomokuServerBaseUrl());
}

export function getGomokuServerBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_GOMOKU_SERVER_URL || DEFAULT_SERVER_BASE_URL).replace(/\/$/, "");
}

export function getGomokuWebSocketUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_GOMOKU_WS_URL;

  if (explicit) {
    return explicit;
  }

  return `${getGomokuServerBaseUrl().replace(/^http/, "ws")}/ws`;
}

export function getStoredAccountToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(ACCOUNT_TOKEN_KEY);
}

export function storeAccountToken(token: string): void {
  window.localStorage.setItem(ACCOUNT_TOKEN_KEY, token);
}

export async function ensureGomokuAccount(nickname: string): Promise<AccountRecord> {
  const response = await postJson<{ account: AccountRecord }>("/api/accounts", {
    nickname,
    token: getStoredAccountToken()
  });
  storeAccountToken(response.account.token);
  return response.account;
}

export async function createGomokuRoom(nickname: string): Promise<CreateRoomResult> {
  const result = await postJson<CreateRoomResult>("/api/rooms", {
    nickname,
    token: getStoredAccountToken()
  });
  storeAccountToken(result.account.token);
  return result;
}

export async function fetchGomokuRanking(): Promise<ProfileRecord[]> {
  const result = await fetchJson<{ profiles: ProfileRecord[] }>("/api/ranking");
  return result.profiles;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${getGomokuServerBaseUrl()}${path}`, {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json"
    },
    method: "POST"
  });

  return readResponse<T>(response);
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${getGomokuServerBaseUrl()}${path}`);
  return readResponse<T>(response);
}

async function readResponse<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => null)) as { error?: string } | T | null;

  if (!response.ok) {
    const message = typeof data === "object" && data !== null && "error" in data ? data.error : null;
    throw new Error(message || "요청을 처리하지 못했습니다.");
  }

  return data as T;
}
