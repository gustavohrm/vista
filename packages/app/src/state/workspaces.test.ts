import { describe, expect, it, vi } from "vitest";

import { WORKSPACES_STORAGE_KEY, sessionStorageKey, type Session } from "../domain/workspaces";
import { LEGACY_FOLDER_ID, type WorkspaceFolder } from "../ports";
import { createMemoryWorkspace } from "../test-support/memory-workspace";
import { WORKSPACES_BACKUP_KEY, checkFolderOverlap, createWorkspaceStore, type KeyValueStorage } from "./workspaces";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => void values.set(key, value)),
    removeItem: vi.fn((key: string) => void values.delete(key)),
  } satisfies KeyValueStorage & { values: Map<string, string> };
}

const notes: WorkspaceFolder = { id: "f1", name: "notes", rootPath: "/notes" };
let nextId = 0;
const options = () => ({ now: () => 5_000, newId: () => `w${(nextId += 1)}` });

function stored(storage: { values: Map<string, string> }) {
  return JSON.parse(storage.values.get(WORKSPACES_STORAGE_KEY) ?? "null");
}

describe("createWorkspaceStore", () => {
  it("creates a one-folder workspace named after a folder opened for the first time", () => {
    const storage = memoryStorage();
    const store = createWorkspaceStore(storage, options());

    const workspace = store.openFolder(notes);

    expect(workspace).toMatchObject({ name: "notes", folderIds: ["f1"], storage: "device", lastOpenedAt: 5_000 });
    expect(stored(storage)).toEqual({ version: 1, lastWorkspaceId: workspace.id, workspaces: [workspace] });
  });

  it("reopens the workspace that is exactly a folder opened again", () => {
    const storage = memoryStorage();
    const first = createWorkspaceStore(storage, options()).openFolder(notes);

    const again = createWorkspaceStore(storage, { now: () => 9_000, newId: () => "other" }).openFolder(notes);

    expect(again).toEqual({ ...first, lastOpenedAt: 9_000 });
    expect(stored(storage).workspaces).toHaveLength(1);
  });

  it("keeps a folder opened through a directory input for this session only", () => {
    const storage = memoryStorage();
    const store = createWorkspaceStore(storage, options());

    const workspace = store.openFolder({ ...notes, accessMode: "fallback" });

    expect(workspace.folderIds).toEqual(["f1"]);
    expect(store.lastWorkspace()).toBeNull();
    store.saveSession(workspace.id, { version: 1, tabs: [], activeIndex: -1, expanded: {} });
    store.openFolder({ id: "f2", name: "work", rootPath: "/work" });
    expect(storage.values.has(sessionStorageKey(workspace.id))).toBe(false);
    expect(stored(storage).workspaces.map((w: { id: string }) => w.id)).not.toContain(workspace.id);
  });

  it("copies a damaged list aside before its first save", () => {
    const storage = memoryStorage({ [WORKSPACES_STORAGE_KEY]: "{broken" });
    const store = createWorkspaceStore(storage, options());

    store.openFolder(notes);
    store.openFolder(notes);

    expect(storage.values.get(WORKSPACES_BACKUP_KEY)).toBe("{broken");
    expect(storage.setItem.mock.calls.filter(([key]) => key === WORKSPACES_BACKUP_KEY)).toHaveLength(1);
    expect(stored(storage).workspaces).toHaveLength(1);
  });

  it("does not overwrite a damaged list whose copy could not be kept", () => {
    const storage = memoryStorage({ [WORKSPACES_STORAGE_KEY]: "{broken" });
    storage.setItem.mockImplementation((key, value) => {
      if (key === WORKSPACES_BACKUP_KEY) {
        throw new Error("Quota exceeded");
      }
      storage.values.set(key, value);
    });
    const store = createWorkspaceStore(storage, options());

    const workspace = store.openFolder(notes);

    expect(storage.values.get(WORKSPACES_STORAGE_KEY)).toBe("{broken");
    expect(store.lastWorkspace()).toEqual(workspace);
  });

  it("keeps working for the session when storage can't be read or written", () => {
    const failing: KeyValueStorage = {
      getItem: () => {
        throw new Error("Storage is disabled");
      },
      setItem: () => {
        throw new Error("Storage is disabled");
      },
      removeItem: () => {},
    };
    const store = createWorkspaceStore(failing, options());

    const workspace = store.openFolder(notes);

    expect(store.lastWorkspace()).toEqual(workspace);
    expect(store.loadSession(workspace.id).tabs).toEqual([]);
  });

  it("names the last opened workspace", () => {
    const storage = memoryStorage();
    const store = createWorkspaceStore(storage, options());
    const first = store.openFolder(notes);
    store.openFolder({ id: "f2", name: "work", rootPath: "/work" });

    store.markOpened(first.id);

    expect(createWorkspaceStore(storage, options()).lastWorkspace()?.id).toBe(first.id);
  });

  it("saves and loads a workspace's session", () => {
    const storage = memoryStorage();
    const store = createWorkspaceStore(storage, options());
    const session: Session = {
      version: 1,
      tabs: [{ folderId: "f1", path: "a.md", viewMode: "raw" }],
      activeIndex: 0,
      expanded: { f1: ["docs"] },
    };

    store.saveSession("w1", session);

    expect(storage.values.has(sessionStorageKey("w1"))).toBe(true);
    expect(createWorkspaceStore(storage, options()).loadSession("w1")).toEqual(session);
  });
});

