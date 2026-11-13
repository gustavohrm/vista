import { describe, expect, it } from "vitest";

import {
  documentKey,
  documentsReducer,
  findAffectedDocuments,
  INITIAL_DOCUMENTS_STATE,
  type DocumentsState,
  type LoadedFile,
} from "./documents";

const WS = "ws-1";
const STAT = { size: 10, modifiedAt: 1000 };
const NEWER_STAT = { size: 12, modifiedAt: 2000 };

function loaded(content: string, changes?: Partial<LoadedFile>): LoadedFile {
  return { content, stat: STAT, hasBom: false, isReadOnly: false, ...changes };
}

function openAll(...paths: string[]): DocumentsState {
  return paths.reduce(
    (state, path) =>
      documentsReducer(state, { type: "open", workspaceId: WS, path, file: loaded(`content of ${path}`) }),
    INITIAL_DOCUMENTS_STATE,
  );
}

function paths(state: DocumentsState): string[] {
  return state.documents.map((doc) => doc.path);
}

describe("documentsReducer", () => {
  it("opens a document as a clean, active tab with its name and extension", () => {
    const state = openAll("notes/todo.md");

    expect(state.documents).toEqual([
      {
        key: documentKey(WS, "notes/todo.md"),
        workspaceId: WS,
        path: "notes/todo.md",
        name: "todo.md",
        extension: "md",
        content: "content of notes/todo.md",
        isDirty: false,
        viewMode: "enriched",
        diskStat: STAT,
        hasBom: false,
        isReadOnly: false,
        externalChange: null,
        revision: 0,
      },
    ]);
    expect(state.activeKey).toBe(documentKey(WS, "notes/todo.md"));
  });

  it("opens CSV and plain text in raw mode", () => {
    const state = openAll("data.csv", "a.txt");

    expect(state.documents.map((doc) => doc.viewMode)).toEqual(["raw", "raw"]);
  });

  it("activates the existing tab instead of reloading a document that is already open", () => {
    let state = openAll("a.md", "b.md");
    state = documentsReducer(state, { type: "edit", key: documentKey(WS, "a.md"), content: "edited" });
    state = documentsReducer(state, { type: "open", workspaceId: WS, path: "a.md", file: loaded("from disk") });

    expect(paths(state)).toEqual(["a.md", "b.md"]);
    expect(state.documents[0]?.content).toBe("edited");
    expect(state.activeKey).toBe(documentKey(WS, "a.md"));
  });

  it("inserts a new tab to the right of the active tab", () => {
    let state = openAll("a.md", "b.md");
    state = documentsReducer(state, { type: "activate", key: documentKey(WS, "a.md") });
    state = documentsReducer(state, { type: "open", workspaceId: WS, path: "c.md", file: loaded("") });

    expect(paths(state)).toEqual(["a.md", "c.md", "b.md"]);
  });

  it("marks a document dirty when edited", () => {
    let state = openAll("a.md");
    state = documentsReducer(state, { type: "edit", key: documentKey(WS, "a.md"), content: "new" });

    expect(state.documents[0]).toMatchObject({ content: "new", isDirty: true });
  });

  it("ignores an edit whose content matches the buffer", () => {
    const state = openAll("a.md");

    expect(documentsReducer(state, { type: "edit", key: documentKey(WS, "a.md"), content: "content of a.md" })).toBe(
      state,
    );
  });

  it("clears the dirty flag when the saved content is still the buffer", () => {
    let state = openAll("a.md");
    state = documentsReducer(state, { type: "edit", key: documentKey(WS, "a.md"), content: "new" });
    state = documentsReducer(state, { type: "saved", key: documentKey(WS, "a.md"), content: "new", stat: NEWER_STAT });

    expect(state.documents[0]?.isDirty).toBe(false);
  });

  it("keeps the dirty flag when the buffer changed while the save was in flight", () => {
    let state = openAll("a.md");
    state = documentsReducer(state, { type: "edit", key: documentKey(WS, "a.md"), content: "new" });
    state = documentsReducer(state, { type: "edit", key: documentKey(WS, "a.md"), content: "newer" });
    state = documentsReducer(state, { type: "saved", key: documentKey(WS, "a.md"), content: "new", stat: NEWER_STAT });

    expect(state.documents[0]?.isDirty).toBe(true);
  });

  it("closing the active tab activates its right neighbor", () => {
    let state = openAll("a.md", "b.md", "c.md");
    state = documentsReducer(state, { type: "activate", key: documentKey(WS, "b.md") });
    state = documentsReducer(state, { type: "close", keys: [documentKey(WS, "b.md")] });

    expect(paths(state)).toEqual(["a.md", "c.md"]);
    expect(state.activeKey).toBe(documentKey(WS, "c.md"));
  });

  it("closing the last tab activates its left neighbor", () => {
    let state = openAll("a.md", "b.md");
    state = documentsReducer(state, { type: "close", keys: [documentKey(WS, "b.md")] });

    expect(state.activeKey).toBe(documentKey(WS, "a.md"));
  });

  it("closing an inactive tab keeps the active tab", () => {
    let state = openAll("a.md", "b.md");
    state = documentsReducer(state, { type: "close", keys: [documentKey(WS, "a.md")] });

    expect(state.activeKey).toBe(documentKey(WS, "b.md"));
  });

  it("closing several tabs including the active one activates the nearest survivor", () => {
    let state = openAll("a.md", "b.md", "c.md", "d.md");
    state = documentsReducer(state, { type: "activate", key: documentKey(WS, "b.md") });
    state = documentsReducer(state, { type: "close", keys: [documentKey(WS, "b.md"), documentKey(WS, "c.md")] });

    expect(state.activeKey).toBe(documentKey(WS, "d.md"));
  });

  it("closing every tab leaves no active tab", () => {
    let state = openAll("a.md", "b.md");
    state = documentsReducer(state, { type: "close", keys: state.documents.map((doc) => doc.key) });

    expect(state).toEqual(INITIAL_DOCUMENTS_STATE);
  });

  it("switches a document's view mode", () => {
    let state = openAll("a.md");
    state = documentsReducer(state, { type: "setViewMode", key: documentKey(WS, "a.md"), viewMode: "raw" });

    expect(state.documents[0]?.viewMode).toBe("raw");
  });

  it("keeps raw mode for a format with no enriched view", () => {
    let state = openAll("a.txt");
    state = documentsReducer(state, { type: "setViewMode", key: documentKey(WS, "a.txt"), viewMode: "enriched" });

    expect(state.documents[0]?.viewMode).toBe("raw");
  });

  it("renames an open file in place, keeping its buffer and active state", () => {
    let state = openAll("a.md");
    state = documentsReducer(state, { type: "edit", key: documentKey(WS, "a.md"), content: "unsaved" });
    state = documentsReducer(state, { type: "move", workspaceId: WS, fromPath: "a.md", toPath: "b.md" });

    expect(state.documents[0]).toMatchObject({
      key: documentKey(WS, "b.md"),
      path: "b.md",
      name: "b.md",
      content: "unsaved",
      isDirty: true,
    });
    expect(state.activeKey).toBe(documentKey(WS, "b.md"));
  });

  it("moves every open file inside a renamed folder, and nothing outside it", () => {
    let state = openAll("docs/a.md", "docs/sub/b.md", "docs-old/c.md");
    state = documentsReducer(state, { type: "move", workspaceId: WS, fromPath: "docs", toPath: "notes" });

    expect(paths(state)).toEqual(["notes/a.md", "notes/sub/b.md", "docs-old/c.md"]);
  });

  it("updates the view mode when a rename changes the format", () => {
    let state = openAll("a.md");
    state = documentsReducer(state, { type: "move", workspaceId: WS, fromPath: "a.md", toPath: "a.txt" });

    expect(state.documents[0]).toMatchObject({ extension: "txt", viewMode: "raw" });
  });
});

