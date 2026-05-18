import { BOARD_SIZE, type Board } from "@/src/lib/gomoku";

type GomokuBoardProps = {
  board: Board;
  disabled: boolean;
  winningCells?: Array<{ row: number; col: number }>;
  onPlaceStone: (row: number, col: number) => void;
};

const STAR_POINTS = new Set(["3:3", "3:7", "3:11", "7:3", "7:7", "7:11", "11:3", "11:7", "11:11"]);

export function GomokuBoard({ board, disabled, winningCells = [], onPlaceStone }: GomokuBoardProps) {
  const winningSet = new Set(winningCells.map((cell) => `${cell.row}:${cell.col}`));

  return (
    <div className="boardShell" aria-label="15 by 15 gomoku board">
      <div className="boardGrid">
        {Array.from({ length: BOARD_SIZE }).map((_, row) =>
          Array.from({ length: BOARD_SIZE }).map((__, col) => {
            const stone = board[row][col];
            const isWinning = winningSet.has(`${row}:${col}`);
            const isStarPoint = STAR_POINTS.has(`${row}:${col}`);

            return (
              <button
                aria-label={`Row ${row + 1}, column ${col + 1}${stone ? `, ${stone}` : ""}`}
                className="boardCell"
                disabled={disabled || stone !== null}
                key={`${row}:${col}`}
                onClick={() => onPlaceStone(row, col)}
                type="button"
              >
                {isStarPoint ? <span className="starPoint" /> : null}
                {stone ? <span className={`stone ${stone}${isWinning ? " winning" : ""}`} /> : null}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
