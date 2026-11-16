import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "./test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureVaultPath = path.join(__dirname, "fixtures", "sample-vault");

/** Opens the sample folder through the fallback folder picker, then people.csv in its table. */
async function openTable(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(window, "showDirectoryPicker", { value: undefined, configurable: true });
  });
  await page.goto("/workspace/example");
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("main").getByRole("button", { name: "Open Folder" }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(fixtureVaultPath);
  await page.keyboard.press("Control+p");
  await page.keyboard.type("people.csv");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("textbox", { name: "Column 1 name" })).toHaveValue("Name");
}

function firstColumn(page: Page) {
  return page
    .locator("tbody tr td:nth-child(2) input")
    .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
}

test.describe("CSV table", () => {
  test("lines the table up with the first tab", async ({ page }) => {
    await openTable(page);
    const tab = page.getByRole("tab", { name: "people.csv" });
    const table = page.locator(".csv-table table");
    // Polled, since the shell slides into place as the folder opens.
    await expect
      .poll(async () => {
        const [tabBox, tableBox] = await Promise.all([tab.boundingBox(), table.boundingBox()]);
        return tabBox && tableBox ? Math.round(tableBox.x - tabBox.x) : null;
      })
      .toBe(0);
  });

  test("drags a row by its number to a new place", async ({ page }) => {
    await openTable(page);
    const handle = await page.getByRole("button", { name: "Move row 1" }).boundingBox();
    const last = await page.getByRole("button", { name: "Move row 3" }).boundingBox();
    expect(handle && last).toBeTruthy();

    await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle!.x + handle!.width / 2, last!.y + last!.height / 2 + 4, { steps: 8 });
    await expect(page.locator("[data-row-dragging]")).toBeVisible();
    await page.mouse.up();

    await expect.poll(() => firstColumn(page)).toEqual(["Grace", "Linus", "Ada"]);
    await expect(page.locator("[data-row-dragging]")).toHaveCount(0);
  });

  test("puts the row back when Escape is pressed during a drag", async ({ page }) => {
    await openTable(page);
    const handle = await page.getByRole("button", { name: "Move row 1" }).boundingBox();
    await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height * 2, { steps: 8 });
    await page.keyboard.press("Escape");
    await page.mouse.up();

    await expect(page.locator("[data-row-dragging]")).toHaveCount(0);
    expect(await firstColumn(page)).toEqual(["Ada", "Grace", "Linus"]);
  });
});