describe("folders of a workspace", () => {
  it("adds a folder after the ones a workspace has", () => {
    const storage = memoryStorage();
    const store = createWorkspaceStore(storage, options());
    const workspace = store.openFolder(notes);

    expect(store.addFolder(workspace.id, "f2")?.folderIds).toEqual(["f1", "f2"]);
    expect(createWorkspaceStore(storage, options()).workspace(workspace.id)?.folderIds).toEqual(["f1", "f2"]);
  });

  it("removes a folder and says whether any workspace still uses it", () => {
    const store = createWorkspaceStore(memoryStorage(), options());
    const first = store.openFolder(notes);
    store.addFolder(first.id, "f2");
    const second = store.openFolder({ id: "f2", name: "work", rootPath: "/work" });

    expect(store.removeFolder(first.id, "f2")).toEqual({ isFolderUnused: false });
    expect(store.workspace(first.id)?.folderIds).toEqual(["f1"]);
    store.addFolder(second.id, "f3");
    expect(store.removeFolder(second.id, "f3")).toEqual({ isFolderUnused: true });
  });

  it("says whether any workspace holds a folder", () => {
    const store = createWorkspaceStore(memoryStorage(), options());
    store.openFolder(notes);

    expect(store.isFolderUsed("f1")).toBe(true);
    expect(store.isFolderUsed("f2")).toBe(false);
  });

  it("never removes a workspace's only folder", () => {
    const store = createWorkspaceStore(memoryStorage(), options());
    const workspace = store.openFolder(notes);

    expect(store.removeFolder(workspace.id, "f1")).toBeNull();
    expect(store.workspace(workspace.id)?.folderIds).toEqual(["f1"]);
  });

  it("changes a session-only workspace without storing it", () => {
    const storage = memoryStorage();
    const store = createWorkspaceStore(storage, options());
    const workspace = store.openFolder({ ...notes, accessMode: "fallback" });

    expect(store.addFolder(workspace.id, "f2")?.folderIds).toEqual(["f1", "f2"]);
    expect(storage.values.has(WORKSPACES_STORAGE_KEY)).toBe(false);
  });
});

describe("workspace details", () => {
  it("changes a workspace's name, icon, and colour, and keeps them", () => {
    const storage = memoryStorage();
    const store = createWorkspaceStore(storage, options());
    const workspace = store.openFolder(notes);

    expect(store.updateDetails(workspace.id, { name: "Research", icon: "book-open" })).toMatchObject({
      name: "Research",
      icon: "book-open",
      color: "neutral",
    });
    store.updateDetails(workspace.id, { color: "rose" });
    expect(createWorkspaceStore(storage, options()).workspace(workspace.id)).toMatchObject({
      name: "Research",
      icon: "book-open",
      color: "rose",
    });
  });

  it("returns null for a workspace it doesn't hold", () => {
    const store = createWorkspaceStore(memoryStorage(), options());

    expect(store.updateDetails("missing", { name: "Research" })).toBeNull();
  });
});

