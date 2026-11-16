import { describe, expect, it } from "vitest";

import { MAX_TABLE_CELLS } from "../domain/csv";
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
    (state, path) => documentsReducer(state, { type: "open", folderId: WS, path, file: loaded(`content of ${path}`) }),
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
        folderId: WS,
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
        isPending: false,
      },
    ]);
    expect(state.activeKey).toBe(documentKey(WS, "notes/todo.md"));
  });

  it("opens CSV in the table and plain text raw", () => {
    const state = openAll("data.csv", "a.txt");

    expect(state.documents.map((doc) => doc.viewMode)).toEqual(["enriched", "raw"]);
  });

  it("activates the existing tab instead of reloading a document that is already open", () => {
    let state = openAll("a.md", "b.md");
    state = documentsReducer(state, { type: "edit", key: documentKey(WS, "a.md"), content: "edited" });
    state = documentsReducer(state, { type: "open", folderId: WS, path: "a.md", file: loaded("from disk") });

    expect(paths(state)).toEqual(["a.md", "b.md"]);
    expect(state.documents[0]?.content).toBe("edited");
    expect(state.activeKey).toBe(documentKey(WS, "a.md"));
  });

  it("inserts a new tab to the right of the active tab", () => {
    let state = openAll("a.md", "b.md");
    state = documentsReducer(state, { type: "activate", key: documentKey(WS, "a.md") });
    state = documentsReducer(state, { type: "open", folderId: WS, path: "c.md", file: loaded("") });

    expect(paths(state)).toEqual(["a.md", "c.md", "b.md"]);
  });

  it("moves a tab to another place, keeping the active tab", () => {
    const state = openAll("a.md", "b.md", "c.md");
    const active = state.activeKey;

    const moved = documentsReducer(state, { type: "reorder", key: documentKey(WS, "a.md"), toIndex: 2 });
    expect(paths(moved)).toEqual(["b.md", "c.md", "a.md"]);
    expect(moved.activeKey).toBe(active);

    const back = documentsReducer(moved, { type: "reorder", key: documentKey(WS, "a.md"), toIndex: 0 });
    expect(paths(back)).toEqual(["a.md", "b.md", "c.md"]);
  });

  it("keeps a moved tab within the row, and ignores a move that changes nothing", () => {
    const state = openAll("a.md", "b.md", "c.md");
    const move = (path: string, toIndex: number) =>
      documentsReducer(state, { type: "reorder", key: documentKey(WS, path), toIndex });

    expect(paths(move("a.md", 9))).toEqual(["b.md", "c.md", "a.md"]);
    expect(paths(move("b.md", -1))).toEqual(["b.md", "a.md", "c.md"]);
    expect(move("a.md", -1)).toBe(state);
    expect(move("c.md", 3)).toBe(state);
    expect(move("x.md", 0)).toBe(state);
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
    state = documentsReducer(state, { type: "move", folderId: WS, fromPath: "a.md", toPath: "b.md" });

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
    state = documentsReducer(state, { type: "move", folderId: WS, fromPath: "docs", toPath: "notes" });

    expect(paths(state)).toEqual(["notes/a.md", "notes/sub/b.md", "docs-old/c.md"]);
  });

  it("updates the view mode when a rename changes the format", () => {
    let state = openAll("a.md");
    state = documentsReducer(state, { type: "move", folderId: WS, fromPath: "a.md", toPath: "a.txt" });

    expect(state.documents[0]).toMatchObject({ extension: "txt", viewMode: "raw" });
  });
});

describe("findAffectedDocuments", () => {
  it("finds the file itself and everything under a folder path", () => {
    const state = openAll("docs/a.md", "docs/sub/b.md", "docs-old/c.md", "docs");

    expect(findAffectedDocuments(state, { folderId: WS, path: "docs" }).map((doc) => doc.path)).toEqual([
      "docs/a.md",
      "docs/sub/b.md",
      "docs",
    ]);
  });

  it("ignores documents from other workspaces", () => {
    const state = openAll("a.md");

    expect(findAffectedDocuments(state, { folderId: "other", path: "a.md" })).toEqual([]);
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
        expected: STAT,
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

    it("ignores a reload read before a save that finished during the read", () => {
      let state = documentsReducer(openAll("a.md"), { type: "edit", key: A, content: "saved" });
      state = documentsReducer(state, { type: "saved", key: A, content: "saved", stat: NEWER_STAT });
      const reloaded = documentsReducer(state, {
        type: "reloaded",
        key: A,
        expected: STAT,
        file: loaded("older", { stat: STAT }),
      });

      expect(reloaded).toBe(state);
    });

    it("keeps unsaved edits instead of reloading, and marks the tab changed on disk", () => {
      let state = documentsReducer(openAll("a.md"), { type: "edit", key: A, content: "mine" });
      state = documentsReducer(state, {
        type: "reloaded",
        key: A,
        expected: STAT,
        file: loaded("theirs", { stat: NEWER_STAT }),
      });

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
      folderId: WS,
      path: "legacy.csv",
      file: loaded("a�b", { isReadOnly: true }),
    });

    expect(documentsReducer(state, { type: "edit", key: documentKey(WS, "legacy.csv"), content: "x" })).toBe(state);
  });

  it("keeps a read-only document in the raw view, the only view that shows it read-only", () => {
    let state = documentsReducer(INITIAL_DOCUMENTS_STATE, {
      type: "open",
      folderId: WS,
      path: "legacy.md",
      file: loaded("text", { isReadOnly: true }),
    });
    expect(state.documents[0]?.viewMode).toBe("raw");
    state = documentsReducer(state, { type: "setViewMode", key: documentKey(WS, "legacy.md"), viewMode: "enriched" });

    expect(state.documents[0]?.viewMode).toBe("raw");
  });
});

