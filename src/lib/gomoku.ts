export const BOARD_SIZE = 15;
export const WIN_LENGTH = 5;

export type StoneColor = "black" | "white";
export type Cell = StoneColor | null;
export type Board = Cell[][];

export type MoveInput = {
  row: number;
  col: number;
  color: StoneColor;
};

export type WinningLine = {
  winner: StoneColor;
  line: Array<{ row: number; col: number }>;
};

const DIRECTIONS = [
  { row: 0, col: 1 },
  { row: 1, col: 0 },
  { row: 1, col: 1 },
  { row: 1, col: -1 }
] as const;

export function createEmptyBoard(size = BOARD_SIZE): Board {
  return Array.from({ length: size }, () => Array<Cell>(size).fill(null));
}

export function isInsideBoard(row: number, col: number, size = BOARD_SIZE): boolean {
  return Number.isInteger(row) && Number.isInteger(col) && row >= 0 && col >= 0 && row < size && col < size;
}

export function nextStone(color: StoneColor): StoneColor {
  return color === "black" ? "white" : "black";
}

export function placeStone(board: Board, move: MoveInput): Board {
  if (!isInsideBoard(move.row, move.col, board.length)) {
    throw new Error("Move is outside the board.");
  }

  if (board[move.row][move.col] !== null) {
    throw new Error("Cell is already occupied.");
  }

  const nextBoard = board.map((row) => [...row]);
  nextBoard[move.row][move.col] = move.color;
  return nextBoard;
}

export function detectWinner(board: Board, lastMove: MoveInput, target = WIN_LENGTH): WinningLine | null {
  const color = board[lastMove.row]?.[lastMove.col] ?? lastMove.color;

  if (!color) {
    return null;
  }

  for (const direction of DIRECTIONS) {
    const forward = collectLine(board, lastMove.row, lastMove.col, direction.row, direction.col, color);
    const backward = collectLine(board, lastMove.row, lastMove.col, -direction.row, -direction.col, color);
    const line = [...backward.reverse(), { row: lastMove.row, col: lastMove.col }, ...forward];

    if (line.length >= target) {
      return { winner: color, line };
    }
  }

  return null;
}

export function isBoardFull(board: Board): boolean {
  return board.every((row) => row.every(Boolean));
}

export function buildBoardFromMoves(moves: Array<MoveInput & { move_number?: number }>): Board {
  const board = createEmptyBoard();
  const sortedMoves = [...moves].sort((a, b) => (a.move_number ?? 0) - (b.move_number ?? 0));

  for (const move of sortedMoves) {
    if (isInsideBoard(move.row, move.col) && board[move.row][move.col] === null) {
      board[move.row][move.col] = move.color;
    }
  }

  return board;
}

export function scoreDeltaForOutcome(outcome: "win" | "loss" | "draw"): number {
  if (outcome === "win") {
    return 3;
  }

  if (outcome === "draw") {
    return 1;
  }

  return 0;
}

function collectLine(
  board: Board,
  row: number,
  col: number,
  rowDirection: number,
  colDirection: number,
  color: StoneColor
): Array<{ row: number; col: number }> {
  const stones: Array<{ row: number; col: number }> = [];
  let nextRow = row + rowDirection;
  let nextCol = col + colDirection;

  while (isInsideBoard(nextRow, nextCol, board.length) && board[nextRow][nextCol] === color) {
    stones.push({ row: nextRow, col: nextCol });
    nextRow += rowDirection;
    nextCol += colDirection;
  }

  return stones;
}
