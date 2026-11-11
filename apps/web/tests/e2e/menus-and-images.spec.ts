import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureVaultPath = path.join(__dirname, "fixtures", "sample-vault");

/** Uses the fallback folder picker, which Playwright can drive; see workspace-crud-fallback.spec.ts. */
test.describe("menus and Markdown images", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "showDirectoryPicker", { value: undefined, configurable: true });
    });
    await page.goto("/workspace/example");
    await openFixtureVault(page);
  });

  async function openFixtureVault(page: Page) {
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Open Folder" }).first().click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(fixtureVaultPath);
    await expect(page.getByText("gallery.md")).toBeVisible();
  }

  test("shows an image from the workspace, and a placeholder for a missing one", async ({ page }) => {
    await page.getByText("gallery.md").click();

    const image = page.getByRole("img", { name: "Blue badge" });
    await expect(image).toHaveAttribute("src", /^blob:/);
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(64);
    await expect(page.getByRole("img", { name: "Image not shown: Missing picture" })).toBeVisible();
  });

  test("runs a command from the menu bar and returns focus to the editor", async ({ page }) => {
    await page.getByText("notes.md").click();
    await page.getByRole("button", { name: "Raw" }).click();
    const editor = page.getByRole("textbox", { name: "Raw text content of notes.md" });
    await editor.click();
    // The click can land on the empty last line, where Select Line selects nothing.
    await page.keyboard.press("Control+Home");

    await page.getByRole("menuitem", { name: "Selection" }).click();
    await page.getByRole("menuitem", { name: "Select Line" }).click();

    await expect(editor).toBeFocused();
    await expect(page.getByRole("contentinfo", { name: "Status Bar" })).toContainText("(15 selected)");
  });
});
