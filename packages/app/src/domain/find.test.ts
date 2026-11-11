import { describe, expect, it } from "vitest";

import { createFindPattern, findMatches, type FindQuery } from "./find";

const LITERAL: FindQuery = { text: "", caseSensitive: false, wholeWord: false, regexp: false };

function matchesOf(text: string, query: Partial<FindQuery>) {
  const pattern = createFindPattern({ ...LITERAL, ...query });
  return pattern ? findMatches(text, pattern) : null;
}

describe("createFindPattern", () => {
  it("has no pattern for an empty query", () => {
    expect(createFindPattern(LITERAL)).toBeNull();
  });

  it("has no pattern for an invalid regular expression", () => {
    expect(createFindPattern({ ...LITERAL, text: "(", regexp: true })).toBeNull();
  });
});

describe("findMatches", () => {
  it("matches literal text, ignoring case by default", () => {
    expect(matchesOf("A.b a.B", { text: "a.b" })).toEqual([
      { from: 0, to: 3 },
      { from: 4, to: 7 },
    ]);
  });

  it("matches case when asked", () => {
    expect(matchesOf("Word word", { text: "word", caseSensitive: true })).toEqual([{ from: 5, to: 9 }]);
  });

  it("matches whole words, counting accented letters as part of a word", () => {
    expect(matchesOf("cão cãozinho não", { text: "cão", wholeWord: true })).toEqual([{ from: 0, to: 3 }]);
  });

  it("matches regular expressions", () => {
    expect(matchesOf("a1 b22", { text: "\\d+", regexp: true })).toEqual([
      { from: 1, to: 2 },
      { from: 4, to: 6 },
    ]);
  });

  it("skips empty matches", () => {
    expect(matchesOf("bab", { text: "a*", regexp: true })).toEqual([{ from: 1, to: 2 }]);
  });
});
