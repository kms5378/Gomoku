import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

function blockFor(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));
  return match?.[1] ?? "";
}

describe("board css contract", () => {
  it("keeps board cells square across viewport sizes", () => {
    const boardGrid = blockFor(".boardGrid");
    const boardCell = blockFor(".boardCell");

    expect(boardGrid).toContain("grid-template-columns: repeat(15");
    expect(boardGrid).toContain("grid-template-rows: repeat(15");
    expect(boardGrid).toContain("aspect-ratio: 1");
    expect(boardCell).toContain("aspect-ratio: 1");
  });

  it("keeps stones, star points, and hover previews circular", () => {
    expect(blockFor(".stone")).toContain("aspect-ratio: 1");
    expect(blockFor(".starPoint")).toContain("aspect-ratio: 1");
    expect(blockFor(".boardCell:not(:disabled):hover::after")).toContain("aspect-ratio: 1");
  });

  it("keeps last move and forbidden move indicators circular or square", () => {
    expect(blockFor(".lastMoveMarker")).toContain("aspect-ratio: 1");
    expect(blockFor(".forbiddenMark")).toContain("aspect-ratio: 1");
    expect(blockFor(".boardCell.forbiddenCell::before")).toContain("aspect-ratio: 1");
  });
});
