import { describe, expect, it } from "vitest";

import {
  findEntryProblems,
  findTranslationProblems,
  inlineParts,
  isIsoDate,
  parseChangelogIndex,
  parseChangelogPage,
  readChangelog,
  readIndexItems,
} from "./changelog";

const PAGE = `---
title: 0.2.0
date: 2026-12-01
description: "Folders open faster, and CSV files keep their quotes."
---

# 0.2.0

## Changed

- Large folders open faster.

## Fixed

- Saving a CSV file keeps \`"quoted"\` cells as written.
  ([#12](https://github.com/example/vista/issues/12))
- A second fix.
`;

describe("parseChangelogPage", () => {
  it("reads the frontmatter, the sections, and the body after the title", () => {
    const entry = parseChangelogPage("0.2.0", PAGE);
    expect(entry).toMatchObject({
      version: "0.2.0",
      date: "2026-12-01",
      description: "Folders open faster, and CSV files keep their quotes.",
      sections: [
        { heading: "Changed", items: ["Large folders open faster."] },
        {
          heading: "Fixed",
          items: [
            'Saving a CSV file keeps `"quoted"` cells as written. ([#12](https://github.com/example/vista/issues/12))',
            "A second fix.",
          ],
        },
      ],
    });
    expect(entry.body.startsWith("## Changed")).toBe(true);
  });

  it("continues a bullet over a wrapped line with no indent, as Markdown does", () => {
    const page = "# 0.1.0\n\n## Added\n\n- One thing\nwrapped.\n- Another.\n";
    expect(parseChangelogPage("0.1.0", page).sections[0]?.items).toEqual(["One thing wrapped.", "Another."]);
  });

  it("reads a page with no frontmatter without throwing", () => {
    expect(parseChangelogPage("0.1.0", "# 0.1.0\n\n## Added\n\n- One thing.\n")).toMatchObject({
      date: "",
      description: "",
      sections: [{ heading: "Added", items: ["One thing."] }],
    });
  });
});

describe("isIsoDate", () => {
  it.each([
    ["2026-12-01", true],
    ["2028-02-29", true],
    ["2026-02-29", false],
    ["2026-02-31", false],
    ["2026-1-01", false],
  ])("reads %s as %s", (date, expected) => {
    expect(isIsoDate(date)).toBe(expected);
  });
});

describe("readIndexItems", () => {
  it("keeps an item that links no version page, so the check can report it", () => {
    expect(readIndexItems("- [0.2.0](0.2.0.md)\n- [0.1.0](0.1.0.md\n")).toEqual([
      { text: "[0.2.0](0.2.0.md)", page: "0.2.0.md" },
      { text: "[0.1.0](0.1.0.md", page: null },
    ]);
  });
});

describe("parseChangelogIndex", () => {
  it("lists the linked version pages in order and skips any other link", () => {
    const index = "# Changelog\n\n- [0.2.0](0.2.0.md)\n- [Guide](../guide.md)\n- [0.1.0-beta.1](0.1.0-beta.1.md)\n";
    expect(parseChangelogIndex(index)).toEqual(["0.2.0.md", "0.1.0-beta.1.md"]);
  });
});

describe("readChangelog", () => {
  it("returns the entries the index links, newest first, and only those that exist", () => {
    const pages = {
      "index.md": "- [0.2.0](0.2.0.md)\n- [0.1.5](0.1.5.md)\n- [0.1.0](0.1.0.md)\n",
      "0.2.0.md": PAGE,
      "0.1.0.md": PAGE.replaceAll("0.2.0", "0.1.0"),
      "0.3.0.md": PAGE.replaceAll("0.2.0", "0.3.0"),
    };
    expect(readChangelog(pages).map((entry) => entry.version)).toEqual(["0.2.0", "0.1.0"]);
  });

  it("is empty without an index", () => {
    expect(readChangelog({ "0.2.0.md": PAGE })).toEqual([]);
  });
});

describe("findEntryProblems", () => {
  it("passes a complete entry", () => {
    expect(findEntryProblems("0.2.0", PAGE)).toEqual([]);
  });

  it.each([
    ["a title that is not the version", PAGE.replace("title: 0.2.0", "title: Two"), '"title: 0.2.0"'],
    ["no date", PAGE.replace("date: 2026-12-01\n", ""), '"date"'],
    ["a date that is not ISO", PAGE.replace("2026-12-01", "1 December 2026"), '"date"'],
    ["an impossible date", PAGE.replace("2026-12-01", "2026-13-40"), '"date"'],
    ["a TODO description", PAGE.replace(/description: .*/, "description: TODO"), '"description"'],
    ["a heading Keep a Changelog does not define", PAGE.replace("## Changed", "## Improved"), '"## Improved"'],
    ["a TODO bullet", PAGE.replace("- A second fix.", "- TODO: describe"), "TODO bullet"],
    ["a rolled-over date", PAGE.replace("2026-12-01", "2026-02-31"), '"date"'],
    ["a title heading that is not the version", PAGE.replace("# 0.2.0", "# Two"), '"# 0.2.0"'],
    ["a deeper heading", PAGE.replace("## Changed", "### Improved"), '"### Improved"'],
    ["headings out of order", PAGE.replace("## Changed", "## Security"), "out of order"],
  ])("reports %s", (_case, text, message) => {
    expect(findEntryProblems("0.2.0", text)).toEqual([expect.stringContaining(message)]);
  });

  it("reports a heading with no bullets and an entry with no changes", () => {
    const empty = PAGE.slice(0, PAGE.indexOf("## Changed")) + "## Added\n";
    expect(findEntryProblems("0.2.0", empty)).toEqual([
      expect.stringContaining('"## Added" heading with no bullets'),
      expect.stringContaining("lists no changes"),
    ]);
  });

  it("reports a page with no frontmatter", () => {
    expect(findEntryProblems("0.2.0", "# 0.2.0\n")).toEqual([expect.stringContaining("no frontmatter")]);
  });
});

