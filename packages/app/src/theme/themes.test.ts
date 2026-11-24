import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { THEMES } from "../domain/appearance";

// A theme is a value for every colour token the stylesheet defines or sets, so a token added later
// gets a value in every theme, as `docs/specs/appearance.md` requires. The stylesheet is the list.
// Read from disk: Vitest hands a test an empty string for an imported stylesheet, even as `?raw`.
const css = readFileSync(join(import.meta.dirname, "../style.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

function declaredIn(block: string): Set<string> {
  return new Set([...block.matchAll(/(--[\w-]+)\s*:/g)].map((match) => String(match[1])));
}

function blockAfter(selector: RegExp): string {
  const match = selector.exec(css);
  if (!match) {
    throw new Error(`No block for ${selector}`);
  }
  const start = match.index + match[0].length;
  return css.slice(start, css.indexOf("\n}", start));
}

/** The colours `@theme` names without a value of their own, which the themes give one. */
const themed = [...blockAfter(/@theme\s*\{/).matchAll(/(--color-[\w-]+)\s*:\s*currentColor/g)].map((match) =>
  String(match[1]),
);
const blocks = new Map(THEMES.map(({ id }) => [id, declaredIn(blockAfter(new RegExp(`\\.theme-${id}\\s*\\{`)))]));
/** Every token any theme sets: the themed colours and the package's colours Vista draws with. */
const everyToken = new Set([...themed, ...[...blocks.values()].flatMap((tokens) => [...tokens])]);

describe("themes", () => {
  it("names the themed colours in `@theme`", () => {
    expect(themed).toContain("--color-frame");
    expect(themed).toContain("--color-selection");
  });

  it.each(THEMES.map(({ id }) => id))("%s sets every token a theme sets", (id) => {
    const missing = [...everyToken].filter((token) => !blocks.get(id)?.has(token));
    expect(missing).toEqual([]);
  });

  it("gives every themed colour a value of its own in every theme", () => {
    for (const [id] of blocks) {
      const block = blockAfter(new RegExp(`\\.theme-${id}\\s*\\{`));
      for (const token of themed) {
        const value = new RegExp(`${token}\\s*:\\s*([^;]+);`).exec(block)?.[1] ?? "";
        expect(value, `${id} ${token}`).not.toBe("");
        expect(value, `${id} ${token}`).not.toBe("currentColor");
      }
    }
  });
});
