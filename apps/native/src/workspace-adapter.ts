import { open } from "@tauri-apps/plugin-dialog";
import {
  exists,
  mkdir,
  readDir,
  readFile as readFileBytes,
  remove as removeEntry,
  rename,
  stat as statEntry,
  writeFile as writeFileBytes,
} from "@tauri-apps/plugin-fs";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import {
  LEGACY_FOLDER_ID,
  WorkspaceError,
  type FileContents,
  type FileStat,
  type RestoreFolderResult,
  type WorkspaceCapability,
  type WorkspaceFolder,
  type WorkspaceNode,
} from "@vista/app";

import {
  folderNameFromPath,
  joinFolderPath,
  normalizeFolderPath,
  relateFolderPaths,
  relativeFolderPath,
  resolveRelativePath,
} from "./folder-paths";

const FOLDERS_STORAGE_KEY = "vista.folders";
// Where the Vista before workspaces kept its one remembered folder.
const LEGACY_FOLDER_STORAGE_KEY = "vista.lastFolder";

// Vista's own folder, version-control internals, installed dependencies, and OS metadata: never
// notes, and large enough to slow every scan. A folder such as `build` or `.vscode` is shown, since
// notes can live there.
const IGNORED_NAMES = new Set([".vista", ".git", ".svn", ".hg", "node_modules", ".DS_Store", "Thumbs.db"]);

// Each `readDir` is an IPC call and an open directory handle; past a few dozen at once a large
// tree only queues them in the backend and risks the per-process handle limit on Linux.
const MAX_CONCURRENT_DIRECTORY_READS = 16;

type FolderPaths = Record<string, string>;

/** The remembered folders' paths by id. Unreadable storage is logged and read as none. */
function readFolderPaths(): FolderPaths {
  // No prototype, so an id such as `toString` is unknown rather than an inherited function.
  const paths: FolderPaths = Object.create(null) as FolderPaths;
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(FOLDERS_STORAGE_KEY) ?? "{}");
    if (typeof stored === "object" && stored !== null && !Array.isArray(stored)) {
      for (const [id, path] of Object.entries(stored)) {
        if (id !== "__proto__" && typeof path === "string" && path !== "") {
          paths[id] = path;
        }
      }
    }
    const legacyPath = window.localStorage.getItem(LEGACY_FOLDER_STORAGE_KEY);
    if (legacyPath) {
      paths[LEGACY_FOLDER_ID] ??= legacyPath;
      window.localStorage.setItem(FOLDERS_STORAGE_KEY, JSON.stringify(paths));
      window.localStorage.removeItem(LEGACY_FOLDER_STORAGE_KEY);
    }
  } catch (err) {
    console.warn("Could not read the remembered folders:", err);
  }
  return paths;
}

/** Stores the remembered folders. A failure is logged: the folders still work until the app closes. */
function saveFolderPaths(paths: FolderPaths): void {
  try {
    window.localStorage.setItem(FOLDERS_STORAGE_KEY, JSON.stringify(paths));
  } catch (err) {
    console.warn("Could not remember the folders:", err);
  }
}

/** Remembers a folder, under the id it already has when the same folder is remembered. */
function rememberFolder(folderPath: string): WorkspaceFolder {
  const paths = readFolderPaths();
  const known = Object.keys(paths).find((id) => relateFolderPaths(paths[id]!, folderPath) === "same");
  const id = known ?? crypto.randomUUID();
  paths[id] = folderPath;
  saveFolderPaths(paths);
  return folderAt(id, folderPath);
}

function folderAt(id: string, folderPath: string): WorkspaceFolder {
  return { id, name: folderNameFromPath(folderPath), rootPath: folderPath };
}

