import { expect, test } from "@playwright/test";

test.describe("responsive shell at mobile width", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("starts on the start screen with the explorer closed and toggles it open and closed", async ({ page }) => {
    await page.goto("/workspace/example");

    const explorer = page.getByRole("navigation", { name: "File Explorer" });
    const openButton = page.getByRole("button", { name: "Open explorer" });

    // The start screen offers the folder, so the drawer does not cover it.
    await expect(page.getByRole("main").getByRole("button", { name: "Open Folder" })).toBeVisible();
    await expect(openButton).toHaveAttribute("aria-pressed", "false");
    await expect.poll(async () => (await explorer.boundingBox())?.x).toBeLessThan(0);

    await openButton.click();

    const closeButton = page.getByRole("button", { name: "Close explorer" });
    await expect(closeButton).toHaveAttribute("aria-pressed", "true");
    await expect(explorer).toContainText("No folder open");
    // The drawer opens below the title bar, which stays above it so its toggle remains tappable.
    // It animates in via a CSS transform transition, so poll until it settles.
    await expect.poll(async () => (await explorer.boundingBox())?.x).toBe(0);
    expect((await explorer.boundingBox())?.y).toBe(40);

    await closeButton.click();

    await expect(openButton).toHaveAttribute("aria-pressed", "false");
    await expect.poll(async () => (await explorer.boundingBox())?.x).toBeLessThan(0);
  });

  test("closes the explorer when tapping the backdrop", async ({ page }) => {
    await page.goto("/workspace/example");

    const explorer = page.getByRole("navigation", { name: "File Explorer" });
    await page.getByRole("button", { name: "Open explorer" }).click();
    await expect.poll(async () => (await explorer.boundingBox())?.x).toBe(0);

    // Click near the right edge of the viewport, outside the drawer's own width.
    await page.mouse.click(360, 400);

    await expect(page.getByRole("button", { name: "Open explorer" })).toBeVisible();
    await expect.poll(async () => (await explorer.boundingBox())?.x).toBeLessThan(0);
  });
});

test.describe("responsive shell at desktop width", () => {
  test("keeps the explorer open by default and toggles it closed and open", async ({ page }) => {
    await page.goto("/workspace/example");

    const explorer = page.getByRole("navigation", { name: "File Explorer" });
    await expect(page.getByRole("button", { name: "Close explorer" })).toBeVisible();
    expect((await explorer.boundingBox())?.x).toBe(0);

    await page.getByRole("button", { name: "Close explorer" }).click();

    await expect(page.getByRole("button", { name: "Open explorer" })).toHaveAttribute("aria-pressed", "false");
    // The column collapses its width via a CSS transition, so poll until it settles.
    await expect.poll(async () => (await explorer.boundingBox())?.width).toBe(0);

    await page.getByRole("button", { name: "Open explorer" }).click();

    await expect(page.getByRole("button", { name: "Close explorer" })).toHaveAttribute("aria-pressed", "true");
    await expect.poll(async () => (await explorer.boundingBox())?.width).toBeGreaterThan(0);
  });
});
