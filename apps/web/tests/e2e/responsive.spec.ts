import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "./test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureVaultPath = path.join(__dirname, "fixtures", "sample-vault");

/** Opens the fixture folder through the fallback folder picker, which Playwright can drive. */
async function openFixtureVault(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(window, "showDirectoryPicker", { value: undefined, configurable: true });
  });
  await page.goto("/workspace/example");
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("main").getByRole("button", { name: "Open Folder" }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(fixtureVaultPath);
}

test.describe("responsive shell at mobile width", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("shows no explorer and no rail on the start screen", async ({ page }) => {
    await page.goto("/workspace/example");

    await expect(page.getByRole("main").getByRole("button", { name: "Open Folder" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "File Explorer" })).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Activity bar" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /explorer$/ })).toHaveCount(0);
  });

  test("opens the drawer when a folder opens, with the rail's actions at its top, and toggles it", async ({ page }) => {
    await openFixtureVault(page);

    const explorer = page.getByRole("navigation", { name: "File Explorer" });
    const closeButton = page.getByRole("button", { name: "Close explorer" });
    await expect(closeButton).toHaveAttribute("aria-pressed", "true");
    // The drawer opens below the title bar, which stays above it so its toggle remains tappable.
    // It animates in via a CSS transform transition, so poll until it settles.
    await expect.poll(async () => (await explorer.boundingBox())?.x).toBe(0);
    expect((await explorer.boundingBox())?.y).toBe(44);
    await expect(page.getByRole("navigation", { name: "Activity bar" })).toBeHidden();
    await expect(explorer.getByRole("button", { name: "Settings" })).toBeVisible();
    await expect(explorer.getByRole("button", { name: "Search" })).toBeVisible();

    await closeButton.click();

    await expect(page.getByRole("button", { name: "Open explorer" })).toHaveAttribute("aria-pressed", "false");
    await expect.poll(async () => (await explorer.boundingBox())?.x).toBeLessThan(0);
  });

  test("closes the explorer when tapping the backdrop", async ({ page }) => {
    await openFixtureVault(page);

    const explorer = page.getByRole("navigation", { name: "File Explorer" });
    await expect.poll(async () => (await explorer.boundingBox())?.x).toBe(0);

    // Click near the right edge of the viewport, outside the drawer's own width.
    await page.mouse.click(360, 400);

    await expect(page.getByRole("button", { name: "Open explorer" })).toBeVisible();
    await expect.poll(async () => (await explorer.boundingBox())?.x).toBeLessThan(0);
  });
});

test.describe("responsive shell at desktop width", () => {
  test("shows the rail, and toggles the explorer column from the title bar", async ({ page }) => {
    await openFixtureVault(page);

    const rail = page.getByRole("navigation", { name: "Activity bar" });
    const explorer = page.getByRole("navigation", { name: "File Explorer" });
    const railExplorer = rail.getByRole("button", { name: "Explorer" });
    const toggle = page.getByRole("button", { name: "Toggle Explorer" });
    await expect(railExplorer).toHaveAttribute("aria-current", "true");
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect(rail.getByRole("button", { name: "Settings" })).toBeVisible();
    // The title bar's drawer button and the drawer's own actions are for narrow screens only.
    await expect(page.getByRole("button", { name: "Close explorer" })).toBeHidden();
    await expect(explorer.getByRole("button", { name: "Settings" })).toBeHidden();
    // The rail and explorer grow in as the folder opens, so poll until they settle.
    await expect
      .poll(async () => {
        const railBox = await rail.boundingBox();
        return (await explorer.boundingBox())?.x === (railBox?.x ?? 0) + (railBox?.width ?? 0) && railBox?.width === 44;
      })
      .toBe(true);

    await toggle.click();

    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    // The column collapses its width via a CSS transition, so poll until it settles.
    await expect.poll(async () => (await explorer.boundingBox())?.width).toBe(0);

    // Explorer stays marked: the frame still shows the workspace's files.
    await expect(railExplorer).toHaveAttribute("aria-current", "true");

    // The rail's Explorer button only goes to the explorer, so it brings the column back.
    await railExplorer.click();

    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect.poll(async () => (await explorer.boundingBox())?.width).toBeGreaterThan(0);
  });
});
