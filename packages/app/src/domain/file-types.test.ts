import { describe, expect, it } from "vitest";

import { getFileIconCategory, getFileKind, normalizeExtension, supportsEnrichedView } from "./file-types";

describe("file-types", () => {
  it("normalizes file extensions correctly", () => {
    expect(normalizeExtension("test.MD")).toBe("md");
    expect(normalizeExtension("/path/to/data.CSV")).toBe("csv");
    expect(normalizeExtension("document.txt")).toBe("txt");
    expect(normalizeExtension("noextension")).toBe("noextension");
    expect(normalizeExtension(".hidden")).toBe("hidden");
  });

  it("classifies supported file kinds", () => {
    expect(getFileKind("md")).toBe("markdown");
    expect(getFileKind("markdown")).toBe("markdown");
    expect(getFileKind("csv")).toBe("csv");
    expect(getFileKind("txt")).toBe("text");
    expect(getFileKind("unknown")).toBe("unknown");
  });

  it("identifies enriched view support", () => {
    expect(supportsEnrichedView("md")).toBe(true);
    expect(supportsEnrichedView("csv")).toBe(true);
    expect(supportsEnrichedView("txt")).toBe(false);
    expect(supportsEnrichedView("bin")).toBe(false);
  });

  it("maps document extensions to the document icon category", () => {
    expect(getFileIconCategory("md")).toBe("document");
    expect(getFileIconCategory("markdown")).toBe("document");
    expect(getFileIconCategory("txt")).toBe("document");
  });

  it("maps csv and json to their dedicated icon categories", () => {
    expect(getFileIconCategory("csv")).toBe("spreadsheet");
    expect(getFileIconCategory("json")).toBe("data");
  });

  it("maps image extensions to the image icon category", () => {
    expect(getFileIconCategory("png")).toBe("image");
    expect(getFileIconCategory("svg")).toBe("image");
    expect(getFileIconCategory("ico")).toBe("image");
  });

  it("maps source and markup extensions to the code icon category", () => {
    expect(getFileIconCategory("ts")).toBe("code");
    expect(getFileIconCategory("css")).toBe("code");
    expect(getFileIconCategory("py")).toBe("code");
  });

  it("maps unlisted extensions to the generic icon category", () => {
    expect(getFileIconCategory("zip")).toBe("generic");
  });

  it("maps an empty extension to the generic icon category", () => {
    expect(getFileIconCategory("")).toBe("generic");
  });

  it("matches extensions case-insensitively", () => {
    expect(getFileIconCategory("PNG")).toBe("image");
  });

  it("does not resolve inherited object properties as categories", () => {
    expect(getFileIconCategory("constructor")).toBe("generic");
  });
});
