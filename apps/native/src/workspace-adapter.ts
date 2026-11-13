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
import {
  WorkspaceError,
  type FileContents,
  type FileStat,
  type RestoreFolderResult,
  type Workspace,
  type WorkspaceCapability,
  type WorkspaceNode,
} from "@vista/app";

const LAST_FOLDER_STORAGE_KEY = "vista.lastFolder";

// Version-control internals, installed dependencies, and OS metadata: never notes, and large
// enough to slow every scan. A folder such as `build` or `.vscode` is shown, since notes can live there.
const IGNORED_NAMES = new Set([".git", ".svn", ".hg", "node_modules", ".DS_Store", "Thumbs.db"]);

// Each `readDir` is an IPC call and an open directory handle; past a few dozen at once a large
// tree only queues them in the backend and risks the per-process handle limit on Linux.
const MAX_CONCURRENT_DIRECTORY_READS = 16;

/**
 * Derives a human-readable folder name from a native path.
 *
 * @param folderPath - Absolute path of the folder.
 * @returns The final path segment, or "Workspace" if none remains.
 */
function folderNameFromPath(folderPath: string): string {
  return (
    folderPath
      .replace(/[\\/]+$/, "")
      .split(/[\\/]/)
      .pop() || "Workspace"
  );
}

/**
 * Reads the remembered folder path from webview storage. Storage failures are logged and treated
 * as nothing remembered.
 *
 * @returns The remembered folder path, or null if none is stored or storage is unavailable.
 */
function readLastFolderPath(): string | null {
  try {
    return window.localStorage.getItem(LAST_FOLDER_STORAGE_KEY);
  } catch (err) {
    console.warn("Could not read the last opened folder:", err);
    return null;
  }
}

/**
 * Stores the folder path to restore on the next launch. Failures are logged only.
 *
 * @param folderPath - Absolute path of the folder that was just opened.
 */
function saveLastFolderPath(folderPath: string): void {
  try {
    window.localStorage.setItem(LAST_FOLDER_STORAGE_KEY, folderPath);
  } catch (err) {
    console.warn("Could not remember the opened folder:", err);
  }
}

/**
 * Forgets the remembered folder path. Failures are logged only.
 */
function forgetLastFolderPath(): void {
  try {
    window.localStorage.removeItem(LAST_FOLDER_STORAGE_KEY);
  } catch (err) {
    console.warn("Could not forget the last opened folder:", err);
  }
}

function joinPath(base: string, part: string): string {
  const cleanBase = base.replace(/[\\/]+$/, "");
  const cleanPart = part.replace(/^[\\/]+/, "");
  return `${cleanBase}/${cleanPart}`;
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
 * Creates a WorkspaceCapability adapter for the Native (Tauri) platform. A workspace's id and
 * root path are its folder's absolute path, so every operation acts on the folder it names.
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
              const children = await scanDirectory(joinPath(fullPath, entry.name), childRelativePath);
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

  function workspaceForFolder(folderPath: string): Workspace {
    return { id: folderPath, name: folderNameFromPath(folderPath), rootPath: folderPath };
  }

  return {
    isSupported,

    async restoreFolder(): Promise<RestoreFolderResult> {
      const savedPath = readLastFolderPath();
      if (!savedPath) {
        return { status: "none" };
      }

      // Probing the folder is what detects a missing folder or one the persisted fs scope no longer allows.
      try {
        await readDir(savedPath);
      } catch (err) {
        const name = folderNameFromPath(savedPath);
        console.warn(`Could not reopen the last folder "${savedPath}":`, err);
        forgetLastFolderPath();
        return { status: "unavailable", name };
      }

      return { status: "restored", workspace: workspaceForFolder(savedPath) };
    },

    async openFolder(): Promise<Workspace | null> {
      // `open()` itself resolves to null on user cancellation rather than rejecting, so any
      // rejection here is a genuine failure and must propagate rather than being swallowed
      // into the same null result cancellation produces.
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Folder for Vista Workspace",
      });

      if (!selected || typeof selected !== "string") {
        return null;
      }

      saveLastFolderPath(selected);
      return workspaceForFolder(selected);
    },

    // A root that cannot be read fails the whole call, so a vanished folder never shows as empty.
    readTree: (workspace) => scanDirectory(workspace.rootPath, ""),

    async stat(workspace: Workspace, path: string): Promise<FileStat | null> {
      const current = await statFile(joinPath(workspace.rootPath, path));
      return current ? { size: current.size, modifiedAt: current.modifiedAt } : null;
    },

    async readFile(workspace: Workspace, path: string): Promise<FileContents> {
      const fullPath = joinPath(workspace.rootPath, path);
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
      workspace: Workspace,
      path: string,
      bytes: Uint8Array<ArrayBuffer>,
      options?: { expected?: FileStat },
    ): Promise<FileStat> {
      const fullPath = joinPath(workspace.rootPath, path);
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
      const tempPath = `${directory}/.${name}.vista-save-${crypto.randomUUID().slice(0, 8)}`;
      // Unix permission bits only; Windows reports none.
      const mode = current?.mode === null || current?.mode === undefined ? undefined : current.mode & 0o7777;
      try {
        // Inside the try, so a write that fails partway, such as on a full disk, leaves no temporary file.
        await writeFileBytes(tempPath, bytes, { createNew: true, ...(mode === undefined ? {} : { mode }) });
        await rename(tempPath, fullPath);
      } catch (err) {
        await removeEntry(tempPath).catch((cleanupErr: unknown) =>
          console.warn(`Could not remove the temporary file "${tempPath}":`, cleanupErr),
        );
        throw err;
      }
      return statWritten(fullPath, path);
    },

    async createFile(workspace: Workspace, path: string): Promise<void> {
      const fullPath = joinPath(workspace.rootPath, path);
      if (await exists(fullPath)) {
        throw new Error(`"${path.split("/").pop()}" already exists.`);
      }
      // `createNew` fails atomically if the file was created by something else between
      // the `exists` check above and this call, rather than silently overwriting it.
      await writeFileBytes(fullPath, new Uint8Array(), { createNew: true });
    },

    async createDirectory(workspace: Workspace, path: string): Promise<void> {
      const fullPath = joinPath(workspace.rootPath, path);
      if (await exists(fullPath)) {
        throw new Error(`"${path.split("/").pop()}" already exists.`);
      }
      await mkdir(fullPath);
    },

    async move(workspace: Workspace, fromPath: string, toPath: string): Promise<void> {
      const fullFromPath = joinPath(workspace.rootPath, fromPath);
      const fullToPath = joinPath(workspace.rootPath, toPath);
      // `rename` silently replaces an existing destination rather than failing, so the
      // collision check has to happen explicitly here to honor the contract.
      if (await exists(fullToPath)) {
        throw new Error(`An entry already exists at "${toPath}".`);
      }
      await rename(fullFromPath, fullToPath);
    },

    async remove(workspace: Workspace, path: string): Promise<void> {
      await removeEntry(joinPath(workspace.rootPath, path), { recursive: true });
    },
  };
}