// The file manager is given the separators the platform uses.
function toPlatformPath(fullPath: string): string {
  return /^([A-Za-z]:|\\|\/\/)/.test(fullPath) ? fullPath.replace(/\//g, "\\") : fullPath;
}

function sortNodes(nodes: WorkspaceNode[]): WorkspaceNode[] {
  return nodes.sort((a, b) => {
    if (a.kind !== b.kind) {
      return a.kind === "directory" ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}

/** Runs at most `limit` tasks at a time; the rest wait in call order. */
function createLimiter(limit: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async function run<T>(task: () => Promise<T>): Promise<T> {
    if (active < limit) {
      active += 1;
    } else {
      // The finishing task hands its slot over, so `active` never passes the limit.
      await new Promise<void>((resolve) => waiting.push(resolve));
    }
    try {
      return await task();
    } finally {
      const next = waiting.shift();
      if (next) {
        next();
      } else {
        active -= 1;
      }
    }
  };
}

/** The version of a file, or null when nothing is there or it is not a file. */
// Read from the directory listing, which does not follow links; `lstat` would need another permission.
async function isSymlink(fullPath: string): Promise<boolean> {
  const { directory, name } = splitNativePath(fullPath);
  const entries = await readDir(directory);
  return entries.some((entry) => entry.name === name && entry.isSymlink);
}

async function statWritten(fullPath: string, path: string): Promise<FileStat> {
  const written = await statFile(fullPath);
  if (!written) {
    throw new Error(`"${path}" was not found after saving.`);
  }
  return { size: written.size, modifiedAt: written.modifiedAt };
}

async function statFile(fullPath: string): Promise<(FileStat & { mode: number | null }) | null> {
  // `stat` reports a missing file only as error text, so existence is checked first.
  if (!(await exists(fullPath))) {
    return null;
  }
  const info = await statEntry(fullPath);
  if (!info.isFile) {
    return null;
  }
  return { size: info.size, modifiedAt: info.mtime?.getTime() ?? 0, mode: info.mode };
}

function splitNativePath(fullPath: string): { directory: string; name: string } {
  const index = fullPath.lastIndexOf("/");
  return { directory: fullPath.slice(0, index), name: fullPath.slice(index + 1) };
}

/**
 * Creates a WorkspaceCapability adapter for the Native (Tauri) platform. A folder's root path is its
 * absolute path, so every operation acts on the folder it names; its id maps to that path in
 * `vista.folders`.
 *
 * @returns Configured native workspace capability.
 */
export function createNativeWorkspaceAdapter(): WorkspaceCapability {
  const isSupported = typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);
  const limitDirectoryRead = createLimiter(MAX_CONCURRENT_DIRECTORY_READS);

  async function scanDirectory(fullPath: string, relativePath: string): Promise<WorkspaceNode[]> {
    const entries = await limitDirectoryRead(() => readDir(fullPath));
    const nodes = await Promise.all(
      entries
        .filter((entry) => !IGNORED_NAMES.has(entry.name))
        .map(async (entry): Promise<WorkspaceNode> => {
          const childRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
          if (entry.isDirectory) {
            try {
              const children = await scanDirectory(joinFolderPath(fullPath, entry.name), childRelativePath);
              return { id: childRelativePath, name: entry.name, path: childRelativePath, kind: "directory", children };
            } catch (err) {
              // Shown, not skipped, so the user knows the folder exists and why its files are missing.
              console.warn(`Could not read the folder "${childRelativePath}":`, err);
              return {
                id: childRelativePath,
                name: entry.name,
                path: childRelativePath,
                kind: "directory",
                children: [],
                isUnreadable: true,
              };
            }
          }
          const ext = entry.name.includes(".") ? entry.name.split(".").pop()?.toLowerCase() : "";
          return { id: childRelativePath, name: entry.name, path: childRelativePath, kind: "file", extension: ext };
        }),
    );
    return sortNodes(nodes);
  }

  async function isReadable(folderPath: string): Promise<boolean> {
    try {
      await readDir(folderPath);
      return true;
    } catch (err) {
      console.warn(`Could not read the folder "${folderNameFromPath(folderPath)}":`, err);
      return false;
    }
  }

  return {
    isSupported,

    async pickFolder(): Promise<WorkspaceFolder | null> {
      // `open()` itself resolves to null on user cancellation rather than rejecting, so any
      // rejection here is a genuine failure and must propagate rather than being swallowed
      // into the same null result cancellation produces.
      // `recursive` grants the whole tree to the fs scope; without it only the folder's direct children
      // are allowed, and reading `.vista/workspace.json` or any subfolder is refused.
      const selected = await open({
        directory: true,
        recursive: true,
        multiple: false,
        title: "Select Folder for Vista Workspace",
      });
      if (!selected || typeof selected !== "string") {
        return null;
      }
      return rememberFolder(selected);
    },

    async restoreFolder(id: string): Promise<RestoreFolderResult> {
      const savedPath = readFolderPaths()[id];
      if (!savedPath) {
        return { status: "none" };
      }
      // Probing the folder is what detects a missing folder or one the persisted fs scope no longer allows.
      if (!(await isReadable(savedPath))) {
        return { status: "unavailable", name: folderNameFromPath(savedPath) };
      }
      return { status: "restored", folder: folderAt(id, savedPath) };
    },

    async forgetFolder(id: string): Promise<void> {
      const paths = readFolderPaths();
      if (id in paths) {
        delete paths[id];
        saveFolderPaths(paths);
      }
    },

    relate: async (a, b) => relateFolderPaths(a.rootPath, b.rootPath),

    async resolveRelative(from: WorkspaceFolder, relativePath: string): Promise<WorkspaceFolder | null> {
      const target = resolveRelativePath(from.rootPath, relativePath);
      // Only a folder already in the granted scope can be read; anything else is not found.
      if (target === null || !(await isReadable(target))) {
        return null;
      }
      return rememberFolder(target);
    },

    relativeLocation: async (from, to) => relativeFolderPath(from.rootPath, to.rootPath),

    async reveal(folder: WorkspaceFolder, path: string): Promise<void> {
      const fullPath = path === "" ? normalizeFolderPath(folder.rootPath) : joinFolderPath(folder.rootPath, path);
      await revealItemInDir(toPlatformPath(fullPath));
    },

    // A root that cannot be read fails the whole call, so a vanished folder never shows as empty.
    readTree: (folder) => scanDirectory(folder.rootPath, ""),

    async stat(folder: WorkspaceFolder, path: string): Promise<FileStat | null> {
      const current = await statFile(joinFolderPath(folder.rootPath, path));
      return current ? { size: current.size, modifiedAt: current.modifiedAt } : null;
    },

    async readFile(folder: WorkspaceFolder, path: string): Promise<FileContents> {
      const fullPath = joinFolderPath(folder.rootPath, path);
      // Stated before reading: a change in between then reads as newer than this version and is
      // noticed on the next check, rather than hidden behind a version that matches it.
      const current = await statFile(fullPath);
      if (!current) {
        throw new Error(`"${path}" was not found.`);
      }
      const bytes = await readFileBytes(fullPath);
      return { bytes, stat: { size: current.size, modifiedAt: current.modifiedAt } };
    },

    async writeFile(
      folder: WorkspaceFolder,
      path: string,
      bytes: Uint8Array<ArrayBuffer>,
      options?: { expected?: FileStat },
    ): Promise<FileStat> {
      const fullPath = joinFolderPath(folder.rootPath, path);
      const current = await statFile(fullPath);
      const expected = options?.expected;
      if (expected && (!current || current.size !== expected.size || current.modifiedAt !== expected.modifiedAt)) {
        throw new WorkspaceError("conflict", `"${path}" changed on disk after it was read.`);
      }

      // A rename would replace a symbolic link with a regular file, and the file it points to would stop
      // changing. So a link is written through, in place, without the temporary file's protection.
      if (current && (await isSymlink(fullPath))) {
        await writeFileBytes(fullPath, bytes);
        return statWritten(fullPath, path);
      }

      // Written beside the file and renamed over it, so a crash or a full disk mid-write leaves the
      // original intact rather than truncated. The rename replaces the file in one step on Windows,
      // Linux, and macOS.
      const { directory, name } = splitNativePath(fullPath);
      // No leading dot: on Unix, Tauri's filesystem scope does not match dotfiles inside the granted folder.
      const tempPath = `${directory}/${name}.vista-save-${crypto.randomUUID().slice(0, 8)}`;
      // Unix permission bits only; Windows reports none.
      const mode = current?.mode === null || current?.mode === undefined ? undefined : current.mode & 0o7777;
      try {
        // Inside the try, so a write that fails partway, such as on a full disk, leaves no temporary file.
        await writeFileBytes(tempPath, bytes, { createNew: true, ...(mode === undefined ? {} : { mode }) });
        // Stated before the rename, which keeps size and modification time, so a program that changes the
        // file right after cannot have its version recorded as the one Vista saved.
        const written = await statWritten(tempPath, path);
        await rename(tempPath, fullPath);
        return written;
      } catch (err) {
        await removeEntry(tempPath).catch((cleanupErr: unknown) =>
          console.warn(`Could not remove the temporary file "${tempPath}":`, cleanupErr),
        );
        throw err;
      }
    },

    async createFile(folder: WorkspaceFolder, path: string): Promise<void> {
      const fullPath = joinFolderPath(folder.rootPath, path);
      if (await exists(fullPath)) {
        throw new Error(`"${path.split("/").pop()}" already exists.`);
      }
      // `createNew` fails atomically if the file was created by something else between
      // the `exists` check above and this call, rather than silently overwriting it.
      await writeFileBytes(fullPath, new Uint8Array(), { createNew: true });
    },

    async createDirectory(folder: WorkspaceFolder, path: string): Promise<void> {
      const fullPath = joinFolderPath(folder.rootPath, path);
      if (await exists(fullPath)) {
        throw new Error(`"${path.split("/").pop()}" already exists.`);
      }
      await mkdir(fullPath);
    },

    async move(folder: WorkspaceFolder, fromPath: string, toPath: string): Promise<void> {
      const fullFromPath = joinFolderPath(folder.rootPath, fromPath);
      const fullToPath = joinFolderPath(folder.rootPath, toPath);
      // `rename` silently replaces an existing destination rather than failing, so the
      // collision check has to happen explicitly here to honor the contract.
      if (await exists(fullToPath)) {
        throw new Error(`An entry already exists at "${toPath}".`);
      }
      await rename(fullFromPath, fullToPath);
    },

    async remove(folder: WorkspaceFolder, path: string): Promise<void> {
      await removeEntry(joinFolderPath(folder.rootPath, path), { recursive: true });
    },
  };
}
