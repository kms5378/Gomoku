import { BOARD_SIZE, type Board, type ForbiddenBlackMoveReason } from "@/src/lib/gomoku";

export type ForbiddenBoardCell = {
  row: number;
  col: number;
  reason: ForbiddenBlackMoveReason;
};

type GomokuBoardProps = {
  board: Board;
  disabled: boolean;
  forbiddenCells?: ForbiddenBoardCell[];
  lastMove?: { row: number; col: number };
  winningCells?: Array<{ row: number; col: number }>;
  onPlaceStone: (row: number, col: number) => void;
};

const STAR_POINTS = new Set(["3:3", "3:7", "3:11", "7:3", "7:7", "7:11", "11:3", "11:7", "11:11"]);

export function GomokuBoard({
  board,
  disabled,
  forbiddenCells = [],
  lastMove,
  winningCells = [],
  onPlaceStone
}: GomokuBoardProps) {
  const winningSet = new Set(winningCells.map((cell) => `${cell.row}:${cell.col}`));
  const forbiddenMap = new Map(forbiddenCells.map((cell) => [`${cell.row}:${cell.col}`, cell.reason]));

  return (
    <div className="boardShell" aria-label="15 by 15 gomoku board">
      <div className="boardGrid">
        {Array.from({ length: BOARD_SIZE }).map((_, row) =>
          Array.from({ length: BOARD_SIZE }).map((__, col) => {
            const stone = board[row][col];
            const cellKey = `${row}:${col}`;
            const isWinning = winningSet.has(`${row}:${col}`);
            const isStarPoint = STAR_POINTS.has(`${row}:${col}`);
            const isLastMove = lastMove?.row === row && lastMove.col === col;
            const forbiddenReason = forbiddenMap.get(cellKey);
            const isForbidden = forbiddenReason !== undefined;
            const cellLabel = [
              `Row ${row + 1}, column ${col + 1}`,
              stone,
              isLastMove ? "last move" : null,
              forbiddenReason ? `forbidden ${forbiddenReason}` : null
            ]
              .filter(Boolean)
              .join(", ");

            return (
              <button
                aria-label={cellLabel}
                className={`boardCell${isLastMove ? " lastMoveCell" : ""}${isForbidden ? " forbiddenCell" : ""}`}
                disabled={disabled || stone !== null || isForbidden}
                key={`${row}:${col}`}
                onClick={() => onPlaceStone(row, col)}
                title={forbiddenReason ? forbiddenTitle(forbiddenReason) : undefined}
                type="button"
              >
                {isStarPoint ? <span className="starPoint" /> : null}
                {stone ? <span className={`stone ${stone}${isWinning ? " winning" : ""}`} /> : null}
                {isLastMove ? <span aria-hidden="true" className="lastMoveMarker" /> : null}
                {forbiddenReason ? <span aria-hidden="true" className="forbiddenMark" /> : null}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function forbiddenTitle(reason: ForbiddenBlackMoveReason): string {
  return reason === "double-three" ? "흑 3x3 금수" : "흑 4x4 금수";
}