describe("where a workspace's details live", () => {
  it("stores a workspace in its folder with each folder's location, and keeps that", () => {
    const storage = memoryStorage();
    const store = createWorkspaceStore(storage, options());
    const workspace = store.openFolder(notes);
    store.addFolder(workspace.id, "f2");

    expect(store.storeInFolder(workspace.id, { "../sources": "f2" })).toMatchObject({
      storage: "folder",
      locations: { ".": "f1", "../sources": "f2" },
    });
    expect(createWorkspaceStore(storage, options()).workspace(workspace.id)).toMatchObject({
      storage: "folder",
      locations: { ".": "f1", "../sources": "f2" },
    });
  });

  it("stores a workspace back on the device without its locations", () => {
    const store = createWorkspaceStore(memoryStorage(), options());
    const workspace = store.openFolder(notes);
    store.storeInFolder(workspace.id, {});

    expect(store.storeOnDevice(workspace.id)).toEqual({ ...workspace, storage: "device" });
  });

  it("keeps the location of a folder added to a workspace stored in its folder, and drops it on removal", () => {
    const store = createWorkspaceStore(memoryStorage(), options());
    const workspace = store.openFolder(notes);
    store.storeInFolder(workspace.id, {});

    expect(store.addFolder(workspace.id, "f2", "../work")).toMatchObject({
      folderIds: ["f1", "f2"],
      locations: { ".": "f1", "../work": "f2" },
    });
    store.removeFolder(workspace.id, "f2");
    expect(store.workspace(workspace.id)).toMatchObject({ folderIds: ["f1"], locations: { ".": "f1" } });
  });

  it("never removes the home folder of a workspace stored in it", () => {
    const store = createWorkspaceStore(memoryStorage(), options());
    const workspace = store.openFolder(notes);
    store.addFolder(workspace.id, "f2");
    store.storeInFolder(workspace.id, { "../sources": "f2" });

    expect(store.removeFolder(workspace.id, "f1")).toBeNull();
    expect(store.workspace(workspace.id)?.folderIds).toEqual(["f1", "f2"]);
  });
});

