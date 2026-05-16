import { describe, expect, it } from "vitest";
import {
  BOARD_SIZE,
  buildBoardFromMoves,
  createEmptyBoard,
  detectWinner,
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
