import { describe, expect, it } from "vitest";

import { joinWorkspacePath, validateEntryName } from "./path-validation";

describe("validateEntryName", () => {
  it("accepts an ordinary name with no siblings", () => {
    expect(validateEntryName("notes.md", [])).toBeNull();
  });

  it("accepts a name that does not collide with siblings", () => {
    expect(validateEntryName("notes.md", ["todo.md", "ideas.md"])).toBeNull();
  });

  it("rejects an empty name", () => {
    expect(validateEntryName("", [])).toBe("Name cannot be empty.");
  });

  it("rejects a name with leading or trailing whitespace", () => {
    expect(validateEntryName(" notes.md", [])).toBe("Name cannot start or end with a space.");
    expect(validateEntryName("notes.md ", [])).toBe("Name cannot start or end with a space.");
  });

  it("rejects the reserved names . and ..", () => {
    expect(validateEntryName(".", [])).toBe("This name is reserved.");
    expect(validateEntryName("..", [])).toBe("This name is reserved.");
  });

  it("rejects a name ending with a period", () => {
    expect(validateEntryName("notes.", [])).toBe("Name cannot end with a period.");
  });

  it.each(['"', "*", "/", ":", "<", ">", "?", "\\", "|"])(
    "rejects a name containing the reserved character %s",
    (char) => {
      expect(validateEntryName(`notes${char}md`, [])).toContain("cannot contain");
    },
  );

  it("rejects a name containing a control character", () => {
    const nameWithControlChar = `notes${String.fromCharCode(7)}.md`;
    expect(validateEntryName(nameWithControlChar, [])).toContain("cannot contain");
  });

  it("rejects a name that collides with a sibling case-insensitively", () => {
    expect(validateEntryName("Notes.md", ["notes.md"])).toBe('"Notes.md" already exists here.');
  });

  it("accepts a name matching its own current name when siblings exclude it", () => {
    // Caller is expected to exclude the entry's own current name from siblingNames when renaming.
    expect(validateEntryName("notes.md", ["todo.md"])).toBeNull();
  });
});

describe("joinWorkspacePath", () => {
  it("returns the name alone for the workspace root", () => {
    expect(joinWorkspacePath("", "notes.md")).toBe("notes.md");
  });

  it("joins a non-root parent path with a slash", () => {
    expect(joinWorkspacePath("docs", "notes.md")).toBe("docs/notes.md");
  });

  it("joins a nested parent path with a slash", () => {
    expect(joinWorkspacePath("docs/archive", "notes.md")).toBe("docs/archive/notes.md");
  });
});