describe("workspaces read from a folder", () => {
  const details = {
    name: "Thesis",
    icon: "book-open",
    color: "rose",
    folders: [".", "../sources", "../gone"],
  } as const;

  it("creates a workspace stored in the folder the first time its file is opened, then finds it again", () => {
    const storage = memoryStorage();
    const store = createWorkspaceStore(storage, options());
    store.openFolder(notes);

    const created = store.workspaceForFile(notes);
    expect(created).toMatchObject({ folderIds: ["f1"], storage: "folder", locations: { ".": "f1" } });
    expect(createWorkspaceStore(storage, options()).workspaceForFile(notes).id).toBe(created.id);
  });

  it("turns the device workspace that is exactly the folder into the one its file describes, keeping its session", () => {
    const storage = memoryStorage();
    const store = createWorkspaceStore(storage, options());
    const plain = store.openFolder(notes);
    const session: Session = {
      version: 1,
      tabs: [{ folderId: "f1", path: "a.md", viewMode: "raw" }],
      activeIndex: 0,
      expanded: {},
    };
    store.saveSession(plain.id, session);

    const found = store.workspaceForFile(notes);

    expect(found).toMatchObject({ id: plain.id, folderIds: ["f1"], storage: "folder", locations: { ".": "f1" } });
    expect(stored(storage).workspaces).toHaveLength(1);
    expect(store.loadSession(found.id)).toEqual(session);
  });

  it("takes the file's details and the folders found for its locations, in the file's order", () => {
    const store = createWorkspaceStore(memoryStorage(), options());
    const workspace = store.workspaceForFile(notes);

    expect(
      store.applyWorkspaceFile(workspace.id, { ...details, folders: [...details.folders] }, { "../sources": "f2" })
        ?.workspace,
    ).toMatchObject({
      name: "Thesis",
      icon: "book-open",
      color: "rose",
      folderIds: ["f1", "f2"],
      locations: { ".": "f1", "../sources": "f2" },
    });
  });

  it("leaves out a location named like an object property when no folder was found for it", () => {
    const store = createWorkspaceStore(memoryStorage(), options());
    const workspace = store.workspaceForFile(notes);

    expect(
      store.applyWorkspaceFile(workspace.id, { ...details, folders: [".", "toString"] }, {})?.workspace,
    ).toMatchObject({
      folderIds: ["f1"],
      locations: { ".": "f1" },
    });
  });

  it("drops a location the file no longer lists, and reports its folder once no workspace holds it", () => {
    const store = createWorkspaceStore(memoryStorage(), options());
    const workspace = store.workspaceForFile(notes);
    store.applyWorkspaceFile(workspace.id, { ...details, folders: [".", "../sources"] }, { "../sources": "f2" });

    expect(store.applyWorkspaceFile(workspace.id, { ...details, folders: ["."] }, { "../sources": "f2" })).toEqual({
      workspace: expect.objectContaining({ folderIds: ["f1"], locations: { ".": "f1" } }),
      unusedFolderIds: ["f2"],
    });
  });

  it("does not report a folder the file still lists but this device didn't find", () => {
    const store = createWorkspaceStore(memoryStorage(), options());
    const workspace = store.workspaceForFile(notes);
    store.applyWorkspaceFile(workspace.id, { ...details, folders: [".", "../sources"] }, { "../sources": "f2" });

    expect(
      store.applyWorkspaceFile(workspace.id, { ...details, folders: [".", "../sources"] }, {})?.unusedFolderIds,
    ).toEqual([]);
  });

  it("does not report a dropped folder another workspace still holds", () => {
    const store = createWorkspaceStore(memoryStorage(), options());
    const workspace = store.workspaceForFile(notes);
    store.applyWorkspaceFile(workspace.id, { ...details, folders: [".", "../sources"] }, { "../sources": "f2" });
    store.openFolder({ id: "f2", name: "sources", rootPath: "/sources" });

    expect(store.applyWorkspaceFile(workspace.id, { ...details, folders: ["."] }, {})?.unusedFolderIds).toEqual([]);
  });

  it("keeps the folder of a location the file still lists but this device did not find", () => {
    const store = createWorkspaceStore(memoryStorage(), options());
    const workspace = store.workspaceForFile(notes);
    store.applyWorkspaceFile(workspace.id, { ...details, folders: [".", "../sources"] }, { "../sources": "f2" });
    const other = store.openFolder({ id: "f2", name: "sources", rootPath: "/sources" });

    const kept = store.applyWorkspaceFile(workspace.id, { ...details, folders: [".", "../sources"] }, {});
    expect(kept?.workspace).toMatchObject({ folderIds: ["f1", "f2"], locations: { ".": "f1", "../sources": "f2" } });
    expect(
      store.applyWorkspaceFile(workspace.id, { ...details, folders: [".", "../sources"] }, {})?.workspace,
    ).toMatchObject({ folderIds: ["f1", "f2"] });
    // The workspace still names the folder, so removing the other one that held it keeps its access.
    expect(store.removeWorkspace(other.id)).toEqual({ unusedFolderIds: [] });
  });
});

describe("recent workspaces", () => {
  function clockedStore(storage = memoryStorage()) {
    let time = 0;
    return createWorkspaceStore(storage, { now: () => (time += 1_000), newId: options().newId });
  }

  it("lists the workspaces most recently opened first", () => {
    const store = clockedStore();
    const first = store.openFolder(notes);
    const second = store.openFolder({ id: "f2", name: "work", rootPath: "/work" });
    store.markOpened(first.id);

    expect(store.recentWorkspaces().map((w) => w.id)).toEqual([first.id, second.id]);
  });

  it("lists a session-only workspace too, since it can be switched to until Vista closes", () => {
    const store = clockedStore();
    const workspace = store.openFolder({ ...notes, accessMode: "fallback" });

    expect(store.recentWorkspaces().map((w) => w.id)).toEqual([workspace.id]);
  });

  it("forgets a removed workspace and its session, and names the folders no workspace holds anymore", () => {
    const storage = memoryStorage();
    const store = clockedStore(storage);
    const first = store.openFolder(notes);
    store.addFolder(first.id, "f2");
    store.openFolder({ id: "f2", name: "work", rootPath: "/work" });
    store.saveSession(first.id, { version: 1, tabs: [], activeIndex: -1, expanded: {} });

    expect(store.removeWorkspace(first.id)).toEqual({ unusedFolderIds: ["f1"] });
    expect(store.workspace(first.id)).toBeNull();
    expect(storage.values.has(sessionStorageKey(first.id))).toBe(false);
    expect(createWorkspaceStore(storage, options()).workspace(first.id)).toBeNull();
  });

  it("no longer reopens a removed workspace at startup", () => {
    const storage = memoryStorage();
    const store = clockedStore(storage);
    const workspace = store.openFolder(notes);
    store.removeWorkspace(workspace.id);

    expect(createWorkspaceStore(storage, options()).lastWorkspace()).toBeNull();
  });

  it("no longer reopens a closed workspace at startup, but keeps it and its session", () => {
    const storage = memoryStorage();
    const store = clockedStore(storage);
    const workspace = store.openFolder(notes);
    const session: Session = { version: 1, tabs: [], activeIndex: -1, expanded: {} };
    store.saveSession(workspace.id, session);
    store.markClosed(workspace.id);

    const reloaded = createWorkspaceStore(storage, options());
    expect(reloaded.lastWorkspace()).toBeNull();
    expect(reloaded.workspace(workspace.id)).not.toBeNull();
    expect(reloaded.loadSession(workspace.id)).toEqual(session);
  });
});

