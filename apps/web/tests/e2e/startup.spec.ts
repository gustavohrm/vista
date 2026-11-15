import { expect, test } from "./test";

test("boots the styled shared app on direct navigation and reload", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  const response = await page.goto("/workspace/example");

  expect(response?.status()).toBe(200);
  expect(response?.headers()["content-security-policy"]).toContain("script-src 'self'");
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { name: "Vista" })).toBeVisible();
  await expect(main.getByRole("button", { name: "Open Folder" })).toBeVisible();
  await expect(main).toHaveAttribute("data-platform", "web");
  await expect(main).toHaveCSS("display", "flex");

  await page.reload();

  await expect(main.getByRole("button", { name: "Open Folder" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("sets the theme from Settings", async ({ page }) => {
  await page.goto("/workspace/example");
  await expect(page.getByRole("button", { name: "Open Folder" })).toBeVisible();

  await page.keyboard.press("Control+Comma");
  const settings = page.getByRole("dialog", { name: "Settings" });
  await settings.getByRole("radio", { name: "Light" }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await settings.getByRole("radio", { name: "Dark" }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});
