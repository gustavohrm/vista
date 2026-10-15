import { expect, test } from "@playwright/test";

test("boots the styled shared app on direct navigation and reload", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  const response = await page.goto("/workspace/example");

  expect(response?.status()).toBe(200);
  const explorer = page.getByRole("navigation", { name: "File Explorer" });
  await expect(explorer.getByRole("button", { name: "Open Folder" })).toBeVisible();
  await expect(page.getByRole("main")).toHaveAttribute("data-platform", "web");
  await expect(page.getByRole("main")).toHaveCSS("display", "flex");
  await expect(page.getByRole("main")).toBeEmpty();

  await page.reload();

  await expect(explorer.getByRole("button", { name: "Open Folder" })).toBeVisible();
  await expect(page.getByRole("main")).toBeEmpty();
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
