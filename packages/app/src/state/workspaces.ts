import {
  HOME_FOLDER_LOCATION,
  type WorkspaceFileDetails,
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
import { t } from "../i18n";
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

/** How many workspaces Recent lists: few enough to read at a glance; the manager lists them all. */
export const MAX_RECENT_WORKSPACES = 5;

/** The details a workspace's page in the manager changes. */
export type WorkspaceDetails = Partial<Pick<WorkspaceRecord, "name" | "icon" | "color">>;

export interface WorkspaceStore {
  lastWorkspace(): WorkspaceRecord | null;
  /** The few most recently opened workspaces, the most recent first, leaving out any removed from Recent. */
  recentWorkspaces(): WorkspaceRecord[];
  /** Every workspace, by name. */
  allWorkspaces(): WorkspaceRecord[];
  /** Leaves a workspace out of Recent, without forgetting it, until it is opened again. */
  hideFromRecent(workspaceId: string): void;
  /** A new workspace holding just this folder, even when the folder already is one; it is not opened. */
  createWorkspace(folder: WorkspaceFolder): WorkspaceRecord;
  workspace(workspaceId: string): WorkspaceRecord | null;
  /** The workspace Open Folder opens for a folder: the one that is exactly it, or a new one. */
  openFolder(folder: WorkspaceFolder): WorkspaceRecord;
  markOpened(workspaceId: string): void;
  /** Notes that the workspace was closed, so the next start shows the start screen instead of reopening it. */
  markClosed(workspaceId: string): void;
  /** Changes a workspace's name, icon, or colour. The name must already pass `validateWorkspaceName`. */
  updateDetails(workspaceId: string, changes: WorkspaceDetails): WorkspaceRecord | null;
  /** `location` is where the folder is from the home folder; only a workspace stored in its folder keeps it. */
  addFolder(workspaceId: string, folderId: string, location?: string): WorkspaceRecord | null;
  /** Keeps the details in the home folder from now on; `locations` are the other folders', by location. */
  storeInFolder(workspaceId: string, locations: Readonly<Record<string, string>>): WorkspaceRecord | null;
  storeOnDevice(workspaceId: string): WorkspaceRecord | null;
  /**
   * The workspace stored in this home folder on this device. When there is none yet, the device
   * workspace that is exactly the folder becomes it, keeping its id and session, or one is created.
   */
  workspaceForFile(home: WorkspaceFolder): WorkspaceRecord;
  /**
   * Takes the details read from a workspace's file. `located` names the folder found on this device
   * for each location; locations the file no longer lists are dropped. `unusedFolderIds` are the
   * dropped locations' folders no workspace holds anymore, so their host may forget them; a location
   * the file still lists but this device didn't find is not dropped.
   */
  applyWorkspaceFile(
    workspaceId: string,
    details: WorkspaceFileDetails,
    located: Readonly<Record<string, string>>,
  ): { workspace: WorkspaceRecord; unusedFolderIds: string[] } | null;
  isFolderUsed(folderId: string): boolean;
  /**
   * Null when the folder is the workspace's only one, since a workspace is one or more folders, or
   * the home folder of a workspace stored in it, which would lose its details.
   * `isFolderUnused` says no workspace holds the folder anymore, so its host may forget it.
   */
  removeFolder(workspaceId: string, folderId: string): { isFolderUnused: boolean } | null;
  /**
   * Once, before any workspace is stored, turns the folder an earlier Vista remembered into the last
   * workspace. Returns the restore result it got, so the caller need not restore the folder again.
   */
  migrateLegacyFolder(capability: WorkspaceCapability): Promise<RestoreFolderResult | null>;
  /**
   * Forgets a workspace and its session. `unusedFolderIds` are its folders no other workspace holds,
   * so their host may forget them.
   */
  removeWorkspace(workspaceId: string): { unusedFolderIds: string[] };
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
  // A session-only workspace's sessions, kept for the run like the workspace, so it reopens with its tabs.
  const sessionOnlySessions = new Map<string, Session>();

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
    const updated = { ...shownInRecent(workspace), lastOpenedAt: now() };
    const others = list.workspaces.filter((w) => w.id !== workspace.id);
    save({
      version: 1,
      lastWorkspaceId: updated.id,
      workspaces: [...others, updated],
    });
    return updated;
  }

  function replace(workspace: WorkspaceRecord): WorkspaceRecord {
    const next = {
      ...list,
      workspaces: list.workspaces.map((w) => (w.id === workspace.id ? workspace : w)),
    };
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
      name: name.ok ? name.name : t("workspace.untitled"),
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
        const workspace = {
          ...createFor(folder.id, folder.name),
          lastOpenedAt: now(),
        };
        sessionOnlyIds.add(workspace.id);
        list = { ...list, workspaces: [...list.workspaces, workspace] };
        return workspace;
      }
      return opened(findWorkspaceForFolder(list, folder.id) ?? createFor(folder.id, folder.name));
    },

    markClosed(workspaceId) {
      if (list.lastWorkspaceId === workspaceId) {
        save({ ...list, lastWorkspaceId: null });
      }
    },

    markOpened(workspaceId) {
      const workspace = list.workspaces.find((w) => w.id === workspaceId);
      if (workspace && sessionOnlyIds.has(workspaceId)) {
        replace({ ...shownInRecent(workspace), lastOpenedAt: now() });
      } else if (workspace) {
        opened(workspace);
      }
    },

    updateDetails(workspaceId, changes) {
      const workspace = list.workspaces.find((w) => w.id === workspaceId);
      return workspace ? replace({ ...workspace, ...changes }) : null;
    },

    addFolder(workspaceId, folderId, location) {
      const workspace = list.workspaces.find((w) => w.id === workspaceId);
      if (!workspace) {
        return null;
      }
      const folderIds = [...workspace.folderIds, folderId];
      if (workspace.storage === "device" || location === undefined) {
        return replace({ ...workspace, folderIds });
      }
      return replace({
        ...workspace,
        folderIds,
        locations: { ...workspace.locations, [location]: folderId },
      });
    },

    storeInFolder(workspaceId, locations) {
      const workspace = list.workspaces.find((w) => w.id === workspaceId);
      if (!workspace) {
        return null;
      }
      const home = { [HOME_FOLDER_LOCATION]: workspace.folderIds[0]! };
      return replace({
        ...workspace,
        storage: "folder",
        locations: { ...locations, ...home },
      });
    },

    workspaceForFile(home) {
      let found: WorkspaceRecord | null = null;
      for (const workspace of list.workspaces) {
        const isHome = workspace.storage === "folder" && workspace.folderIds[0] === home.id;
        if (isHome && (!found || workspace.lastOpenedAt > found.lastOpenedAt)) {
          found = workspace;
        }
      }
      if (found) {
        return found;
      }
      // The folder's own device workspace becomes the folder-backed one, so Recent and the session stay one.
      const plain = findWorkspaceForFolder(list, home.id);
      if (plain) {
        return replace({
          ...plain,
          storage: "folder",
          locations: { [HOME_FOLDER_LOCATION]: home.id },
        });
      }
      const created: WorkspaceRecord = {
        ...createFor(home.id, home.name),
        storage: "folder",
        locations: { [HOME_FOLDER_LOCATION]: home.id },
      };
      save({ ...list, workspaces: [...list.workspaces, created] });
      return created;
    },

    applyWorkspaceFile(workspaceId, details, located) {
      const workspace = list.workspaces.find((w) => w.id === workspaceId);
      const homeId = workspace?.folderIds[0];
      if (!workspace || homeId === undefined) {
        return null;
      }
      const locations: Record<string, string> = {
        [HOME_FOLDER_LOCATION]: homeId,
      };
      const folderIds = [homeId];
      const known: Readonly<Record<string, string>> = workspace.storage === "folder" ? workspace.locations : {};
      for (const location of details.folders) {
        // A location such as `toString` must not find the object prototype instead of a folder.
        // A location the file still lists but this device did not find keeps the folder it had, so the
        // host is not told to forget a folder the workspace still names.
        const folderId = Object.hasOwn(located, location)
          ? located[location]
          : Object.hasOwn(known, location)
            ? known[location]
            : undefined;
        if (location !== HOME_FOLDER_LOCATION && folderId !== undefined && !folderIds.includes(folderId)) {
          locations[location] = folderId;
          folderIds.push(folderId);
        }
      }
      const { name, icon, color } = details;
      const updated = replace({
        ...workspace,
        name,
        icon,
        color,
        folderIds,
        storage: "folder",
        locations,
      });
      const listed = new Set(details.folders);
      const dropped =
        workspace.storage === "folder"
          ? Object.entries(workspace.locations).flatMap(([location, id]) =>
              listed.has(location) || folderIds.includes(id) ? [] : [id],
            )
          : [];
      return {
        workspace: updated,
        unusedFolderIds: dropped.filter((id) => !isUsed(id)),
      };
    },

    storeOnDevice(workspaceId) {
      const workspace = list.workspaces.find((w) => w.id === workspaceId);
      if (!workspace) {
        return null;
      }
      if (workspace.storage === "device") {
        return workspace;
      }
      const { id, name, icon, color, folderIds, lastOpenedAt, hiddenFromRecent } = workspace;
      return replace({
        id,
        name,
        icon,
        color,
        folderIds,
        lastOpenedAt,
        storage: "device",
        ...(hiddenFromRecent ? { hiddenFromRecent } : {}),
      });
    },

    removeFolder(workspaceId, folderId) {
      const workspace = list.workspaces.find((w) => w.id === workspaceId);
      const folderIds = workspace?.folderIds.filter((id) => id !== folderId) ?? [];
      if (!workspace || folderIds.length === 0 || folderIds.length === workspace.folderIds.length) {
        return null;
      }
      if (workspace.storage === "device") {
        replace({ ...workspace, folderIds });
      } else if (workspace.folderIds[0] === folderId) {
        return null;
      } else {
        const locations = Object.fromEntries(Object.entries(workspace.locations).filter(([, id]) => id !== folderId));
        replace({ ...workspace, folderIds, locations });
      }
      return { isFolderUnused: !isUsed(folderId) };
    },

    isFolderUsed: (folderId) => isUsed(folderId),

    async migrateLegacyFolder(capability) {
      if (hasStoredList) {
        return null;
      }
      const result = await capability.restoreFolder(LEGACY_FOLDER_ID, {
        interactive: false,
      });
      if (result.status === "none") {
        return null;
      }
      // A folder that is already gone would only become a workspace that can never open.
      if (result.status === "unavailable") {
        try {
          await capability.forgetFolder(LEGACY_FOLDER_ID);
        } catch (err) {
          // The folder is reported as gone either way; the host keeping its record only means the
          // same check runs again on the next start.
          console.warn("Could not forget the earlier folder:", err);
        }
        return result;
      }
      const name = result.status === "restored" ? result.folder.name : result.name;
      opened(createFor(LEGACY_FOLDER_ID, name));
      return result;
    },

    recentWorkspaces: () =>
      list.workspaces
        // A workspace made in Settings and never opened has nothing to come back to.
        .filter((w) => w.lastOpenedAt > 0 && !w.hiddenFromRecent)
        .toSorted((a, b) => b.lastOpenedAt - a.lastOpenedAt || a.id.localeCompare(b.id))
        .slice(0, MAX_RECENT_WORKSPACES),

    allWorkspaces: () =>
      list.workspaces.toSorted(
        (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || a.id.localeCompare(b.id),
      ),

    hideFromRecent(workspaceId) {
      const workspace = list.workspaces.find((w) => w.id === workspaceId);
      if (workspace && !workspace.hiddenFromRecent) {
        replace({ ...workspace, hiddenFromRecent: true });
      }
    },

    createWorkspace(folder) {
      const workspace = createFor(folder.id, folder.name);
      if (folder.accessMode === "fallback") {
        sessionOnlyIds.add(workspace.id);
        list = { ...list, workspaces: [...list.workspaces, workspace] };
      } else {
        save({ ...list, workspaces: [...list.workspaces, workspace] });
      }
      return workspace;
    },

    removeWorkspace(workspaceId) {
      const workspace = list.workspaces.find((w) => w.id === workspaceId);
      if (!workspace) {
        return { unusedFolderIds: [] };
      }
      const next: WorkspaceList = {
        version: 1,
        lastWorkspaceId: list.lastWorkspaceId === workspaceId ? null : list.lastWorkspaceId,
        workspaces: list.workspaces.filter((w) => w.id !== workspaceId),
      };
      if (sessionOnlyIds.delete(workspaceId)) {
        sessionOnlySessions.delete(workspaceId);
        list = next;
      } else {
        save(next);
        try {
          storage.removeItem(sessionStorageKey(workspaceId));
        } catch (err) {
          console.error("Failed to forget the session:", err);
        }
      }
      return {
        unusedFolderIds: workspace.folderIds.filter((id) => !isUsed(id)),
      };
    },

    loadSession: (workspaceId) =>
      sessionOnlySessions.get(workspaceId) ?? parseSession(read(storage, sessionStorageKey(workspaceId))),

    saveSession(workspaceId, session) {
      if (sessionOnlyIds.has(workspaceId)) {
        sessionOnlySessions.set(workspaceId, session);
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

/** A workspace back in Recent, as opening it puts it. */
function shownInRecent({ hiddenFromRecent: _, ...shown }: WorkspaceRecord): WorkspaceRecord {
  return shown;
}
