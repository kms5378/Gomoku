import { describe, expect, it } from "vitest";
import {
  BOARD_SIZE,
  buildBoardFromMoves,
  createEmptyBoard,
  detectWinner,
  getForbiddenBlackMove,
  isBoardFull,
  isInsideBoard,
  nextStone,
  placeStone,
  scoreDeltaForOutcome
} from "./gomoku";

describe("gomoku rules", () => {
  it("creates a 15x15 empty board", () => {
    const board = createEmptyBoard();

    expect(board).toHaveLength(BOARD_SIZE);
    expect(board[0]).toHaveLength(BOARD_SIZE);
    expect(board.flat().every((cell) => cell === null)).toBe(true);
  });

  it("creates independent row arrays", () => {
    const board = createEmptyBoard();

    board[0][0] = "black";

    expect(board[1][0]).toBeNull();
  });

  it("places stones without mutating the original board", () => {
    const board = createEmptyBoard();
    const nextBoard = placeStone(board, { row: 7, col: 7, color: "black" });

    expect(board[7][7]).toBeNull();
    expect(nextBoard[7][7]).toBe("black");
  });

  it("rejects occupied cells and out-of-range moves", () => {
    const board = placeStone(createEmptyBoard(), { row: 0, col: 0, color: "black" });

    expect(() => placeStone(board, { row: 0, col: 0, color: "white" })).toThrow(/occupied/i);
    expect(() => placeStone(board, { row: -1, col: 0, color: "white" })).toThrow(/outside/i);
    expect(isInsideBoard(14, 14)).toBe(true);
    expect(isInsideBoard(15, 14)).toBe(false);
    expect(isInsideBoard(1.5, 2)).toBe(false);
  });

  it("detects horizontal, vertical, and diagonal wins", () => {
    const horizontal = buildBoardFromMoves(
      Array.from({ length: 5 }, (_, col) => ({ row: 3, col, color: "black" as const, move_number: col + 1 }))
    );
    const vertical = buildBoardFromMoves(
      Array.from({ length: 5 }, (_, row) => ({ row, col: 9, color: "white" as const, move_number: row + 1 }))
    );
    const diagonal = buildBoardFromMoves(
      Array.from({ length: 5 }, (_, index) => ({
        row: index + 2,
        col: index + 2,
        color: "black" as const,
        move_number: index + 1
      }))
    );
    const antiDiagonal = buildBoardFromMoves(
      Array.from({ length: 5 }, (_, index) => ({
        row: index + 2,
        col: 10 - index,
        color: "white" as const,
        move_number: index + 1
      }))
    );

    expect(detectWinner(horizontal, { row: 3, col: 4, color: "black" })?.winner).toBe("black");
    expect(detectWinner(vertical, { row: 4, col: 9, color: "white" })?.winner).toBe("white");
    expect(detectWinner(diagonal, { row: 6, col: 6, color: "black" })?.winner).toBe("black");
    expect(detectWinner(antiDiagonal, { row: 6, col: 6, color: "white" })?.winner).toBe("white");
  });

  it("allows overlines as wins for the basic gomoku rule", () => {
    const board = buildBoardFromMoves(
      Array.from({ length: 6 }, (_, col) => ({ row: 5, col, color: "black" as const, move_number: col + 1 }))
    );

    expect(detectWinner(board, { row: 5, col: 5, color: "black" })?.line).toHaveLength(6);
  });

  it("forbids black double-three moves", () => {
    const board = buildBoardFromMoves([
      { row: 7, col: 6, color: "black", move_number: 1 },
      { row: 7, col: 8, color: "black", move_number: 2 },
      { row: 6, col: 7, color: "black", move_number: 3 },
      { row: 8, col: 7, color: "black", move_number: 4 }
    ]);

    expect(getForbiddenBlackMove(board, { row: 7, col: 7, color: "black" })).toBe("double-three");
  });

  it("forbids black double-four moves", () => {
    const board = buildBoardFromMoves([
      { row: 7, col: 4, color: "black", move_number: 1 },
      { row: 7, col: 5, color: "black", move_number: 2 },
      { row: 7, col: 6, color: "black", move_number: 3 },
      { row: 4, col: 7, color: "black", move_number: 4 },
      { row: 5, col: 7, color: "black", move_number: 5 },
      { row: 6, col: 7, color: "black", move_number: 6 }
    ]);

    expect(getForbiddenBlackMove(board, { row: 7, col: 7, color: "black" })).toBe("double-four");
  });

  it("does not apply double-three or double-four rules to white", () => {
    const board = buildBoardFromMoves([
      { row: 7, col: 6, color: "white", move_number: 1 },
      { row: 7, col: 8, color: "white", move_number: 2 },
      { row: 6, col: 7, color: "white", move_number: 3 },
      { row: 8, col: 7, color: "white", move_number: 4 }
    ]);

    expect(getForbiddenBlackMove(board, { row: 7, col: 7, color: "white" })).toBeNull();
  });

  it("allows black winning moves even when they also create another threat", () => {
    const board = buildBoardFromMoves([
      { row: 7, col: 3, color: "black", move_number: 1 },
      { row: 7, col: 4, color: "black", move_number: 2 },
      { row: 7, col: 5, color: "black", move_number: 3 },
      { row: 7, col: 6, color: "black", move_number: 4 },
      { row: 4, col: 7, color: "black", move_number: 5 },
      { row: 5, col: 7, color: "black", move_number: 6 },
      { row: 6, col: 7, color: "black", move_number: 7 }
    ]);

    expect(getForbiddenBlackMove(board, { row: 7, col: 7, color: "black" })).toBeNull();
  });

  it("does not report wins for four stones or interrupted lines", () => {
    const fourOnly = buildBoardFromMoves(
      Array.from({ length: 4 }, (_, col) => ({ row: 4, col, color: "black" as const, move_number: col + 1 }))
    );
    const interrupted = buildBoardFromMoves([
      { row: 8, col: 1, color: "white" as const, move_number: 1 },
      { row: 8, col: 2, color: "white" as const, move_number: 2 },
      { row: 8, col: 3, color: "black" as const, move_number: 3 },
      { row: 8, col: 4, color: "white" as const, move_number: 4 },
      { row: 8, col: 5, color: "white" as const, move_number: 5 },
      { row: 8, col: 6, color: "white" as const, move_number: 6 }
    ]);

    expect(detectWinner(fourOnly, { row: 4, col: 3, color: "black" })).toBeNull();
    expect(detectWinner(interrupted, { row: 8, col: 6, color: "white" })).toBeNull();
  });

  it("builds boards in move order and ignores invalid duplicate source moves", () => {
    const board = buildBoardFromMoves([
      { row: 0, col: 1, color: "white", move_number: 2 },
      { row: 0, col: 0, color: "black", move_number: 1 },
      { row: 0, col: 0, color: "white", move_number: 3 },
      { row: 99, col: 99, color: "black", move_number: 4 }
    ]);

    expect(board[0][0]).toBe("black");
    expect(board[0][1]).toBe("white");
  });

  it("detects draw boards and score deltas", () => {
    const fullBoard = createEmptyBoard().map((row, rowIndex) =>
      row.map((_, colIndex) => ((rowIndex + colIndex) % 2 === 0 ? "black" : "white"))
    );

    expect(isBoardFull(fullBoard)).toBe(true);
    expect(nextStone("black")).toBe("white");
    expect(scoreDeltaForOutcome("win")).toBe(3);
    expect(scoreDeltaForOutcome("draw")).toBe(1);
    expect(scoreDeltaForOutcome("loss")).toBe(0);
  });
});
