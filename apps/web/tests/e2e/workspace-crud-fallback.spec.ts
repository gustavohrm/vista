import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureVaultPath = path.join(__dirname, "fixtures", "sample-vault");

/**
 * These tests force the web adapter's non-FSA fallback path (`<input type="file"
 * webkitdirectory>`) by removing `showDirectoryPicker` before the page loads. The primary
 * File System Access mode opens a native OS folder picker that automation tools cannot drive,
 * so this fallback path is the only one Playwright can exercise end-to-end; FSA-mode behavior
 * is covered separately by adapter-level manual verification.
 */
test.describe("workspace file management (fallback mode)", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "showDirectoryPicker", { value: undefined, configurable: true });
    });
  });

  async function openFixtureVault(page: Page) {
    await page.goto("/workspace/example");
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Open Folder" }).first().click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(fixtureVaultPath);
    await expect(page.getByText("notes.md")).toBeVisible();
  }

  test("creates a new file via the root context menu", async ({ page }) => {
    await openFixtureVault(page);

    const explorer = page.getByRole("navigation", { name: "File Explorer" });
    // Right-click empty space below the single fixture file, not the file row itself,
    // so the context menu targets the workspace root rather than that file.
    await explorer.click({ button: "right", position: { x: 20, y: 300 } });
    await page.getByRole("menuitem", { name: "New File" }).click();
    await page.getByRole("textbox", { name: "Entry name" }).fill("todo.md");
    await page.getByRole("textbox", { name: "Entry name" }).press("Enter");

    await expect(explorer.getByText("todo.md")).toBeVisible();
  });

  test("renames a file", async ({ page }) => {
    await openFixtureVault(page);

    const explorer = page.getByRole("navigation", { name: "File Explorer" });
    await explorer.getByText("notes.md").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Rename" }).click();
    const input = page.getByRole("textbox", { name: "Entry name" });
    await input.fill("journal.md");
    await input.press("Enter");

    await expect(explorer.getByText("journal.md")).toBeVisible();
    await expect(explorer.getByText("notes.md")).toHaveCount(0);
  });

  test("deletes a file after confirmation", async ({ page }) => {
    await openFixtureVault(page);

    const explorer = page.getByRole("navigation", { name: "File Explorer" });
    await explorer.getByText("notes.md").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Delete" }).click();
    const confirmDialog = page.getByRole("dialog");
    await expect(confirmDialog).toContainText('Delete "notes.md"?');
    await confirmDialog.getByRole("button", { name: "Delete", exact: true }).click();

    await expect(explorer.getByText("notes.md")).toHaveCount(0);
  });

  test("keeps the open file when switching files is cancelled at the unsaved-changes prompt", async ({ page }) => {
    await openFixtureVault(page);

    const explorer = page.getByRole("navigation", { name: "File Explorer" });
    await explorer.click({ button: "right", position: { x: 20, y: 300 } });
    await page.getByRole("menuitem", { name: "New File" }).click();
    await page.getByRole("textbox", { name: "Entry name" }).fill("todo.md");
    await page.getByRole("textbox", { name: "Entry name" }).press("Enter");
    await expect(explorer.getByText("todo.md")).toBeVisible();

    await explorer.getByText("notes.md").click();
    await page.getByRole("button", { name: "Raw", exact: true }).click();
    const editor = page.getByRole("textbox", { name: "Raw text content of notes.md" });
    await editor.fill("Edited but not saved");

    await explorer.getByText("todo.md").click();

    const unsavedDialog = page.getByRole("dialog");
    await expect(unsavedDialog).toContainText("Save changes to notes.md?");
    await unsavedDialog.getByRole("button", { name: "Cancel", exact: true }).click();

    await expect(unsavedDialog).toBeHidden();
    await expect(editor).toHaveValue("Edited but not saved");
    await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("notes.md");
  });

  test("rejects creating a file with a name that already exists", async ({ page }) => {
    await openFixtureVault(page);

    const explorer = page.getByRole("navigation", { name: "File Explorer" });
    await explorer.click({ button: "right", position: { x: 20, y: 300 } });
    await page.getByRole("menuitem", { name: "New File" }).click();
    const input = page.getByRole("textbox", { name: "Entry name" });
    await input.fill("notes.md");
    await input.press("Enter");

    await expect(page.getByRole("alert")).toContainText("already exists here");
  });
});