describe("restored tabs", () => {
  function restore(state = INITIAL_DOCUMENTS_STATE): DocumentsState {
    return documentsReducer(state, {
      type: "restore",
      tabs: [
        { folderId: WS, path: "a.md", viewMode: "raw" },
        { folderId: WS, path: "b.md", viewMode: "enriched" },
      ],
      activeIndex: 1,
    });
  }

  it("adds pending tabs in session order with their view modes and the active one", () => {
    const state = restore();

    expect(paths(state)).toEqual(["a.md", "b.md"]);
    expect(state.documents.map((doc) => [doc.isPending, doc.viewMode])).toEqual([
      [true, "raw"],
      [true, "enriched"],
    ]);
    expect(state.activeKey).toBe(documentKey(WS, "b.md"));
  });

  it("keeps a view mode the file type does not offer out of a restored tab", () => {
    const state = documentsReducer(INITIAL_DOCUMENTS_STATE, {
      type: "restore",
      tabs: [{ folderId: WS, path: "a.txt", viewMode: "enriched" }],
      activeIndex: 0,
    });

    expect(state.documents[0]?.viewMode).toBe("raw");
  });

  it("puts restored tabs before tabs opened meanwhile, which stay active", () => {
    const state = restore(openAll("b.md", "c.md"));

    expect(paths(state)).toEqual(["a.md", "b.md", "c.md"]);
    expect(state.documents[1]?.isPending).toBe(false);
    expect(state.activeKey).toBe(documentKey(WS, "c.md"));
  });

  it("replaces a pending tab in place when its file is read, keeping its view mode", () => {
    let state = restore();
    state = documentsReducer(state, { type: "activate", key: documentKey(WS, "a.md") });
    state = documentsReducer(state, { type: "open", folderId: WS, path: "a.md", file: loaded("text") });

    expect(paths(state)).toEqual(["a.md", "b.md"]);
    expect(state.documents[0]).toMatchObject({ isPending: false, content: "text", viewMode: "raw", diskStat: STAT });
    expect(state.activeKey).toBe(documentKey(WS, "a.md"));
  });

  it("leaves the tab the user switched to active when a pending tab's read finishes", () => {
    let state = restore();
    state = documentsReducer(state, { type: "activate", key: documentKey(WS, "a.md") });
    state = documentsReducer(state, { type: "activate", key: documentKey(WS, "b.md") });
    state = documentsReducer(state, { type: "open", folderId: WS, path: "a.md", file: loaded("text") });

    expect(state.documents[0]?.isPending).toBe(false);
    expect(state.activeKey).toBe(documentKey(WS, "b.md"));
  });

  it("ignores edits and disk changes for a tab not read yet", () => {
    const key = documentKey(WS, "a.md");
    let state = restore();
    const before = state;
    state = documentsReducer(state, { type: "edit", key, content: "typed" });
    state = documentsReducer(state, { type: "diskChanged", key, stat: null });

    expect(state).toBe(before);
  });
});

describe("CSV files too large for the table", () => {
  /** A CSV with one more record than the table shows, at one column per record. */
  const tooLarge = Array.from({ length: MAX_TABLE_CELLS + 1 }, (_, index) => `${index}`).join("\n");

  it("opens one in the raw view", () => {
    const state = documentsReducer(INITIAL_DOCUMENTS_STATE, {
      type: "open",
      folderId: WS,
      path: "big.csv",
      file: loaded(tooLarge),
    });
    expect(state.documents[0]?.viewMode).toBe("raw");
  });

  it("still opens a small one in the table", () => {
    const state = documentsReducer(INITIAL_DOCUMENTS_STATE, {
      type: "open",
      folderId: WS,
      path: "small.csv",
      file: loaded("Name\nAda\n"),
    });
    expect(state.documents[0]?.viewMode).toBe("enriched");
  });

  it("keeps one in the raw view when the table is asked for", () => {
    let state = documentsReducer(INITIAL_DOCUMENTS_STATE, {
      type: "open",
      folderId: WS,
      path: "big.csv",
      file: loaded(tooLarge),
    });
    state = documentsReducer(state, { type: "setViewMode", key: documentKey(WS, "big.csv"), viewMode: "enriched" });
    expect(state.documents[0]?.viewMode).toBe("raw");
  });

  it("moves a tab to the raw view when the file grows past the limit on disk", () => {
    let state = documentsReducer(INITIAL_DOCUMENTS_STATE, {
      type: "open",
      folderId: WS,
      path: "grows.csv",
      file: loaded("Name\nAda\n"),
    });
    state = documentsReducer(state, {
      type: "reloaded",
      key: documentKey(WS, "grows.csv"),
      expected: STAT,
      file: loaded(tooLarge, { stat: NEWER_STAT }),
    });
    expect(state.documents[0]?.viewMode).toBe("raw");
  });
});
