import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureVaultPath = path.join(__dirname, "fixtures", "sample-vault");

/** Uses the fallback folder picker, which Playwright can drive; see workspace-crud-fallback.spec.ts. */
test.describe("editor settings and go-to", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "showDirectoryPicker", { value: undefined, configurable: true });
    });
  });

  async function openFixtureVault(page: Page) {
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Open Folder" }).first().click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(fixtureVaultPath);
    await expect(page.getByText("notes.md")).toBeVisible();
  }

  async function openNotesRaw(page: Page) {
    await page.getByText("notes.md").click();
    await page.getByRole("button", { name: "Raw" }).click();
    await expect(page.getByRole("textbox", { name: "Raw text content of notes.md" })).toBeVisible();
  }

  test("keeps an editor setting after a reload", async ({ page }) => {
    await page.goto("/workspace/example");
    await openFixtureVault(page);
    await openNotesRaw(page);
    await expect(page.locator(".cm-lineNumbers")).toBeVisible();

    await page.getByRole("button", { name: "Editor settings" }).click();
    await page.getByRole("menuitemcheckbox", { name: "Line numbers" }).click();
    await expect(page.locator(".cm-lineNumbers")).toHaveCount(0);

    await page.reload();
    await openFixtureVault(page);
    await openNotesRaw(page);

    await expect(page.locator(".cm-lineNumbers")).toHaveCount(0);
    await page.getByRole("button", { name: "Editor settings" }).click();
    await expect(page.getByRole("menuitemcheckbox", { name: "Line numbers" })).not.toBeChecked();
  });

  test("runs a command from the picker in the editor it was opened from", async ({ page }) => {
    await page.goto("/workspace/example");
    await openFixtureVault(page);
    await openNotesRaw(page);
    const editor = page.getByRole("textbox", { name: "Raw text content of notes.md" });
    const original = await editor.innerText();
    await editor.click();
    await page.keyboard.type("typed by the test");
    await expect(editor).toContainText("typed by the test");

    await page.keyboard.press("Control+Shift+p");
    await page.getByRole("combobox", { name: "Run a command" }).pressSequentially("undo");
    await expect(page.getByRole("option", { name: /^Edit: Undo/ })).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Enter");

    await expect(page.getByRole("dialog", { name: "Commands" })).toHaveCount(0);
    await expect(editor).toBeFocused();
    await expect.poll(() => editor.innerText()).toBe(original);
  });

  test("opens a file at a line and column from the go-to picker", async ({ page }) => {
    await page.goto("/workspace/example");
    await openFixtureVault(page);

    await page.keyboard.press("Control+p");
    await page.getByRole("combobox", { name: "Go to file, or :line:column" }).fill("notes:3:9");
    await page.keyboard.press("Enter");

    await expect(page.getByRole("textbox", { name: "Raw text content of notes.md" })).toBeFocused();
    await expect(page.getByRole("contentinfo", { name: "Status Bar" })).toContainText("Ln 3, Col 9");
  });
});
