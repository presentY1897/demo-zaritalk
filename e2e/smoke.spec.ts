import { expect, test } from "@playwright/test";

test("첫 화면이 렌더된다", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
