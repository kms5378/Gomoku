import { expect, test } from "@playwright/test";

test("loads the lobby with websocket server-backed actions", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "오목 대전" })).toBeVisible();
  await expect(page.getByLabel("닉네임")).toBeVisible();
  await expect(page.getByRole("link", { name: "랭킹 보기" })).toHaveAttribute("href", "/ranking");
  await expect(page.getByRole("button", { name: "방 만들기" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "입장" })).toBeEnabled();
});
