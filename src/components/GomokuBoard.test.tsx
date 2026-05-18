import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createEmptyBoard } from "@/src/lib/gomoku";
import { GomokuBoard } from "./GomokuBoard";

describe("GomokuBoard", () => {
  it("marks the last move on the occupied intersection", () => {
    const board = createEmptyBoard();
    board[7][7] = "black";

    const { container } = render(
      <GomokuBoard board={board} disabled={false} lastMove={{ row: 7, col: 7 }} onPlaceStone={vi.fn()} />
    );

    expect((screen.getByLabelText("Row 8, column 8, black, last move") as HTMLButtonElement).disabled).toBe(true);
    expect(container.querySelector(".lastMoveMarker")).not.toBeNull();
  });

  it("marks forbidden black moves and prevents clicking them", () => {
    const onPlaceStone = vi.fn();

    const { container } = render(
      <GomokuBoard
        board={createEmptyBoard()}
        disabled={false}
        forbiddenCells={[{ row: 7, col: 7, reason: "double-three" }]}
        onPlaceStone={onPlaceStone}
      />
    );

    const forbiddenButton = screen.getByLabelText("Row 8, column 8, forbidden double-three");

    expect((forbiddenButton as HTMLButtonElement).disabled).toBe(true);
    expect(forbiddenButton.getAttribute("title")).toBe("흑 3x3 금수");
    expect(container.querySelector(".forbiddenMark")).not.toBeNull();

    fireEvent.click(forbiddenButton);

    expect(onPlaceStone).not.toHaveBeenCalled();
  });

  it("still allows normal empty intersections to be clicked", () => {
    const onPlaceStone = vi.fn();

    render(<GomokuBoard board={createEmptyBoard()} disabled={false} onPlaceStone={onPlaceStone} />);

    fireEvent.click(screen.getByLabelText("Row 1, column 1"));

    expect(onPlaceStone).toHaveBeenCalledWith(0, 0);
  });
});
