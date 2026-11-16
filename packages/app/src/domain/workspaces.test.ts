import { describe, expect, it } from "vitest";

import {
  DEFAULT_WORKSPACE_COLOR,
  DEFAULT_WORKSPACE_ICON,
  EMPTY_WORKSPACE_LIST,
  MAX_WORKSPACE_NAME_LENGTH,
  findWorkspaceForFolder,
  parseSession,
  parseWorkspaceColor,
  parseWorkspaceFile,
  parseWorkspaceList,
  serializeWorkspaceFile,
  validateWorkspaceName,
  type WorkspaceFileDetails,
  type WorkspaceRecord,
} from "./workspaces";

const research: WorkspaceRecord = {
  id: "w1",
  name: "Research",
  icon: "book-open",
  color: "indigo",
  folderIds: ["f1", "f2"],
  storage: "device",
  lastOpenedAt: 1_700_000_000_000,
};

describe("parseWorkspaceList", () => {
  it("starts empty when nothing is stored", () => {
    expect(parseWorkspaceList(null)).toEqual({ list: EMPTY_WORKSPACE_LIST, isDamaged: false });
  });

  it("reads a stored list", () => {
    const stored = JSON.stringify({ version: 1, lastWorkspaceId: "w1", workspaces: [research] });

    expect(parseWorkspaceList(stored)).toEqual({
      list: { version: 1, lastWorkspaceId: "w1", workspaces: [research] },
      isDamaged: false,
    });
  });

  it.each([
    ["text that isn't JSON", "{not json"],
    ["a newer version", JSON.stringify({ version: 2, workspaces: [research] })],
    ["a list that isn't an object", JSON.stringify([research])],
  ])("reports %s as damaged and starts empty", (_case, stored) => {
    expect(parseWorkspaceList(stored)).toEqual({ list: EMPTY_WORKSPACE_LIST, isDamaged: true });
  });

  it.each([
    ["no id", { ...research, id: "" }],
    ["no folders", { ...research, folderIds: [] }],
    ["a folder id that isn't text", { ...research, folderIds: ["f1", 7] }],
    ["a repeated folder id", { ...research, folderIds: ["f1", "f1"] }],
  ])("drops a workspace with %s and reports the list as damaged", (_case, broken) => {
    const other = { ...research, id: "w2", folderIds: ["f3"] };
    const stored = JSON.stringify({ version: 1, lastWorkspaceId: null, workspaces: [broken, other] });

    expect(parseWorkspaceList(stored)).toEqual({
      list: { version: 1, lastWorkspaceId: null, workspaces: [other] },
      isDamaged: true,
    });
  });

  it("reads which folder on this device each location of a workspace stored in its folder is", () => {
    const inFolder = {
      ...research,
      storage: "folder",
      locations: { ".": "f1", "../sources": "f2", "../gone": "f9", "/abs": "f2", "../bad": 7 },
    };
    const stored = JSON.stringify({ version: 1, lastWorkspaceId: null, workspaces: [inFolder] });

    expect(parseWorkspaceList(stored).list.workspaces[0]).toEqual({
      ...research,
      storage: "folder",
      locations: { ".": "f1", "../sources": "f2" },
    });
  });

  it("always maps the home location to the first folder", () => {
    const inFolder = { ...research, storage: "folder", locations: { ".": "f2" } };
    const stored = JSON.stringify({ version: 1, lastWorkspaceId: null, workspaces: [inFolder] });

    expect(parseWorkspaceList(stored).list.workspaces[0]).toMatchObject({ locations: { ".": "f1" } });
  });

  it("drops locations from a workspace stored on the device", () => {
    const onDevice = { ...research, locations: { ".": "f1" } };
    const stored = JSON.stringify({ version: 1, lastWorkspaceId: null, workspaces: [onDevice] });

    expect(parseWorkspaceList(stored).list.workspaces[0]).toEqual(research);
  });

  it("keeps the first of two workspaces with the same id", () => {
    const second = { ...research, name: "Second", folderIds: ["f9"] };
    const stored = JSON.stringify({ version: 1, lastWorkspaceId: null, workspaces: [research, second] });

    expect(parseWorkspaceList(stored)).toEqual({
      list: { version: 1, lastWorkspaceId: null, workspaces: [research] },
      isDamaged: true,
    });
  });

  it("replaces each bad detail with its default and keeps the others", () => {
    const stored = JSON.stringify({
      version: 1,
      lastWorkspaceId: "w1",
      workspaces: [{ ...research, name: "   ", icon: "rocket", color: "blue", storage: "cloud", lastOpenedAt: -5 }],
    });

    expect(parseWorkspaceList(stored)).toEqual({
      list: {
        version: 1,
        lastWorkspaceId: "w1",
        workspaces: [
          {
            ...research,
            name: "Untitled workspace",
            icon: DEFAULT_WORKSPACE_ICON,
            color: DEFAULT_WORKSPACE_COLOR,
            storage: "device",
            lastOpenedAt: 0,
          },
        ],
      },
      isDamaged: false,
    });
  });

  it("forgets a last workspace id that names no workspace", () => {
    const stored = JSON.stringify({ version: 1, lastWorkspaceId: "gone", workspaces: [research] });

    expect(parseWorkspaceList(stored).list.lastWorkspaceId).toBeNull();
  });
});

