import { describe, expect, it } from "vitest";

import { imageMimeType, resolveImageSource } from "./image-source";

describe("resolveImageSource", () => {
  it("resolves a relative source from the document's folder", () => {
    expect(resolveImageSource("img/cat.png", "notes/today.md")).toEqual({
      kind: "workspace",
      path: "notes/img/cat.png",
    });
    expect(resolveImageSource("./cat.png", "today.md")).toEqual({ kind: "workspace", path: "cat.png" });
    expect(resolveImageSource("../assets/cat.png", "notes/today.md")).toEqual({
      kind: "workspace",
      path: "assets/cat.png",
    });
  });

  it("resolves a source starting with a slash from the workspace root", () => {
    expect(resolveImageSource("/assets/cat.png", "notes/deep/today.md")).toEqual({
      kind: "workspace",
      path: "assets/cat.png",
    });
  });

  it("decodes percent escapes and drops a query or fragment", () => {
    expect(resolveImageSource("my%20cat.png?v=2#top", "a.md")).toEqual({ kind: "workspace", path: "my cat.png" });
    expect(resolveImageSource("100%.png", "a.md")).toEqual({ kind: "workspace", path: "100%.png" });
    expect(resolveImageSource("sub%5C..%5Ccat.png", "a.md")).toEqual({ kind: "workspace", path: "cat.png" });
  });

  it("does not load a path outside the workspace", () => {
    expect(resolveImageSource("../cat.png", "today.md")).toEqual({ kind: "none" });
    expect(resolveImageSource("/../../etc/cat.png", "a/today.md")).toEqual({ kind: "none" });
  });

  it("passes web and image data URLs through", () => {
    expect(resolveImageSource("https://example.com/a.png", "a.md")).toEqual({
      kind: "url",
      url: "https://example.com/a.png",
    });
    expect(resolveImageSource("data:image/png;base64,AAAA", "a.md")).toMatchObject({ kind: "url" });
  });

  it("loads nothing for other schemes, drive paths, or an empty source", () => {
    expect(resolveImageSource("file:///C:/cat.png", "a.md")).toEqual({ kind: "none" });
    expect(resolveImageSource("C:/cat.png", "a.md")).toEqual({ kind: "none" });
    expect(resolveImageSource("javascript:alert(1)", "a.md")).toEqual({ kind: "none" });
    expect(resolveImageSource("data:text/html,hi", "a.md")).toEqual({ kind: "none" });
    expect(resolveImageSource("  ", "a.md")).toEqual({ kind: "none" });
  });
});

describe("imageMimeType", () => {
  it("names the type from the extension, ignoring case", () => {
    expect(imageMimeType("a/logo.SVG")).toBe("image/svg+xml");
    expect(imageMimeType("photo.jpg")).toBe("image/jpeg");
    expect(imageMimeType("notes.txt")).toBe("");
  });
});