describe("migrateLegacyFolder", () => {
  it("turns the folder an earlier Vista remembered into the last workspace", async () => {
    const storage = memoryStorage();
    const capability = createMemoryWorkspace(
      {},
      {
        overrides: {
          restoreFolder: async () => ({ status: "needs-permission", name: "Old Notes" }),
        },
      },
    );
    const store = createWorkspaceStore(storage, options());

    const result = await store.migrateLegacyFolder(capability);

    expect(capability.restoreFolder).toHaveBeenCalledWith(LEGACY_FOLDER_ID, { interactive: false });
    expect(result).toEqual({ status: "needs-permission", name: "Old Notes" });
    expect(store.lastWorkspace()).toMatchObject({ name: "Old Notes", folderIds: [LEGACY_FOLDER_ID] });
    expect(stored(storage).workspaces).toHaveLength(1);
  });

  it("forgets a remembered folder that is already gone instead of making it a workspace", async () => {
    const storage = memoryStorage();
    const capability = createMemoryWorkspace(
      {},
      {
        overrides: { restoreFolder: async () => ({ status: "unavailable", name: "Old Notes" }) },
      },
    );
    const store = createWorkspaceStore(storage, options());

    expect(await store.migrateLegacyFolder(capability)).toEqual({ status: "unavailable", name: "Old Notes" });
    expect(capability.forgetFolder).toHaveBeenCalledWith(LEGACY_FOLDER_ID);
    expect(store.lastWorkspace()).toBeNull();
  });

  it("still reports a folder that is gone when the host can't forget it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const capability = createMemoryWorkspace(
      {},
      {
        overrides: {
          restoreFolder: async () => ({ status: "unavailable", name: "Old Notes" }),
          forgetFolder: async () => {
            throw new Error("storage failed");
          },
        },
      },
    );
    const store = createWorkspaceStore(memoryStorage(), options());

    expect(await store.migrateLegacyFolder(capability)).toEqual({ status: "unavailable", name: "Old Notes" });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("creates nothing when no folder was remembered", async () => {
    const storage = memoryStorage();
    const store = createWorkspaceStore(storage, options());

    expect(await store.migrateLegacyFolder(createMemoryWorkspace({}))).toBeNull();
    expect(store.lastWorkspace()).toBeNull();
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("never runs once workspaces are stored", async () => {
    const storage = memoryStorage();
    createWorkspaceStore(storage, options()).openFolder(notes);
    const capability = createMemoryWorkspace({});

    expect(await createWorkspaceStore(storage, options()).migrateLegacyFolder(capability)).toBeNull();
    expect(capability.restoreFolder).not.toHaveBeenCalled();
  });
});

describe("checkFolderOverlap", () => {
  const capability = createMemoryWorkspace({});
  const folder = (id: string, rootPath: string): WorkspaceFolder => ({
    id,
    name: rootPath.split("/").pop()!,
    rootPath,
  });

  it.each([
    [folder("f2", "/notes"), '"notes" is already part of this workspace.'],
    [folder("f2", "/notes/work"), '"work" is already part of this workspace, inside "notes".'],
    [{ id: "f2", name: "disk", rootPath: "/" }, '"disk" contains "notes", which is already part of this workspace.'],
  ])("refuses %o", async (candidate, message) => {
    expect(await checkFolderOverlap(capability, [notes], candidate)).toBe(message);
  });

  it("accepts a separate folder", async () => {
    expect(await checkFolderOverlap(capability, [notes], folder("f2", "/work"))).toBeNull();
  });
});
