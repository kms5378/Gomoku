import { describe, expect, it } from "vitest";
import { isTransientFetchError, shouldSurfaceBackgroundError, toUserErrorMessage } from "./errors";

describe("error presentation", () => {
  it("recognizes browser fetch failures as transient network errors", () => {
    expect(isTransientFetchError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isTransientFetchError(new Error("TypeError: Failed to fetch"))).toBe(true);
    expect(isTransientFetchError(new Error("Could not find the function public.choose_side"))).toBe(false);
  });

  it("keeps background fetch failures out of the board error banner", () => {
    expect(shouldSurfaceBackgroundError(new TypeError("Failed to fetch"))).toBe(false);
    expect(shouldSurfaceBackgroundError(new Error("Could not find the function public.touch_room_presence"))).toBe(true);
  });

  it("shows a user-facing network message for direct player actions", () => {
    expect(toUserErrorMessage(new TypeError("Failed to fetch"), "착수하지 못했습니다.")).toBe(
      "네트워크 요청에 실패했습니다. 연결을 확인한 뒤 다시 시도하세요."
    );
    expect(toUserErrorMessage(new Error("흑 3x3 금수입니다."), "착수하지 못했습니다.")).toBe("흑 3x3 금수입니다.");
    expect(toUserErrorMessage("unknown", "착수하지 못했습니다.")).toBe("착수하지 못했습니다.");
  });
});
