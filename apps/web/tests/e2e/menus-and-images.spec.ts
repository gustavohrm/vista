import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "./test";

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

  test("lights one menu item at a time, following the pointer or the keyboard", async ({ page }) => {
    await page.getByText("gallery.md").click({ button: "right" });
    const menu = page.getByRole("menu");
    const items = menu.getByRole("menuitem");
    const open = items.filter({ hasText: "Open" });
    const rename = items.filter({ hasText: "Rename" });
    const background = (item: typeof open) => item.evaluate((element) => getComputedStyle(element).backgroundColor);
    const unlit = await background(rename);

    // Opened with the pointer, nothing is lit.
    await expect.poll(() => background(open)).toBe(unlit);

    await open.hover();
    const lit = await background(open);
    expect(lit).not.toBe(unlit);

    // The keyboard moves the one highlight away, though the pointer still rests on Open.
    await page.keyboard.press("ArrowDown");
    await expect.poll(() => background(rename)).toBe(lit);
    await expect.poll(() => background(open)).toBe(unlit);

    // The keyboard moved it since, so leaving keeps it.
    await page.mouse.move(1, 1);
    await expect.poll(() => background(rename)).toBe(lit);
  });

  test("lets Tab and Shift+Tab leave a menu in either direction", async ({ page }) => {
    const describeFocus = () =>
      page.evaluate(() => {
        const el = document.activeElement;
        return el ? `${el.tagName}:${el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 20)}` : "none";
      });
    // The workspace switcher's menu, which uses the shared menu like every other.
    const switcher = page.locator('header button[aria-haspopup="menu"]');
    const menu = page.getByRole("menu");

    await switcher.focus();
    const self = await describeFocus();
    await page.keyboard.press("Tab");
    const after = await describeFocus();
    await switcher.focus();
    await page.keyboard.press("Shift+Tab");
    const before = await describeFocus();
    expect(new Set([after, before, self]).size).toBe(3);

    await switcher.focus();
    await page.keyboard.press("Enter");
    await expect(menu).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(menu).toBeHidden();
    expect(await describeFocus()).toBe(after);

    await switcher.focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Shift+Tab");
    await expect(menu).toBeHidden();
    expect(await describeFocus()).toBe(before);
  });

  test("runs a command from the palette and returns focus to the editor", async ({ page }) => {
    await page.getByText("notes.md").click();
    await page.getByRole("button", { name: "Raw" }).click();
    const editor = page.getByRole("textbox", { name: "Raw text content of notes.md" });
    await editor.click();
    // The click can land on the empty last line, where Select Line selects nothing.
    await page.keyboard.press("Control+Home");

    await page.keyboard.press("Control+Shift+P");
    await page.getByRole("option", { name: /^Selection: Select Line/ }).click();

    await expect(editor).toBeFocused();
    await expect(page.getByRole("contentinfo", { name: "Status Bar" })).toContainText("(15 selected)");
  });
});
