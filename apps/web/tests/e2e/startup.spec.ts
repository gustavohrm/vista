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
  const settings = page.getByRole("region", { name: "Settings" });
  const scheme = settings.getByRole("radiogroup", { name: "Scheme" });
  const html = page.locator("html");
  await scheme.getByText("Light", { exact: true }).click();
  await expect(scheme.getByRole("radio", { name: "Light" })).toBeChecked();
  await expect(html).toHaveAttribute("data-theme", "daylight-light");

  await scheme.getByText("Dark", { exact: true }).click();
  await expect(scheme.getByRole("radio", { name: "Dark" })).toBeChecked();
  await expect(html).toHaveAttribute("data-theme", "daylight-dark");

  const themes = settings.getByRole("radiogroup", { name: "Theme" });
  await themes.getByText("Ocean", { exact: true }).click();
  await expect(themes.getByRole("radio", { name: "Ocean" })).toBeChecked();
  await expect(html).toHaveAttribute("data-theme", "ocean-dark");
  await expect(html).toHaveClass(/\btheme-ocean\b/);
});