describe("findWorkspaceForFolder", () => {
  const single = (id: string, folderId: string, lastOpenedAt: number): WorkspaceRecord => ({
    ...research,
    id,
    folderIds: [folderId],
    lastOpenedAt,
  });

  it("finds the workspace that is exactly that folder", () => {
    const list = { version: 1 as const, lastWorkspaceId: null, workspaces: [research, single("w2", "f1", 5)] };

    expect(findWorkspaceForFolder(list, "f1")?.id).toBe("w2");
  });

  it("ignores a workspace whose details live in the folder, which its file opens instead", () => {
    const inFolder: WorkspaceRecord = { ...single("w2", "f1", 5), storage: "folder", locations: { ".": "f1" } };
    const list = { version: 1 as const, lastWorkspaceId: null, workspaces: [inFolder] };

    expect(findWorkspaceForFolder(list, "f1")).toBeNull();
  });

  it("ignores a workspace that holds the folder among others", () => {
    const list = { version: 1 as const, lastWorkspaceId: null, workspaces: [research] };

    expect(findWorkspaceForFolder(list, "f1")).toBeNull();
  });

  it("picks the most recently opened of two matches", () => {
    const list = {
      version: 1 as const,
      lastWorkspaceId: null,
      workspaces: [single("old", "f1", 10), single("new", "f1", 20)],
    };

    expect(findWorkspaceForFolder(list, "f1")?.id).toBe("new");
  });
});

describe("parseWorkspaceColor", () => {
  it.each([
    ["a palette hue", "indigo", "indigo"],
    ["a custom colour, in lowercase", "#FF8800", "#ff8800"],
    ["a short hex colour", "#f80", DEFAULT_WORKSPACE_COLOR],
    ["a colour name outside the palette", "blue", DEFAULT_WORKSPACE_COLOR],
    ["a hex colour with alpha", "#ff880080", DEFAULT_WORKSPACE_COLOR],
    ["a number", 42, DEFAULT_WORKSPACE_COLOR],
  ])("reads %s", (_case, value, expected) => {
    expect(parseWorkspaceColor(value)).toBe(expected);
  });

  it("keeps a custom colour in the workspace file", () => {
    const text = JSON.stringify({ version: 1, name: "Research", icon: "star", color: "#3a7bd5", folders: ["."] });

    expect(parseWorkspaceFile(text, "home")).toMatchObject({ status: "ok", details: { color: "#3a7bd5" } });
  });
});

describe("validateWorkspaceName", () => {
  it.each([
    ["an empty name", "", "Enter a name."],
    ["a name of spaces", "   ", "Enter a name."],
    [
      "a name over the limit",
      "a".repeat(MAX_WORKSPACE_NAME_LENGTH + 1),
      `Use at most ${MAX_WORKSPACE_NAME_LENGTH} characters.`,
    ],
  ])("rejects %s", (_case, name, message) => {
    expect(validateWorkspaceName(name)).toEqual({ ok: false, message });
  });

  it("accepts a name at the limit, trimmed", () => {
    const name = "a".repeat(MAX_WORKSPACE_NAME_LENGTH);

    expect(validateWorkspaceName(`  ${name} `)).toEqual({ ok: true, name });
  });
});

