import { describe, expect, it } from "vitest";

import { findTextChange } from "./text-change";

describe("findTextChange", () => {
  it("returns null when the texts are equal", () => {
    expect(findTextChange("same", "same")).toBeNull();
  });

  it("replaces only the differing middle of the text", () => {
    expect(findTextChange("hello world", "hello brave world")).toEqual({ from: 6, to: 6, insert: "brave " });
  });

  it("describes a deletion as an empty insert", () => {
    expect(findTextChange("abcdef", "abef")).toEqual({ from: 2, to: 4, insert: "" });
  });

  it("does not let the common prefix and suffix overlap when a repeated character is inserted", () => {
    expect(findTextChange("aa", "aaa")).toEqual({ from: 2, to: 2, insert: "a" });
  });

  it("replaces the whole text when nothing is shared", () => {
    expect(findTextChange("abc", "xyz")).toEqual({ from: 0, to: 3, insert: "xyz" });
  });
});
