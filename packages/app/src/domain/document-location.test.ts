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