describe("parseSession", () => {
  it("starts with no tabs when nothing is stored", () => {
    expect(parseSession(null)).toEqual({ version: 1, tabs: [], activeIndex: -1, expanded: {} });
  });

  it("keeps the active tab selected when a damaged tab before it is dropped", () => {
    const stored = {
      version: 1,
      tabs: [
        { folderId: "f1", path: "", viewMode: "raw" },
        { folderId: "f1", path: "b.md", viewMode: "raw" },
        { folderId: "f1", path: "c.md", viewMode: "raw" },
      ],
      activeIndex: 1,
    };
    const session = parseSession(JSON.stringify(stored));
    expect(session.tabs.map((tab) => tab.path)).toEqual(["b.md", "c.md"]);
    expect(session.activeIndex).toBe(0);
  });

  it("selects the first tab when the active one was damaged", () => {
    const stored = {
      version: 1,
      tabs: [
        { folderId: "f1", path: "a.md", viewMode: "raw" },
        { folderId: "f1", path: "", viewMode: "raw" },
      ],
      activeIndex: 1,
    };
    expect(parseSession(JSON.stringify(stored)).activeIndex).toBe(0);
  });

  it("reads a stored session", () => {
    const session = {
      version: 1,
      tabs: [
        { folderId: "f1", path: "notes/a.md", viewMode: "enriched" },
        { folderId: "f2", path: "b.csv", viewMode: "raw" },
      ],
      activeIndex: 1,
      expanded: { f1: ["notes"] },
    };

    expect(parseSession(JSON.stringify(session))).toEqual(session);
  });

  it("drops damaged tabs and keeps the rest", () => {
    const stored = JSON.stringify({
      version: 1,
      tabs: [
        { folderId: "f1", path: "", viewMode: "raw" },
        { folderId: "f1", path: "a.md", viewMode: "fancy" },
        { folderId: "f1", path: "b.md", viewMode: "raw" },
      ],
      activeIndex: 0,
      expanded: { f1: ["x", 3], f2: "y" },
    });

    expect(parseSession(stored)).toEqual({
      version: 1,
      tabs: [{ folderId: "f1", path: "b.md", viewMode: "raw" }],
      activeIndex: 0,
      expanded: { f1: ["x"] },
    });
  });

  it.each([
    ["past the last tab", 2],
    ["negative", -1],
    ["a fraction", 0.5],
  ])("activates the first tab when the stored index is %s", (_case, activeIndex) => {
    const stored = JSON.stringify({
      version: 1,
      tabs: [
        { folderId: "f1", path: "a.md", viewMode: "raw" },
        { folderId: "f1", path: "b.md", viewMode: "raw" },
      ],
      activeIndex,
      expanded: {},
    });

    expect(parseSession(stored).activeIndex).toBe(0);
  });

  it("ignores expanded folders keyed like object internals", () => {
    const stored = '{"version":1,"tabs":[],"activeIndex":-1,"expanded":{"__proto__":["x"]}}';

    expect(Object.keys(parseSession(stored).expanded)).toEqual([]);
  });
});

describe("parseWorkspaceFile", () => {
  it("reads the details and the folder locations", () => {
    const text = JSON.stringify({
      version: 1,
      name: "Research",
      icon: "book-open",
      color: "indigo",
      folders: [".", "../sources"],
    });

    expect(parseWorkspaceFile(text, "home")).toEqual({
      status: "ok",
      details: { name: "Research", icon: "book-open", color: "indigo", folders: [".", "../sources"] },
    });
  });

  it.each([
    ["text that isn't JSON", "{"],
    ["a newer version", JSON.stringify({ version: 2, name: "x", folders: ["."] })],
    ["no version", JSON.stringify({ name: "x", folders: ["."] })],
  ])("can't use %s", (_case, text) => {
    expect(parseWorkspaceFile(text, "home")).toEqual({ status: "unreadable" });
  });

  it("names the workspace after its home folder when the name is bad, and keeps the other details", () => {
    const text = JSON.stringify({ version: 1, name: 42, icon: "star", color: "nope", folders: ["."] });

    expect(parseWorkspaceFile(text, "home")).toEqual({
      status: "ok",
      details: { name: "home", icon: "star", color: DEFAULT_WORKSPACE_COLOR, folders: ["."] },
    });
  });

  it.each([
    ["an absolute path", "/etc"],
    ["a Windows drive path", "C:\\notes"],
    ["a backslash path", "..\\notes"],
    ["an empty location", ""],
  ])("drops %s from the folders", (_case, location) => {
    const text = JSON.stringify({ version: 1, name: "x", folders: [".", location, "../ok"] });

    expect(parseWorkspaceFile(text, "home")).toMatchObject({ details: { folders: [".", "../ok"] } });
  });

  it("puts the home folder first, once", () => {
    const text = JSON.stringify({ version: 1, name: "x", folders: ["../a", ".", "../a"] });

    expect(parseWorkspaceFile(text, "home")).toMatchObject({ details: { folders: [".", "../a"] } });
  });
});

describe("serializeWorkspaceFile", () => {
  it("writes what parseWorkspaceFile reads back", () => {
    const details: WorkspaceFileDetails = { name: "Research", icon: "code", color: "rose", folders: [".", "../b"] };

    expect(parseWorkspaceFile(serializeWorkspaceFile(details), "home")).toEqual({
      status: "ok",
      details,
    });
  });
});