describe("findTranslationProblems", () => {
  const TRANSLATION = `---
title: 0.2.0
date: 2026-12-01
description: Pastas abrem mais rápido, e arquivos CSV mantêm as aspas.
---

# 0.2.0

## Changed

- Pastas grandes abrem mais rápido.

## Fixed

- Salvar um arquivo CSV mantém células \`"quoted"\` como escritas.
  ([#12](https://github.com/example/vista/issues/12))
- Uma segunda correção.
`;

  it("passes a translation that matches the English page", () => {
    expect(findTranslationProblems("0.2.0", "pt-BR", PAGE, TRANSLATION)).toEqual([]);
  });

  it("names the translated page in each problem", () => {
    const problems = findTranslationProblems(
      "0.2.0",
      "pt-BR",
      PAGE,
      TRANSLATION.replace("title: 0.2.0", "title: 0.1.0"),
    );
    expect(problems).toEqual([expect.stringContaining("docs/changelog/pt-BR/0.2.0.md")]);
  });

  it("fails without frontmatter", () => {
    expect(findTranslationProblems("0.2.0", "es", PAGE, "# 0.2.0\n")).toEqual([
      expect.stringContaining("has no frontmatter"),
    ]);
  });

  it("fails when the date differs from the English page", () => {
    const problems = findTranslationProblems("0.2.0", "es", PAGE, TRANSLATION.replace("2026-12-01", "2026-12-02"));
    expect(problems).toEqual([expect.stringContaining('"date: 2026-12-01"')]);
  });

  it.each(["", "TODO"])("fails when the description is %j", (description) => {
    const translation = TRANSLATION.replace(/^description: .*$/m, `description: ${description}`);
    expect(findTranslationProblems("0.2.0", "es", PAGE, translation)).toEqual([
      expect.stringContaining('"description"'),
    ]);
  });

  it("accepts a description that starts with the word Todo", () => {
    const translation = TRANSLATION.replace(
      /^description: .*$/m,
      "description: Todo el proceso de abrir carpetas es más rápido.",
    );
    expect(findTranslationProblems("0.2.0", "es", PAGE, translation)).toEqual([]);
  });

  it("fails without the version heading", () => {
    expect(findTranslationProblems("0.2.0", "es", PAGE, TRANSLATION.replace("# 0.2.0", "# Versão 0.2.0"))).toEqual([
      expect.stringContaining('"# 0.2.0"'),
    ]);
  });

  it("fails when the headings differ from the English page", () => {
    const problems = findTranslationProblems("0.2.0", "es", PAGE, TRANSLATION.replace("## Fixed", "## Corrigido"));
    expect(problems).toEqual([expect.stringContaining("## Changed, ## Fixed")]);
  });

  it("fails when a heading has a different number of bullets", () => {
    const problems = findTranslationProblems("0.2.0", "es", PAGE, TRANSLATION.replace("- Uma segunda correção.\n", ""));
    expect(problems).toEqual([expect.stringContaining('"## Fixed" has 1 bullets, and the English page 2')]);
  });

  it("fails when a bullet's links or code spans differ from its English bullet", () => {
    const relinked = TRANSLATION.replace("issues/12", "issues/13");
    expect(findTranslationProblems("0.2.0", "es", PAGE, relinked)).toEqual([
      expect.stringContaining('bullet 1 under "## Fixed"'),
    ]);
    const recoded = TRANSLATION.replace('`"quoted"`', '"quoted"');
    expect(findTranslationProblems("0.2.0", "es", PAGE, recoded)).toEqual([
      expect.stringContaining('bullet 1 under "## Fixed"'),
    ]);
  });
});

describe("inlineParts", () => {
  it("keeps the code span that is a link's text", () => {
    expect(inlineParts("See [`strict`](https://example.com).")).toEqual([
      { kind: "text", text: "See " },
      { kind: "code", text: "strict" },
      { kind: "text", text: "." },
    ]);
  });

  it("keeps a link written inside a code span as written", () => {
    expect(inlineParts("Write `[text](url)` for a link.")).toEqual([
      { kind: "text", text: "Write " },
      { kind: "code", text: "[text](url)" },
      { kind: "text", text: " for a link." },
    ]);
  });

  it("keeps code spans apart and a link's text only", () => {
    expect(inlineParts("Use `parseConfig` with `strict`. ([#12](https://example.com/12))")).toEqual([
      { kind: "text", text: "Use " },
      { kind: "code", text: "parseConfig" },
      { kind: "text", text: " with " },
      { kind: "code", text: "strict" },
      { kind: "text", text: ". (#12)" },
    ]);
  });
});
