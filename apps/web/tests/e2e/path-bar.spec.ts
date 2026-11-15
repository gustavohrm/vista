import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "./test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const deepVaultPath = path.join(__dirname, "fixtures", "deep-vault");
const FULL_PATH =
  "deep-vault / a-folder-with-a-long-name / another-folder-with-a-long-name / one-more-long-folder / deep-note.md";

/** Opens a folder with one file several folders down, through the fallback folder picker, and opens that file. */
async function openDeepNote(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(window, "showDirectoryPicker", { value: undefined, configurable: true });
  });
  await page.goto("/workspace/example");
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("main").getByRole("button", { name: "Open Folder" }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(deepVaultPath);
  await page.keyboard.press("Control+p");
  await page.keyboard.type("deep-note");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Deep note" })).toBeVisible();
}

function pathText(page: Page) {
  return page.getByRole("contentinfo", { name: "Status Bar" }).locator("[aria-describedby]").first();
}

test.describe("path bar", () => {
  test("shows the whole path where it fits", async ({ page }) => {
    await openDeepNote(page);

    await expect(pathText(page)).toHaveText(FULL_PATH);
  });

  test.describe("on a narrow screen", () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test("shortens the middle of the path to fit, keeping the start and the file name, and fits it again when the room changes", async ({
      page,
    }) => {
      await openDeepNote(page);
      const text = pathText(page);

      await expect(text).toHaveText(/^deep-vault \/ .*… \/ .*deep-note\.md$/);
      expect(await text.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      // The tooltip holds the whole path.
      const bubbleId = await text.getAttribute("aria-describedby");
      await expect(page.locator(`[id="${bubbleId}"]`)).toHaveText(FULL_PATH);

      // With more room the path is fitted again from the whole of it.
      await page.setViewportSize({ width: 1280, height: 800 });
      await expect(text).toHaveText(FULL_PATH);
    });
  });
});
