import { describe, expect, it } from "vitest";

import { GO_TO_RESULT_LIMIT, parseGoToQuery, rankFiles } from "./goto";

describe("parseGoToQuery", () => {
  it.each([
    ["notes/a.md", { path: "notes/a.md" }],
    ["notes/a.md:12", { path: "notes/a.md", line: 12 }],
    ["notes/a.md:12:4", { path: "notes/a.md", line: 12, column: 4 }],
    [":12", { path: "", line: 12 }],
    [":12:4", { path: "", line: 12, column: 4 }],
    ["a.md:", { path: "a.md" }],
    ["a.md:12:", { path: "a.md", line: 12 }],
    [":", { path: "" }],
    ["  a.md:3  ", { path: "a.md", line: 3 }],
    ["odd:name.md:3", { path: "odd:name.md", line: 3 }],
  ])("reads %j", (query, expected) => {
    expect(parseGoToQuery(query)).toEqual(expected);
  });
});

describe("rankFiles", () => {
  const paths = ["src/app.tsx", "src/components/tab-strip.tsx", "docs/architecture.md", "README.md"];

  it("lists files alphabetically when the query is empty", () => {
    expect(rankFiles(paths, "").map((match) => match.path)).toEqual([
      "docs/architecture.md",
      "README.md",
      "src/app.tsx",
      "src/components/tab-strip.tsx",
    ]);
  });

  it("keeps only files containing the query's characters in order", () => {
    expect(rankFiles(paths, "tbs").map((match) => match.path)).toEqual(["src/components/tab-strip.tsx"]);
  });

  it("ignores case and spaces", () => {
    expect(rankFiles(paths, "READ me").map((match) => match.path)).toEqual(["README.md"]);
  });

  it("ranks a match in the file name above one spread across folders", () => {
    const ranked = rankFiles(["app/notes/x.md", "archive/notes.md"], "notes");

    expect(ranked[0]?.path).toBe("archive/notes.md");
  });

  it("ranks a run of characters above scattered ones", () => {
    const ranked = rankFiles(["t-a-b.md", "tab.md"], "tab");

    expect(ranked.map((match) => match.path)).toEqual(["tab.md", "t-a-b.md"]);
  });

  it("reports the matched characters", () => {
    expect(rankFiles(["src/app.tsx"], "app")[0]?.positions).toEqual([4, 5, 6]);
  });

  it(`returns at most ${GO_TO_RESULT_LIMIT} files`, () => {
    const many = Array.from({ length: GO_TO_RESULT_LIMIT + 10 }, (_, index) => `file-${index}.md`);

    expect(rankFiles(many, "file")).toHaveLength(GO_TO_RESULT_LIMIT);
  });
});
