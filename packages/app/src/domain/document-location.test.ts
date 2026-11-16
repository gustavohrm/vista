import { describe, expect, it } from "vitest";

import { documentLocation, shortenPath } from "./document-location";

describe("documentLocation", () => {
  it("splits a Windows path on disk at its backslashes", () => {
    expect(documentLocation({ rootPath: "C:\\Users\\ana\\notes\\", name: "notes" }, "docs/a.md", true)).toEqual({
      segments: ["C:", "Users", "ana", "notes", "docs", "a.md"],
      separator: "\\",
    });
  });

  it("keeps the leading slash of a POSIX path on disk", () => {
    const location = documentLocation({ rootPath: "/home/ana/notes", name: "notes" }, "a.md", true);

    expect(location).toEqual({ segments: ["", "home", "ana", "notes", "a.md"], separator: "/" });
    expect(shortenPath(location, 0)).toBe("/home/ana/notes/a.md");
  });

  it("keeps a backslash in a POSIX folder name, where it is a character and not a separator", () => {
    const embedded = documentLocation({ rootPath: "/vault/notes\\archive", name: "notes\\archive" }, "docs/a.md", true);
    const trailing = documentLocation({ rootPath: "/vault/notes\\", name: "notes\\" }, "a.md", true);

    expect(shortenPath(embedded, 0)).toBe("/vault/notes\\archive/docs/a.md");
    expect(shortenPath(trailing, 0)).toBe("/vault/notes\\/a.md");
  });

  it("splits a UNC path at its backslashes", () => {
    expect(
      shortenPath(documentLocation({ rootPath: "\\\\server\\share\\notes", name: "notes" }, "a.md", true), 0),
    ).toBe("\\\\server\\share\\notes\\a.md");
  });

  it("starts a path with the folder's name where there is no path on disk", () => {
    expect(documentLocation({ rootPath: "", name: "notes" }, "docs/a.md", false)).toEqual({
      segments: ["notes", "docs", "a.md"],
      separator: " / ",
    });
  });
});

describe("shortenPath", () => {
  const location = {
    segments: ["C:", "Users", "ana", "projects", "notes", "docs", "example.md"],
    separator: "\\",
  };

  it("shows the whole path when nothing is hidden", () => {
    expect(shortenPath(location, 0)).toBe("C:\\Users\\ana\\projects\\notes\\docs\\example.md");
  });

  it("hides segments from the middle, keeping the start and the file name", () => {
    expect(shortenPath(location, 1)).toBe("C:\\Users\\ana\\…\\notes\\docs\\example.md");
    expect(shortenPath(location, 2)).toBe("C:\\Users\\ana\\…\\docs\\example.md");
    expect(shortenPath(location, 3)).toBe("C:\\Users\\…\\docs\\example.md");
  });

  it("always keeps the first segment and the file name", () => {
    expect(shortenPath(location, 99)).toBe("C:\\…\\example.md");
  });
});