describe("findAffectedDocuments", () => {
  it("finds the file itself and everything under a folder path", () => {
    const state = openAll("docs/a.md", "docs/sub/b.md", "docs-old/c.md", "docs");

    expect(findAffectedDocuments(state, { workspaceId: WS, path: "docs" }).map((doc) => doc.path)).toEqual([
      "docs/a.md",
      "docs/sub/b.md",
      "docs",
    ]);
  });

  it("ignores documents from other workspaces", () => {
    const state = openAll("a.md");

    expect(findAffectedDocuments(state, { workspaceId: "other", path: "a.md" })).toEqual([]);
  });

  describe("changes on disk", () => {
    const A = documentKey(WS, "a.md");

    it("records the version a save wrote and forgets an earlier change on disk", () => {
      let state = openAll("a.md");
      state = documentsReducer(state, { type: "diskChanged", key: A, stat: NEWER_STAT });
      state = documentsReducer(state, { type: "edit", key: A, content: "mine" });
      state = documentsReducer(state, { type: "saved", key: A, content: "mine", stat: { size: 4, modifiedAt: 3000 } });

      expect(state.documents[0]).toMatchObject({ diskStat: { size: 4, modifiedAt: 3000 }, externalChange: null });
    });

    it("ignores a check that saw the version the tab already has", () => {
      const state = openAll("a.md");

      expect(documentsReducer(state, { type: "diskChanged", key: A, stat: { ...STAT } })).toBe(state);
    });

    it("marks a newer version and a deleted file", () => {
      const changed = documentsReducer(openAll("a.md"), { type: "diskChanged", key: A, stat: NEWER_STAT });
      const deleted = documentsReducer(openAll("a.md"), { type: "diskChanged", key: A, stat: null });

      expect(changed.documents[0]?.externalChange).toBe("changed");
      expect(deleted.documents[0]?.externalChange).toBe("deleted");
    });

    it("reloads a clean tab with the newer version", () => {
      const state = documentsReducer(openAll("a.md"), {
        type: "reloaded",
        key: A,
        file: loaded("from elsewhere", { stat: NEWER_STAT }),
      });

      expect(state.documents[0]).toMatchObject({
        content: "from elsewhere",
        diskStat: NEWER_STAT,
        isDirty: false,
        externalChange: null,
        revision: 1,
      });
    });

    it("keeps unsaved edits instead of reloading, and marks the tab changed on disk", () => {
      let state = documentsReducer(openAll("a.md"), { type: "edit", key: A, content: "mine" });
      state = documentsReducer(state, { type: "reloaded", key: A, file: loaded("theirs", { stat: NEWER_STAT }) });

      expect(state.documents[0]).toMatchObject({
        content: "mine",
        isDirty: true,
        diskStat: STAT,
        externalChange: "changed",
      });
    });
  });

  it("ignores edits to a read-only document", () => {
    const state = documentsReducer(INITIAL_DOCUMENTS_STATE, {
      type: "open",
      workspaceId: WS,
      path: "legacy.csv",
      file: loaded("a�b", { isReadOnly: true }),
    });

    expect(documentsReducer(state, { type: "edit", key: documentKey(WS, "legacy.csv"), content: "x" })).toBe(state);
  });

  it("keeps a read-only document in the raw view, the only view that shows it read-only", () => {
    let state = documentsReducer(INITIAL_DOCUMENTS_STATE, {
      type: "open",
      workspaceId: WS,
      path: "legacy.md",
      file: loaded("text", { isReadOnly: true }),
    });
    expect(state.documents[0]?.viewMode).toBe("raw");
    state = documentsReducer(state, { type: "setViewMode", key: documentKey(WS, "legacy.md"), viewMode: "enriched" });

    expect(state.documents[0]?.viewMode).toBe("raw");
  });
});
