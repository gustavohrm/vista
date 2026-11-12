import { expect, test } from "@playwright/test";

test("boots the styled shared app on direct navigation and reload", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  const response = await page.goto("/workspace/example");

  expect(response?.status()).toBe(200);
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { name: "Vista" })).toBeVisible();
  await expect(main.getByRole("button", { name: "Open Folder" })).toBeVisible();
  await expect(main).toHaveAttribute("data-platform", "web");
  await expect(main).toHaveCSS("display", "flex");

  await page.reload();

  await expect(main.getByRole("button", { name: "Open Folder" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("toggles theme between dark and light", async ({ page }) => {
  await page.goto("/workspace/example");

  const initialTheme = await page.locator("html").getAttribute("data-theme");
  const oppositeTheme = initialTheme === "dark" ? "light" : "dark";

  const themeBtn = page.getByRole("button", { name: new RegExp(`switch to ${oppositeTheme} theme`, "i") });
  await expect(themeBtn).toBeVisible();

  // Toggle to opposite theme
  await themeBtn.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", oppositeTheme);

  // Toggle back to initial theme
  const backBtn = page.getByRole("button", { name: new RegExp(`switch to ${initialTheme} theme`, "i") });
  await backBtn.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", initialTheme ?? "dark");
});
