import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "./test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureVaultPath = path.join(__dirname, "fixtures", "sample-vault");

/** Opens the sample folder through the fallback folder picker, then gallery.md and notes.md in tabs. */
async function openTwoTabs(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(window, "showDirectoryPicker", { value: undefined, configurable: true });
  });
  await page.goto("/workspace/example");
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("main").getByRole("button", { name: "Open Folder" }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(fixtureVaultPath);
  await openFromPicker(page, "gallery.md");
  await openFromPicker(page, "notes.md");
}

async function openFromPicker(page: Page, name: string) {
  await page.keyboard.press("Control+p");
  await page.keyboard.type(name);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("tab", { name })).toBeVisible();
}

function tabNames(page: Page) {
  return page.getByRole("tab").allTextContents();
}

function draggedTab(page: Page) {
  return page.locator("[data-tab-dragging]");
}

/** Presses the pointer on the middle of a tab. */
async function pressOnTab(page: Page, name: string) {
  const box = await page.getByRole("tab", { name }).boundingBox();
  if (!box) {
    throw new Error(`The ${name} tab isn't shown.`);
  }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  return box;
}

test.describe("tabs", () => {
  test("drags a tab to a new place, sliding the tabs it passes aside", async ({ page }) => {
    await openTwoTabs(page);
    await openFromPicker(page, "badge.svg");
    const notes = await page.getByRole("tab", { name: "notes.md" }).boundingBox();

    // Between notes.md and badge.svg.
    await pressOnTab(page, "gallery.md");
    await page.mouse.move(notes!.x + notes!.width + 12, notes!.y + notes!.height / 2, { steps: 8 });
    await expect(draggedTab(page)).toBeVisible();
    // notes.md has slid left into the place gallery.md left.
    await expect
      .poll(async () => (await page.getByRole("tab", { name: "notes.md" }).boundingBox())!.x)
      .toBeLessThan(notes!.x);
    await page.mouse.up();

    await expect.poll(() => tabNames(page)).toEqual(["notes.md", "gallery.md", "badge.svg"]);
    await expect(draggedTab(page)).toHaveCount(0);
  });

  test("puts the tab back when Escape is pressed during a drag", async ({ page }) => {
    await openTwoTabs(page);
    const notes = await page.getByRole("tab", { name: "notes.md" }).boundingBox();

    await pressOnTab(page, "gallery.md");
    await page.mouse.move(notes!.x + notes!.width - 4, notes!.y + notes!.height / 2, { steps: 8 });
    await expect(draggedTab(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(draggedTab(page)).toHaveCount(0);
    await page.mouse.up();

    await expect.poll(() => tabNames(page)).toEqual(["gallery.md", "notes.md"]);
  });

  test("keeps a click on a tab a click, choosing it", async ({ page }) => {
    await openTwoTabs(page);

    await page.getByRole("tab", { name: "gallery.md" }).click();

    await expect(page.getByRole("tab", { name: "gallery.md" })).toHaveAttribute("aria-selected", "true");
    await expect.poll(() => tabNames(page)).toEqual(["gallery.md", "notes.md"]);
  });

  test("keeps focus on a tab moved with Shift+ArrowRight", async ({ page }) => {
    await openTwoTabs(page);
    await page.getByRole("tab", { name: "gallery.md" }).click();

    await page.keyboard.press("Shift+ArrowRight");

    await expect.poll(() => tabNames(page)).toEqual(["notes.md", "gallery.md"]);
    await expect(page.getByRole("tab", { name: "gallery.md" })).toBeFocused();
  });

  test.describe("on a narrow screen", () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test("scrolls the row while a drag rests near its edge", async ({ page }) => {
      await openTwoTabs(page);
      // The explorer opens as a drawer over the tabs on a narrow screen.
      await page.getByRole("button", { name: "Close explorer" }).click();
      const tablist = page.getByRole("tablist", { name: "Open files" });
      await tablist.evaluate((element) => (element.scrollLeft = 0));
      expect(await tablist.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
      const row = await tablist.boundingBox();

      const gallery = await pressOnTab(page, "gallery.md");
      await page.mouse.move(row!.x + row!.width - 4, gallery.y + gallery.height / 2, { steps: 8 });

      await expect.poll(() => tablist.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
      await page.mouse.up();
    });
  });
});
