import { expect, test } from "@playwright/test";

test("boots the styled shared app on direct navigation and reload", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  const response = await page.goto("/workspace/example");

  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Vista", exact: true })).toBeVisible();
  await expect(page.getByRole("main")).toHaveAttribute("data-platform", "web");
  await expect(page.getByRole("main")).toHaveCSS("display", "flex");

  await page.reload();

  await expect(page.getByRole("heading", { name: "Vista", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
