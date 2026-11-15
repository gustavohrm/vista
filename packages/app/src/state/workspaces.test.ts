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
    storage.setItem.mockImplementation((key) => {
      if (key === WORKSPACES_BACKUP_KEY) {
        throw new Error("Quota exceeded");
      }
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
