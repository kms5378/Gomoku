import type { StoneColor } from "./gomoku";

export type RoomStatus = "waiting" | "playing" | "finished";

export type ProfileRecord = {
  id: string;
  nickname: string;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
};

export type RoomRecord = {
  id: string;
  code: string;
  status: RoomStatus;
  black_player: string;
  white_player: string | null;
  current_turn: StoneColor;
  winner: StoneColor | null;
  winning_player: string | null;
  game_index: number;
  restart_black: boolean;
  restart_white: boolean;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
};

export type MoveRecord = {
  id: number;
  room_id: string;
  game_index: number;
  player_id: string;
  color: StoneColor;
  row: number;
  col: number;
  move_number: number;
  created_at: string;
};
