import { describe, expect, it } from "vitest";

import {
  folderNameFromPath,
  normalizeFolderPath,
  relateFolderPaths,
  relativeFolderPath,
  resolveRelativePath,
} from "./folder-paths";

describe("normalizeFolderPath", () => {
  it.each([
    ["C:\\Users\\me\\notes\\", "C:/Users/me/notes"],
    ["/home/me//notes/", "/home/me/notes"],
    ["/", "/"],
    ["C:\\", "C:/"],
    ["C:", "C:/"],
    ["\\\\server\\share\\notes", "//server/share/notes"],
  ])("normalizes %s", (path, expected) => {
    expect(normalizeFolderPath(path)).toBe(expected);
  });
});

describe("relateFolderPaths", () => {
  it.each([
    ["/home/me/notes", "/home/me/notes", "same"],
    ["/home/me/notes", "/home/me/notes/work", "contains"],
    ["/home/me/notes/work", "/home/me/notes", "inside"],
    ["/home/me/notes", "/home/me/notes-old", "separate"],
    ["/", "/home", "contains"],
    ["C:\\", "C:\\notes", "contains"],
    ["C:\\Notes", "c:/notes/", "same"],
    ["C:\\Notes", "c:\\notes\\Work", "contains"],
    ["//server/share/A", "\\\\server\\share\\a\\b", "contains"],
  ] as const)("relates %s to %s as %s", (a, b, relation) => {
    expect(relateFolderPaths(a, b)).toBe(relation);
  });

  it("keeps letter case apart outside Windows", () => {
    expect(relateFolderPaths("/home/me/Notes", "/home/me/notes")).toBe("separate");
  });
});

describe("resolveRelativePath", () => {
  it.each([
    ["/home/me/notes", "../sources", "/home/me/sources"],
    ["/home/me/notes", "./a/./b", "/home/me/notes/a/b"],
    ["C:\\Users\\me\\notes", "../../shared/x", "C:/Users/shared/x"],
    ["C:\\notes", "..", "C:/"],
    ["//server/share/notes", "../x", "//server/share/x"],
    ["/home/me/notes", "..", "/home/me"],
  ])("resolves %s with %s", (from, location, expected) => {
    expect(resolveRelativePath(from, location)).toBe(expected);
  });

  it.each([
    ["/home", "../../x"],
    ["C:\\notes", "../../x"],
    ["//server/share", "../x"],
  ])("finds nothing above the root from %s with %s", (from, location) => {
    expect(resolveRelativePath(from, location)).toBeNull();
  });
});

describe("relativeFolderPath", () => {
  it.each([
    ["/home/me/notes", "/home/me/sources", "../sources"],
    ["/home/me/notes", "/home/me/notes/drafts/2024", "drafts/2024"],
    ["/home/me/notes", "/home/me/notes", "."],
    ["/home/me/notes/a/b", "/srv/c", "../../../../../srv/c"],
    ["C:\\Users\\Me\\notes", "c:\\users\\me\\Sources", "../Sources"],
    ["//server/share/notes", "//server/share/work", "../work"],
  ])("finds %s -> %s", (from, to, expected) => {
    expect(relativeFolderPath(from, to)).toBe(expected);
    expect(resolveRelativePath(from, expected)?.toLowerCase()).toBe(normalizeFolderPath(to).toLowerCase());
  });

  it.each([
    ["C:/notes", "D:/sources"],
    ["//server/share/notes", "//server/other/notes"],
    ["C:/notes", "/home/me/notes"],
  ])("has no location from %s to %s on another root", (from, to) => {
    expect(relativeFolderPath(from, to)).toBeNull();
  });
});

describe("folderNameFromPath", () => {
  it.each([
    ["C:\\Users\\me\\notes\\", "notes"],
    ["/home/me/notes", "notes"],
    ["/", "Workspace"],
  ])("names %s %s", (path, name) => {
    expect(folderNameFromPath(path)).toBe(name);
  });
});
