import {
  DEFAULT_WORKSPACE_COLOR,
  DEFAULT_WORKSPACE_ICON,
  WORKSPACES_STORAGE_KEY,
  parseSession,
  parseWorkspaceList,
  sessionStorageKey,
  validateWorkspaceName,
  findWorkspaceForFolder,
  type Session,
  type WorkspaceList,
  type WorkspaceRecord,
} from "../domain/workspaces";
import { LEGACY_FOLDER_ID, type RestoreFolderResult, type WorkspaceCapability, type WorkspaceFolder } from "../ports";

/** The part of `localStorage` the store uses, so tests can hand it another one. */
export type KeyValueStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

// Reached on each call, since merely reading `window.localStorage` throws where storage is blocked.
export const browserStorage: KeyValueStorage = {
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
  removeItem: (key) => localStorage.removeItem(key),
};

// Where a stored list this Vista could not fully read is kept before it is first saved over.
export const WORKSPACES_BACKUP_KEY = "vista.workspaces.damaged";

const UNTITLED_NAME = "Untitled workspace";

export interface WorkspaceStore {
  lastWorkspace(): WorkspaceRecord | null;
  workspace(workspaceId: string): WorkspaceRecord | null;
  /** The workspace Open Folder opens for a folder: the one that is exactly it, or a new one. */
  openFolder(folder: WorkspaceFolder): WorkspaceRecord;
  markOpened(workspaceId: string): void;
  addFolder(workspaceId: string, folderId: string): WorkspaceRecord | null;
  isFolderUsed(folderId: string): boolean;
  /**
   * Null when the folder is the workspace's only one, since a workspace is one or more folders.
   * `isFolderUnused` says no workspace holds the folder anymore, so its host may forget it.
   */
  removeFolder(workspaceId: string, folderId: string): { isFolderUnused: boolean } | null;
  /**
   * Once, before any workspace is stored, turns the folder an earlier Vista remembered into the last
   * workspace. Returns the restore result it got, so the caller need not restore the folder again.
   */
  migrateLegacyFolder(capability: WorkspaceCapability): Promise<RestoreFolderResult | null>;
  loadSession(workspaceId: string): Session;
  saveSession(workspaceId: string, session: Session): void;
}

/**
 * Keeps the workspace list and sessions in storage. Storage that can't be read or written is
 * logged, and the workspaces then last for the session, as the spec allows.
 */
