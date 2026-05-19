export const BOARD_SIZE = 15;
export const WIN_LENGTH = 5;

const DIRECTIONS = [
  { row: 0, col: 1 },
  { row: 1, col: 0 },
  { row: 1, col: 1 },
  { row: 1, col: -1 }
];

export function createEmptyBoard(size = BOARD_SIZE) {
  return Array.from({ length: size }, () => Array(size).fill(null));
}

export function isInsideBoard(row, col, size = BOARD_SIZE) {
  return Number.isInteger(row) && Number.isInteger(col) && row >= 0 && col >= 0 && row < size && col < size;
}

export function nextStone(color) {
  return color === "black" ? "white" : "black";
}

export function placeStone(board, move) {
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

export function detectWinner(board, lastMove, target = WIN_LENGTH) {
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

export function getForbiddenBlackMove(board, move) {
  if (move.color !== "black") {
    return null;
  }

  const nextBoard = placeStone(board, move);

  if (detectWinner(nextBoard, move)) {
    return null;
  }

  const fourDirections = DIRECTIONS.filter((direction) =>
    directionHasFourThreat(nextBoard, move.row, move.col, direction.row, direction.col)
  ).length;

  if (fourDirections >= 2) {
    return "double-four";
  }

  const openThreeDirections = DIRECTIONS.filter((direction) =>
    directionHasOpenThreeThreat(nextBoard, move.row, move.col, direction.row, direction.col)
  ).length;

  if (openThreeDirections >= 2) {
    return "double-three";
  }

  return null;
}

export function isBoardFull(board) {
  return board.every((row) => row.every(Boolean));
}

export function buildBoardFromMoves(moves) {
  const board = createEmptyBoard();
  const sortedMoves = [...moves].sort((a, b) => (a.move_number ?? 0) - (b.move_number ?? 0));

  for (const move of sortedMoves) {
    if (isInsideBoard(move.row, move.col) && board[move.row][move.col] === null) {
      board[move.row][move.col] = move.color;
    }
  }

  return board;
}

function collectLine(board, row, col, rowDirection, colDirection, color) {
  const stones = [];
  let nextRow = row + rowDirection;
  let nextCol = col + colDirection;

  while (isInsideBoard(nextRow, nextCol, board.length) && board[nextRow][nextCol] === color) {
    stones.push({ row: nextRow, col: nextCol });
    nextRow += rowDirection;
    nextCol += colDirection;
  }

  return stones;
}

function directionHasFourThreat(board, row, col, rowDirection, colDirection) {
  return scanEmptyCandidates(board, row, col, rowDirection, colDirection).some((candidate) => {
    const candidateBoard = placeStone(board, { ...candidate, color: "black" });
    return countLineLength(candidateBoard, candidate.row, candidate.col, rowDirection, colDirection, "black") >= WIN_LENGTH;
  });
}

function directionHasOpenThreeThreat(board, row, col, rowDirection, colDirection) {
  return scanEmptyCandidates(board, row, col, rowDirection, colDirection).some((candidate) => {
    const candidateBoard = placeStone(board, { ...candidate, color: "black" });
    return hasOpenFour(candidateBoard, candidate.row, candidate.col, rowDirection, colDirection);
  });
}

function scanEmptyCandidates(board, row, col, rowDirection, colDirection) {
  const candidates = [];

  for (let offset = -4; offset <= 4; offset += 1) {
    const candidate = {
      row: row + rowDirection * offset,
      col: col + colDirection * offset
    };

    if (isInsideBoard(candidate.row, candidate.col, board.length) && board[candidate.row][candidate.col] === null) {
      candidates.push(candidate);
    }
  }

  return candidates;
}

function hasOpenFour(board, row, col, rowDirection, colDirection) {
  const backward = collectLine(board, row, col, -rowDirection, -colDirection, "black");
  const forward = collectLine(board, row, col, rowDirection, colDirection, "black");
  const line = [...backward.reverse(), { row, col }, ...forward];

  if (line.length !== 4) {
    return false;
  }

  const before = {
    row: line[0].row - rowDirection,
    col: line[0].col - colDirection
  };
  const after = {
    row: line[line.length - 1].row + rowDirection,
    col: line[line.length - 1].col + colDirection
  };

  return (
    isInsideBoard(before.row, before.col, board.length) &&
    isInsideBoard(after.row, after.col, board.length) &&
    board[before.row][before.col] === null &&
    board[after.row][after.col] === null
  );
}

function countLineLength(board, row, col, rowDirection, colDirection, color) {
  return (
    1 +
    collectLine(board, row, col, rowDirection, colDirection, color).length +
    collectLine(board, row, col, -rowDirection, -colDirection, color).length
  );
}
