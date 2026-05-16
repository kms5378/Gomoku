import { BOARD_SIZE, type Board } from "@/src/lib/gomoku";

type GomokuBoardProps = {
  board: Board;
  disabled: boolean;
  winningCells?: Array<{ row: number; col: number }>;
  onPlaceStone: (row: number, col: number) => void;
};

export function GomokuBoard({ board, disabled, winningCells = [], onPlaceStone }: GomokuBoardProps) {
  const winningSet = new Set(winningCells.map((cell) => `${cell.row}:${cell.col}`));

  return (
    <div className="boardShell" aria-label="15 by 15 gomoku board">
      <div className="boardGrid">
        {Array.from({ length: BOARD_SIZE }).map((_, row) =>
          Array.from({ length: BOARD_SIZE }).map((__, col) => {
            const stone = board[row][col];
            const isWinning = winningSet.has(`${row}:${col}`);

            return (
              <button
                aria-label={`Row ${row + 1}, column ${col + 1}${stone ? `, ${stone}` : ""}`}
                className="boardCell"
                disabled={disabled || stone !== null}
                key={`${row}:${col}`}
                onClick={() => onPlaceStone(row, col)}
                type="button"
              >
                {stone ? <span className={`stone ${stone}${isWinning ? " winning" : ""}`} /> : null}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
