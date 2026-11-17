import { describe, expect, it } from "vitest";

import { findChangelogProblems } from "./changelog.mjs";

const ENTRY = `---
title: 0.2.0
date: 2026-12-01
description: Folders open faster.
---

# 0.2.0

## Changed

- Large folders open faster.
`;

const INDEX = `---
title: Changelog
---

# Changelog

- [0.2.0](0.2.0.md)
- [0.1.0](0.1.0.md)
`;

/** @type {(pages: Record<string, string | undefined>) => (name: string) => string | null} */
const readerFor = (pages) => (name) => pages[name] ?? null;

const PAGES = { "index.md": INDEX, "0.2.0.md": ENTRY, "0.1.0.md": ENTRY.replaceAll("0.2.0", "0.1.0") };

describe("findChangelogProblems", () => {
  it("passes when the version has a complete entry the index lists first", () => {
    expect(findChangelogProblems("0.2.0", readerFor(PAGES))).toEqual([]);
  });

  it("fails when there is no index", () => {
    const pages = { ...PAGES, "index.md": undefined };
    expect(findChangelogProblems("0.2.0", readerFor(pages))).toEqual([expect.stringContaining("index.md is missing")]);
  });

  it("fails when the version has no page", () => {
    expect(findChangelogProblems("0.3.0", readerFor(PAGES))).toEqual([expect.stringContaining("0.3.0.md is missing")]);
  });

  it("fails when the index does not link the version", () => {
    const pages = { ...PAGES, "index.md": INDEX.replace("- [0.2.0](0.2.0.md)\n", "") };
    expect(findChangelogProblems("0.2.0", readerFor(pages))).toEqual([
      expect.stringContaining("does not link 0.2.0.md"),
    ]);
  });

  it("fails when the index lists an older version first", () => {
    const pages = {
      ...PAGES,
      "index.md": INDEX.replace("- [0.2.0](0.2.0.md)\n- [0.1.0](0.1.0.md)", "- [0.1.0](0.1.0.md)\n- [0.2.0](0.2.0.md)"),
    };
    expect(findChangelogProblems("0.2.0", readerFor(pages))).toEqual([
      expect.stringContaining("must list 0.2.0.md first"),
    ]);
  });

  it("fails when the index links a page that does not exist", () => {
    const pages = { ...PAGES, "0.1.0.md": undefined };
    expect(findChangelogProblems("0.2.0", readerFor(pages))).toEqual([
      expect.stringContaining("links 0.1.0.md, which does not exist"),
    ]);
  });

  it("reports an incomplete entry", () => {
    const pages = { ...PAGES, "0.2.0.md": ENTRY.replace("description: Folders open faster.", "description: TODO") };
    expect(findChangelogProblems("0.2.0", readerFor(pages))).toEqual([expect.stringContaining('"description"')]);
  });
});