export function createWorkspaceStore(
  storage: KeyValueStorage,
  { now, newId }: { now: () => number; newId: () => string },
): WorkspaceStore {
  const raw = read(storage, WORKSPACES_STORAGE_KEY);
  const loaded = parseWorkspaceList(raw);
  let list: WorkspaceList = loaded.list;
  let needsBackup = loaded.isDamaged;
  let hasStoredList = raw !== null;
  const sessionOnlyIds = new Set<string>();

  function save(next: WorkspaceList): void {
    list = next;
    try {
      if (needsBackup && raw !== null) {
        storage.setItem(WORKSPACES_BACKUP_KEY, raw);
      }
      needsBackup = false;
      storage.setItem(WORKSPACES_STORAGE_KEY, JSON.stringify(serializable(next)));
      hasStoredList = true;
    } catch (err) {
      console.error("Failed to save the workspaces:", err);
    }
  }

  // Workspaces holding a folder that can't be remembered last only for this session.
  function serializable(next: WorkspaceList): WorkspaceList {
    const workspaces = next.workspaces.filter((w) => !sessionOnlyIds.has(w.id));
    const lastWorkspaceId = workspaces.some((w) => w.id === next.lastWorkspaceId) ? next.lastWorkspaceId : null;
    return { version: 1, lastWorkspaceId, workspaces };
  }

  function opened(workspace: WorkspaceRecord): WorkspaceRecord {
    const updated = { ...workspace, lastOpenedAt: now() };
    const others = list.workspaces.filter((w) => w.id !== workspace.id);
    save({ version: 1, lastWorkspaceId: updated.id, workspaces: [...others, updated] });
    return updated;
  }

  function replace(workspace: WorkspaceRecord): WorkspaceRecord {
    const next = { ...list, workspaces: list.workspaces.map((w) => (w.id === workspace.id ? workspace : w)) };
    if (sessionOnlyIds.has(workspace.id)) {
      list = next;
    } else {
      save(next);
    }
    return workspace;
  }

  function isUsed(folderId: string): boolean {
    return list.workspaces.some((w) => w.folderIds.includes(folderId));
  }

  function createFor(folderId: string, folderName: string): WorkspaceRecord {
    const name = validateWorkspaceName(folderName);
    return {
      id: newId(),
      name: name.ok ? name.name : UNTITLED_NAME,
      icon: DEFAULT_WORKSPACE_ICON,
      color: DEFAULT_WORKSPACE_COLOR,
      folderIds: [folderId],
      storage: "device",
      lastOpenedAt: 0,
    };
  }

  return {
    lastWorkspace: () => {
      const workspace = list.workspaces.find((w) => w.id === list.lastWorkspaceId);
      return workspace && !sessionOnlyIds.has(workspace.id) ? workspace : null;
    },

    workspace: (workspaceId) => list.workspaces.find((w) => w.id === workspaceId) ?? null,

    openFolder(folder) {
      if (folder.accessMode === "fallback") {
        const workspace = createFor(folder.id, folder.name);
        sessionOnlyIds.add(workspace.id);
        list = { ...list, workspaces: [...list.workspaces, workspace] };
        return { ...workspace, lastOpenedAt: now() };
      }
      return opened(findWorkspaceForFolder(list, folder.id) ?? createFor(folder.id, folder.name));
    },

    markOpened(workspaceId) {
      const workspace = list.workspaces.find((w) => w.id === workspaceId);
      if (workspace && !sessionOnlyIds.has(workspaceId)) {
        opened(workspace);
      }
    },

    addFolder(workspaceId, folderId) {
      const workspace = list.workspaces.find((w) => w.id === workspaceId);
      return workspace ? replace({ ...workspace, folderIds: [...workspace.folderIds, folderId] }) : null;
    },

    removeFolder(workspaceId, folderId) {
      const workspace = list.workspaces.find((w) => w.id === workspaceId);
      const folderIds = workspace?.folderIds.filter((id) => id !== folderId) ?? [];
      if (!workspace || folderIds.length === 0 || folderIds.length === workspace.folderIds.length) {
        return null;
      }
      replace({ ...workspace, folderIds });
      return { isFolderUnused: !isUsed(folderId) };
    },

    isFolderUsed: (folderId) => isUsed(folderId),

    async migrateLegacyFolder(capability) {
      if (hasStoredList) {
        return null;
      }
      const result = await capability.restoreFolder(LEGACY_FOLDER_ID, { interactive: false });
      if (result.status === "none") {
        return null;
      }
      // A folder that is already gone would only become a workspace that can never open.
      if (result.status === "unavailable") {
        await capability.forgetFolder(LEGACY_FOLDER_ID);
        return result;
      }
      const name = result.status === "restored" ? result.folder.name : result.name;
      opened(createFor(LEGACY_FOLDER_ID, name));
      return result;
    },

    loadSession: (workspaceId) => parseSession(read(storage, sessionStorageKey(workspaceId))),

    saveSession(workspaceId, session) {
      if (sessionOnlyIds.has(workspaceId)) {
        return;
      }
      try {
        storage.setItem(sessionStorageKey(workspaceId), JSON.stringify(session));
      } catch (err) {
        console.error("Failed to save the session:", err);
      }
    },
  };
}

function read(storage: KeyValueStorage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch (err) {
    console.error(`Failed to read "${key}":`, err);
    return null;
  }
}

/**
 * Says why a folder can't join a workspace that already holds `folders`, or null when it can.
 * Overlapping folders would show one file twice, and saving one tab would overwrite the other's edits.
 */
export async function checkFolderOverlap(
  capability: WorkspaceCapability,
  folders: readonly WorkspaceFolder[],
  candidate: WorkspaceFolder,
): Promise<string | null> {
  for (const folder of folders) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- stops at the first overlap; a workspace has few folders
    const relation = await capability.relate(candidate, folder);
    switch (relation) {
      case "same":
        return `"${candidate.name}" is already part of this workspace.`;
      case "inside":
        return `"${candidate.name}" is already part of this workspace, inside "${folder.name}".`;
      case "contains":
        return `"${candidate.name}" contains "${folder.name}", which is already part of this workspace.`;
      case "separate":
        break;
    }
  }
  return null;
}
