import { describe, expect, it } from "vitest";

import { findEntryProblems, inlineParts, parseChangelogIndex, parseChangelogPage, readChangelog } from "./changelog";

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

  it("reads a page with no frontmatter without throwing", () => {
    expect(parseChangelogPage("0.1.0", "# 0.1.0\n\n## Added\n\n- One thing.\n")).toMatchObject({
      date: "",
      description: "",
      sections: [{ heading: "Added", items: ["One thing."] }],
    });
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

describe("inlineParts", () => {
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
