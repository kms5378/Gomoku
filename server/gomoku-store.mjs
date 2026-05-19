import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  BOARD_SIZE,
  buildBoardFromMoves,
  detectWinner,
  getForbiddenBlackMove,
  isBoardFull,
  nextStone,
  placeStone
} from "./gomoku-rules.mjs";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export class GomokuStore {
  constructor(dbPath = ":memory:") {
    if (dbPath !== ":memory:") {
      mkdirSync(dirname(dbPath), { recursive: true });
    }

    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.migrate();
  }

  close() {
    this.db.close();
  }

  migrate() {
    this.db.exec(`
      create table if not exists accounts (
        id text primary key,
        token text not null unique,
        nickname text not null,
        rating integer not null default 0,
        wins integer not null default 0,
        losses integer not null default 0,
        draws integer not null default 0,
        created_at text not null default (datetime('now')),
        updated_at text not null default (datetime('now'))
      );

      create table if not exists rooms (
        code text primary key,
        status text not null default 'waiting',
        black_player text references accounts(id),
        white_player text references accounts(id),
        current_turn text not null default 'black',
        winner text,
        winning_player text references accounts(id),
        game_index integer not null default 0,
        restart_black integer not null default 0,
        restart_white integer not null default 0,
        created_at text not null default (datetime('now')),
        updated_at text not null default (datetime('now')),
        finished_at text
      );

      create table if not exists room_players (
        room_code text not null references rooms(code) on delete cascade,
        account_id text not null references accounts(id) on delete cascade,
        joined_at text not null default (datetime('now')),
        primary key (room_code, account_id)
      );

      create table if not exists moves (
        id integer primary key autoincrement,
        room_code text not null references rooms(code) on delete cascade,
        game_index integer not null,
        player_id text not null references accounts(id),
        color text not null,
        row integer not null,
        col integer not null,
        move_number integer not null,
        created_at text not null default (datetime('now')),
        unique (room_code, game_index, row, col),
        unique (room_code, game_index, move_number)
      );

      create table if not exists game_results (
        room_code text not null references rooms(code) on delete cascade,
        game_index integer not null,
        black_player text references accounts(id),
        white_player text references accounts(id),
        winner_player text references accounts(id),
        outcome text not null,
        created_at text not null default (datetime('now')),
        primary key (room_code, game_index)
      );

      create index if not exists accounts_ranking_idx
        on accounts (rating desc, wins desc, draws desc, losses asc, nickname asc);
      create index if not exists moves_room_game_idx
        on moves (room_code, game_index, move_number asc);
    `);
  }

  ensureAccount({ token, nickname }) {
    const cleanNickname = cleanName(nickname);

    if (token) {
      const existing = this.db.prepare("select * from accounts where token = ?").get(token);

      if (existing) {
        if (existing.nickname !== cleanNickname) {
          this.db
            .prepare("update accounts set nickname = ?, updated_at = datetime('now') where id = ?")
            .run(cleanNickname, existing.id);
          return this.getAccount(existing.id);
        }

        return serializeAccount(existing);
      }
    }

    const id = randomUUID();
    const nextToken = randomToken();
    this.db.prepare("insert into accounts (id, token, nickname) values (?, ?, ?)").run(id, nextToken, cleanNickname);

    return this.getAccount(id);
  }

  getAccount(id) {
    const account = this.db.prepare("select * from accounts where id = ?").get(id);

    if (!account) {
      throw new Error("Account not found.");
    }

    return serializeAccount(account);
  }

  createRoom({ token, nickname }) {
    const account = this.ensureAccount({ token, nickname });
    let code = "";

    for (let attempt = 0; attempt < 20; attempt += 1) {
      code = generateRoomCode();

      try {
        this.db.prepare("insert into rooms (code) values (?)").run(code);
        this.addParticipant(code, account.id);
        return { account, state: this.getRoomState(code) };
      } catch (error) {
        if (!String(error.message).includes("UNIQUE")) {
          throw error;
        }
      }
    }

    throw new Error("Could not generate a unique room code.");
  }

  joinRoom({ token, nickname, code }) {
    const account = this.ensureAccount({ token, nickname });
    const room = this.getRoom(normalizeCode(code));

    if (!this.isParticipant(room.code, account.id)) {
      const count = this.db.prepare("select count(*) as count from room_players where room_code = ?").get(room.code).count;

      if (count >= 2) {
        throw new Error("Room is full.");
      }

      if (room.status !== "waiting") {
        throw new Error("Room is not joinable.");
      }

      this.addParticipant(room.code, account.id);
    }

    return { account, state: this.getRoomState(room.code) };
  }

  chooseSide({ accountId, code, side }) {
    const roomCode = normalizeCode(code);
    const room = this.getRoom(roomCode);

    if (!["black", "white"].includes(side)) {
      throw new Error("Side is required.");
    }

    if (!this.isParticipant(roomCode, accountId)) {
      throw new Error("Only room players can choose a side.");
    }

    if (room.status !== "waiting") {
      throw new Error("Side can only be selected before the game starts.");
    }

    if (side === "black") {
      if (room.black_player && room.black_player !== accountId) {
        throw new Error("Black side is already taken.");
      }

      this.db
        .prepare(
          `update rooms
           set black_player = ?,
               white_player = case when white_player = ? then null else white_player end,
               restart_black = 0,
               restart_white = 0,
               updated_at = datetime('now')
           where code = ?`
        )
        .run(accountId, accountId, roomCode);
    } else {
      if (room.white_player && room.white_player !== accountId) {
        throw new Error("White side is already taken.");
      }

      this.db
        .prepare(
          `update rooms
           set white_player = ?,
               black_player = case when black_player = ? then null else black_player end,
               restart_black = 0,
               restart_white = 0,
               updated_at = datetime('now')
           where code = ?`
        )
        .run(accountId, accountId, roomCode);
    }

    const nextRoom = this.getRoom(roomCode);
    const nextStatus = nextRoom.black_player && nextRoom.white_player ? "playing" : "waiting";
    this.db
      .prepare(
        `update rooms
         set status = ?,
             current_turn = 'black',
             restart_black = 0,
             restart_white = 0,
             updated_at = datetime('now')
         where code = ?`
      )
      .run(nextStatus, roomCode);

    return this.getRoomState(roomCode);
  }

  submitMove({ accountId, code, row, col }) {
    const roomCode = normalizeCode(code);
    const room = this.getRoom(roomCode);

    if (room.status !== "playing") {
      throw new Error("Game is not active.");
    }

    const color = playerColor(room, accountId);

    if (!color) {
      throw new Error("Only room players can move.");
    }

    if (room.current_turn !== color) {
      throw new Error("It is not your turn.");
    }

    const moves = this.getMoves(roomCode, room.game_index);
    const board = buildBoardFromMoves(moves);
    const move = { row, col, color };
    const forbiddenReason = getForbiddenBlackMove(board, move);

    if (forbiddenReason) {
      throw new Error(forbiddenReason === "double-three" ? "흑 3x3 금수입니다." : "흑 4x4 금수입니다.");
    }

    const nextBoard = placeStone(board, move);
    const moveNumber = moves.length + 1;

    this.db
      .prepare(
        `insert into moves (room_code, game_index, player_id, color, row, col, move_number)
         values (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(roomCode, room.game_index, accountId, color, row, col, moveNumber);

    const winner = detectWinner(nextBoard, move);

    if (winner) {
      this.finishGame(roomCode, room.game_index, color, accountId, color === "black" ? "black_win" : "white_win");
      return this.getRoomState(roomCode);
    }

    if (isBoardFull(nextBoard)) {
      this.finishDraw(roomCode, room.game_index);
      return this.getRoomState(roomCode);
    }

    this.db
      .prepare("update rooms set current_turn = ?, updated_at = datetime('now') where code = ?")
      .run(nextStone(color), roomCode);

    return this.getRoomState(roomCode);
  }

  requestRestart({ accountId, code }) {
    const roomCode = normalizeCode(code);
    const room = this.getRoom(roomCode);
    const color = playerColor(room, accountId);

    if (!color) {
      throw new Error("Only room players can request a restart.");
    }

    if (room.status !== "finished") {
      throw new Error("Game is not finished.");
    }

    this.db
      .prepare(`update rooms set ${color === "black" ? "restart_black" : "restart_white"} = 1, updated_at = datetime('now') where code = ?`)
      .run(roomCode);

    const updated = this.getRoom(roomCode);

    if (updated.restart_black && updated.restart_white) {
      this.db
        .prepare(
          `update rooms
           set status = 'playing',
               black_player = white_player,
               white_player = black_player,
               current_turn = 'black',
               winner = null,
               winning_player = null,
               game_index = game_index + 1,
               restart_black = 0,
               restart_white = 0,
               finished_at = null,
               updated_at = datetime('now')
           where code = ?`
        )
        .run(roomCode);
    }

    return this.getRoomState(roomCode);
  }

  forfeitDisconnected(accountId) {
    const rooms = this.db
      .prepare(
        `select * from rooms
         where status = 'playing'
           and (black_player = ? or white_player = ?)`
      )
      .all(accountId, accountId);
    const changed = [];

    for (const room of rooms) {
      const winnerColor = room.black_player === accountId ? "white" : "black";
      const winnerId = winnerColor === "black" ? room.black_player : room.white_player;

      if (!winnerId) {
        continue;
      }

      this.finishGame(room.code, room.game_index, winnerColor, winnerId, winnerColor === "black" ? "black_win" : "white_win");
      changed.push(this.getRoomState(room.code));
    }

    return changed;
  }

  getRanking(limit = 100) {
    return this.db
      .prepare(
        `select id, nickname, rating, wins, losses, draws
         from accounts
         order by rating desc, wins desc, draws desc, losses asc, nickname asc
         limit ?`
      )
      .all(limit)
      .map(serializeAccount);
  }

  getRoomState(code) {
    const room = this.getRoom(normalizeCode(code));
    const moves = this.getMoves(room.code, room.game_index);
    const profileIds = [room.black_player, room.white_player].filter(Boolean);
    const profiles = {};

    for (const id of profileIds) {
      profiles[id] = this.getAccount(id);
    }

    return {
      room: serializeRoom(room),
      moves: moves.map(serializeMove),
      profiles
    };
  }

  getRoom(code) {
    const room = this.db.prepare("select * from rooms where code = ?").get(normalizeCode(code));

    if (!room) {
      throw new Error("Room not found.");
    }

    return serializeRoom(room);
  }

  getMoves(code, gameIndex) {
    return this.db
      .prepare(
        `select id, room_code, game_index, player_id, color, row, col, move_number, created_at
         from moves
         where room_code = ? and game_index = ?
         order by move_number asc`
      )
      .all(normalizeCode(code), gameIndex)
      .map(serializeMove);
  }

  addParticipant(code, accountId) {
    this.db.prepare("insert or ignore into room_players (room_code, account_id) values (?, ?)").run(normalizeCode(code), accountId);
  }

  isParticipant(code, accountId) {
    return Boolean(
      this.db.prepare("select 1 from room_players where room_code = ? and account_id = ?").get(normalizeCode(code), accountId)
    );
  }

  finishGame(roomCode, gameIndex, winnerColor, winnerId, outcome) {
    const room = this.getRoom(roomCode);
    const loserId = winnerColor === "black" ? room.white_player : room.black_player;

    this.db
      .prepare(
        `update rooms
         set status = 'finished',
             winner = ?,
             winning_player = ?,
             finished_at = datetime('now'),
             restart_black = 0,
             restart_white = 0,
             updated_at = datetime('now')
         where code = ?`
      )
      .run(winnerColor, winnerId, roomCode);

    this.db
      .prepare(
        `insert or ignore into game_results
           (room_code, game_index, black_player, white_player, winner_player, outcome)
         values (?, ?, ?, ?, ?, ?)`
      )
      .run(roomCode, gameIndex, room.black_player, room.white_player, winnerId, outcome);

    this.db.prepare("update accounts set rating = rating + 3, wins = wins + 1, updated_at = datetime('now') where id = ?").run(winnerId);

    if (loserId) {
      this.db.prepare("update accounts set losses = losses + 1, updated_at = datetime('now') where id = ?").run(loserId);
    }
  }

  finishDraw(roomCode, gameIndex) {
    const room = this.getRoom(roomCode);

    this.db
      .prepare(
        `update rooms
         set status = 'finished',
             winner = null,
             winning_player = null,
             finished_at = datetime('now'),
             restart_black = 0,
             restart_white = 0,
             updated_at = datetime('now')
         where code = ?`
      )
      .run(roomCode);

    this.db
      .prepare(
        `insert or ignore into game_results
           (room_code, game_index, black_player, white_player, winner_player, outcome)
         values (?, ?, ?, ?, null, 'draw')`
      )
      .run(roomCode, gameIndex, room.black_player, room.white_player);

    this.db
      .prepare("update accounts set rating = rating + 1, draws = draws + 1, updated_at = datetime('now') where id in (?, ?)")
      .run(room.black_player, room.white_player);
  }
}

export function normalizeCode(code) {
  return String(code ?? "").trim().toUpperCase();
}

function cleanName(nickname) {
  const value = String(nickname ?? "").trim();
  return value.length > 0 ? value.slice(0, 24) : "Guest";
}

function randomToken() {
  return randomBytes(24).toString("base64url");
}

function generateRoomCode() {
  let code = "";

  for (let index = 0; index < 6; index += 1) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }

  return code;
}

function playerColor(room, accountId) {
  if (room.black_player === accountId) {
    return "black";
  }

  if (room.white_player === accountId) {
    return "white";
  }

  return null;
}

function serializeAccount(account) {
  return {
    id: account.id,
    token: account.token,
    nickname: account.nickname,
    rating: Number(account.rating),
    wins: Number(account.wins),
    losses: Number(account.losses),
    draws: Number(account.draws)
  };
}

function serializeRoom(room) {
  return {
    id: room.code,
    code: room.code,
    status: room.status,
    black_player: room.black_player ?? null,
    white_player: room.white_player ?? null,
    current_turn: room.current_turn,
    winner: room.winner ?? null,
    winning_player: room.winning_player ?? null,
    game_index: Number(room.game_index),
    restart_black: Boolean(room.restart_black),
    restart_white: Boolean(room.restart_white),
    created_at: room.created_at,
    updated_at: room.updated_at,
    finished_at: room.finished_at ?? null
  };
}

function serializeMove(move) {
  return {
    id: Number(move.id),
    room_id: move.room_code,
    game_index: Number(move.game_index),
    player_id: move.player_id,
    color: move.color,
    row: Number(move.row),
    col: Number(move.col),
    move_number: Number(move.move_number),
    created_at: move.created_at
  };
}

export function boardSize() {
  return BOARD_SIZE;
}
