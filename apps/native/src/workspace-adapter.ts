import { open } from "@tauri-apps/plugin-dialog";
import {
  exists,
  mkdir,
  readDir,
  readTextFile,
  remove as removeEntry,
  rename,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import type { RestoreFolderResult, Workspace, WorkspaceCapability, WorkspaceNode } from "@vista/app";

const LAST_FOLDER_STORAGE_KEY = "vista.lastFolder";

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

/**
 * Creates a WorkspaceCapability adapter for the Native (Tauri) platform.
 *
 * @returns Configured native workspace capability.
 */
export function createNativeWorkspaceAdapter(): WorkspaceCapability {
  const isSupported = typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);

  let currentRootPath: string | null = null;

  function joinPath(base: string, part: string): string {
    const cleanBase = base.replace(/[\\/]+$/, "");
    const cleanPart = part.replace(/^[\\/]+/, "");
    return `${cleanBase}/${cleanPart}`;
  }

  const IGNORED_NAMES = new Set([
    ".git",
    "node_modules",
    ".svn",
    ".hg",
    ".DS_Store",
    "Thumbs.db",
    ".idea",
    ".vscode",
    "dist",
    "build",
    "coverage",
  ]);

  async function scanDirectory(fullPath: string, relativePath: string): Promise<WorkspaceNode[]> {
    let entries: Awaited<ReturnType<typeof readDir>> = [];
    try {
      entries = await readDir(fullPath);
    } catch (err) {
      console.warn(`Could not read native directory "${fullPath}":`, err);
      return [];
    }

    const filtered = entries.filter((e) => !IGNORED_NAMES.has(e.name));

    const nodes = await Promise.all(
      filtered.map(async (entry): Promise<WorkspaceNode> => {
        const childRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
        const childFullPath = joinPath(fullPath, entry.name);

        if (entry.isDirectory) {
          const children = await scanDirectory(childFullPath, childRelativePath);
          return {
            id: childRelativePath,
            name: entry.name,
            path: childRelativePath,
            kind: "directory",
            children,
          };
        }

        const ext = entry.name.includes(".") ? entry.name.split(".").pop()?.toLowerCase() : "";
        return {
          id: childRelativePath,
          name: entry.name,
          path: childRelativePath,
          kind: "file",
          extension: ext,
        };
      }),
    );

    return nodes.sort((a, b) => {
      if (a.kind !== b.kind) {
        return a.kind === "directory" ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  }

  /**
   * Makes a folder path the active workspace root.
   *
   * @param folderPath - Absolute path of the folder to adopt.
   * @returns The workspace descriptor for the folder.
   */
  function adoptFolderPath(folderPath: string): Workspace {
    currentRootPath = folderPath;
    return {
      id: folderPath,
      name: folderNameFromPath(folderPath),
      rootPath: folderPath,
    };
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

      return { status: "restored", workspace: adoptFolderPath(savedPath) };
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

      const workspace = adoptFolderPath(selected);
      saveLastFolderPath(selected);
      return workspace;
    },

    async readTree(): Promise<WorkspaceNode[]> {
      if (!currentRootPath) {
        return [];
      }
      return scanDirectory(currentRootPath, "");
    },

    async readFile(path: string): Promise<string> {
      if (!currentRootPath) {
        throw new Error("No native workspace root folder selected");
      }
      const fullPath = joinPath(currentRootPath, path);
      return readTextFile(fullPath);
    },

    async writeFile(path: string, content: string): Promise<void> {
      if (!currentRootPath) {
        throw new Error("No native workspace root folder selected");
      }
      const fullPath = joinPath(currentRootPath, path);
      return writeTextFile(fullPath, content);
    },

    async createFile(path: string): Promise<void> {
      if (!currentRootPath) {
        throw new Error("No native workspace root folder selected");
      }
      const fullPath = joinPath(currentRootPath, path);
      if (await exists(fullPath)) {
        throw new Error(`"${path.split("/").pop()}" already exists.`);
      }
      // `createNew` fails atomically if the file was created by something else between
      // the `exists` check above and this call, rather than silently overwriting it.
      await writeTextFile(fullPath, "", { createNew: true });
    },

    async createDirectory(path: string): Promise<void> {
      if (!currentRootPath) {
        throw new Error("No native workspace root folder selected");
      }
      const fullPath = joinPath(currentRootPath, path);
      if (await exists(fullPath)) {
        throw new Error(`"${path.split("/").pop()}" already exists.`);
      }
      await mkdir(fullPath);
    },

    async move(fromPath: string, toPath: string): Promise<void> {
      if (!currentRootPath) {
        throw new Error("No native workspace root folder selected");
      }
      const fullFromPath = joinPath(currentRootPath, fromPath);
      const fullToPath = joinPath(currentRootPath, toPath);
      // `rename` silently replaces an existing destination rather than failing, so the
      // collision check has to happen explicitly here to honor the contract.
      if (await exists(fullToPath)) {
        throw new Error(`An entry already exists at "${toPath}".`);
      }
      await rename(fullFromPath, fullToPath);
    },

    async remove(path: string): Promise<void> {
      if (!currentRootPath) {
        throw new Error("No native workspace root folder selected");
      }
      const fullPath = joinPath(currentRootPath, path);
      await removeEntry(fullPath, { recursive: true });
    },
  };
}
