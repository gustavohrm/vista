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

  test("draws the icons of the explorer's menu", async ({ page }) => {
    await page.getByText("gallery.md").click({ button: "right" });

    // The icon transform rewrites only literal ic-* classes into SVGs.
    await expect(page.getByRole("menuitem", { name: "Rename" }).locator("svg")).toBeVisible();
  });

  test("lets Tab and Shift+Tab leave a menu in either direction", async ({ page }) => {
    const describeFocus = () =>
      page.evaluate(() => {
        const el = document.activeElement;
        return el ? `${el.tagName}:${el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 20)}` : "none";
      });
    const fileMenu = page.getByRole("menuitem", { name: "File" });

    await fileMenu.focus();
    await page.keyboard.press("Tab");
    const after = await describeFocus();
    await fileMenu.focus();
    await page.keyboard.press("Shift+Tab");
    const before = await describeFocus();
    expect(new Set([after, before, "BUTTON:File"]).size).toBe(3);

    await fileMenu.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menu", { name: "File" })).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("menu", { name: "File" })).toBeHidden();
    expect(await describeFocus()).toBe(after);

    await fileMenu.focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Shift+Tab");
    await expect(page.getByRole("menu", { name: "File" })).toBeHidden();
    expect(await describeFocus()).toBe(before);
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
