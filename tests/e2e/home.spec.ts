import { expect, test } from "@playwright/test";

test("loads the lobby and shows the Supabase guard when env vars are missing", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "오목 대전" })).toBeVisible();
  await expect(page.getByLabel("닉네임")).toBeVisible();
  await expect(page.getByRole("link", { name: "랭킹 보기" })).toHaveAttribute("href", "/ranking");

  const hasBrowserKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !hasBrowserKey) {
    await expect(page.getByText("Supabase 환경 변수가 필요합니다")).toBeVisible();
    await expect(page.getByRole("button", { name: "방 만들기" })).toBeDisabled();
  }
});
