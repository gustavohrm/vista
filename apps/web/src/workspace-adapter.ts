import type { RestoreFolderResult, Workspace, WorkspaceCapability, WorkspaceNode } from "@vista/app";

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

interface DirectoryInputResult {
  rootName: string;
  nodes: WorkspaceNode[];
  fileMap: Map<string, File>;
}

/**
 * Sorts workspace nodes directories-first, then alphabetically by name.
 *
 * @param nodes - Nodes to sort in place.
 * @returns The same array, sorted.
 */
function sortNodes(nodes: WorkspaceNode[]): WorkspaceNode[] {
  return nodes.sort((a, b) => {
    if (a.kind !== b.kind) {
      return a.kind === "directory" ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}

/**
 * Splits a relative workspace path into its parent directory path and final segment name.
 *
 * @param path - Relative path within the workspace.
 * @returns The parent path (empty string for a root-level entry) and the entry's own name.
 */
function splitPath(path: string): { parentPath: string; name: string } {
  const lastSlash = path.lastIndexOf("/");
  if (lastSlash === -1) {
    return { parentPath: "", name: path };
  }
  return { parentPath: path.slice(0, lastSlash), name: path.slice(lastSlash + 1) };
}

/**
 * Builds a hierarchical workspace tree from a flat list of File objects obtained via webkitdirectory.
 *
 * @param files - Selected files from input.
 * @returns Parsed root name, hierarchical nodes, and relative path to File map.
 */
function buildTreeFromInputFiles(files: File[]): DirectoryInputResult {
  const fileMap = new Map<string, File>();
  if (files.length === 0) {
    return { rootName: "Workspace", nodes: [], fileMap };
  }

  const firstPath = files[0].webkitRelativePath || files[0].name;
  const rootName = firstPath.split("/")[0] || "Workspace";

  interface DirBucket {
    directories: Map<string, DirBucket>;
    files: Map<string, File>;
  }

  const rootBucket: DirBucket = { directories: new Map(), files: new Map() };

  for (const file of files) {
    const rawPath = file.webkitRelativePath || file.name;
    const segments = rawPath.split("/").filter(Boolean);
    // Strip root directory prefix if present
    const innerSegments = segments.length > 1 ? segments.slice(1) : segments;
    if (innerSegments.length === 0) {
      continue;
    }

    if (innerSegments.some((seg) => IGNORED_NAMES.has(seg))) {
      continue;
    }

    const relPath = innerSegments.join("/");
    fileMap.set(relPath, file);

    let current = rootBucket;
    for (let i = 0; i < innerSegments.length - 1; i++) {
      const seg = innerSegments[i];
      if (!current.directories.has(seg)) {
        current.directories.set(seg, { directories: new Map(), files: new Map() });
      }
      current = current.directories.get(seg)!;
    }

    const fileName = innerSegments[innerSegments.length - 1];
    current.files.set(fileName, file);
  }

  function bucketToNodes(bucket: DirBucket, parentPath: string): WorkspaceNode[] {
    const list: WorkspaceNode[] = [];

    for (const [dirName, subBucket] of bucket.directories.entries()) {
      const dirPath = parentPath ? `${parentPath}/${dirName}` : dirName;
      list.push({
        id: dirPath,
        name: dirName,
        path: dirPath,
        kind: "directory",
        children: bucketToNodes(subBucket, dirPath),
      });
    }

    for (const [fileName] of bucket.files.entries()) {
      const filePath = parentPath ? `${parentPath}/${fileName}` : fileName;
      const ext = fileName.includes(".") ? fileName.split(".").pop()?.toLowerCase() : "";
      list.push({
        id: filePath,
        name: fileName,
        path: filePath,
        kind: "file",
        extension: ext,
      });
    }

    return sortNodes(list);
  }

  return {
    rootName,
    nodes: bucketToNodes(rootBucket, ""),
    fileMap,
  };
}

/**
 * Prompts the user to pick a folder via an invisible <input type="file" webkitdirectory />.
 *
 * @returns Parsed files result or null if cancelled.
 */
function pickDirectoryViaInput(): Promise<DirectoryInputResult | null> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve(null);
      return;
    }

    const input = document.createElement("input");
    input.type = "file";
    input.webkitdirectory = true;
    // @ts-expect-error - non-standard directory property
    input.directory = true;
    input.multiple = true;
    input.style.position = "fixed";
    input.style.left = "-9999px";
    input.style.top = "-9999px";
    input.style.opacity = "0";

    let settled = false;

    const cleanup = () => {
      if (!settled) {
        settled = true;
        window.removeEventListener("focus", onWindowFocus);
        input.remove();
      }
    };

    const onWindowFocus = () => {
      setTimeout(() => {
        if (!settled && (!input.files || input.files.length === 0)) {
          cleanup();
          resolve(null);
        }
      }, 800);
    };

    input.addEventListener("change", () => {
      const files = Array.from(input.files ?? []);
      cleanup();
      if (files.length === 0) {
        resolve(null);
        return;
      }
      resolve(buildTreeFromInputFiles(files));
    });

    input.addEventListener("cancel", () => {
      cleanup();
      resolve(null);
    });

    window.addEventListener("focus", onWindowFocus);
    document.body.appendChild(input);
    input.click();
  });
}

/**
 * Downloads a file to disk as a web fallback when the File System Access API is not available.
 *
 * @param path - File path.
 * @param content - File text content.
 */
function downloadFallbackFile(path: string, content: string): void {
  if (typeof document === "undefined") {
    return;
  }
  const fileName = path.split("/").pop() || "file";
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Recursively scans a directory handle using the File System Access API.
 *
 * @param dirHandle - Active directory handle.
 * @param parentPath - Parent path prefix.
 * @param fileHandles - Cache map for file handles.
 * @returns Array of workspace tree nodes.
 */
async function scanDirectoryHandle(
  dirHandle: FileSystemDirectoryHandle,
  parentPath: string,
  fileHandles: Map<string, FileSystemFileHandle>,
): Promise<WorkspaceNode[]> {
  const nodes: WorkspaceNode[] = [];

  for await (const [name, handle] of dirHandle) {
    if (IGNORED_NAMES.has(name)) {
      continue;
    }

    const relativePath = parentPath ? `${parentPath}/${name}` : name;

    if (handle.kind === "directory") {
      try {
        const children = await scanDirectoryHandle(handle, relativePath, fileHandles);
        nodes.push({
          id: relativePath,
          name,
          path: relativePath,
          kind: "directory",
          children,
        });
      } catch (err) {
        console.warn(`Skipping inaccessible directory "${relativePath}":`, err);
      }
    } else if (handle.kind === "file") {
      const ext = name.includes(".") ? name.split(".").pop()?.toLowerCase() : "";
      fileHandles.set(relativePath, handle as FileSystemFileHandle);
      nodes.push({
        id: relativePath,
        name,
        path: relativePath,
        kind: "file",
        extension: ext,
      });
    }
  }

  return sortNodes(nodes);
}

/**
 * Finds the children array of a directory node within a workspace tree, so it can be
 * mutated in place. Used only by the fallback (non-FSA) in-memory tree.
 *
 * @param nodes - Tree to search.
 * @param parentPath - Path of the directory whose children array to return, or an empty
 *   string for the tree root.
 * @returns The children array, or null if no directory exists at parentPath.
 */
function findChildrenArray(nodes: WorkspaceNode[], parentPath: string): WorkspaceNode[] | null {
  if (parentPath === "") {
    return nodes;
  }
  for (const node of nodes) {
    if (node.kind !== "directory") {
      continue;
    }
    if (node.path === parentPath) {
      node.children ??= [];
      return node.children;
    }
    const found = findChildrenArray(node.children ?? [], parentPath);
    if (found) {
      return found;
    }
  }
  return null;
}

/**
 * Finds a node by path within a workspace tree and removes it from its parent's children array.
 * Used only by the fallback (non-FSA) in-memory tree.
 *
 * @param nodes - Tree to search and mutate.
 * @param path - Path of the node to remove.
 * @returns The removed node, or null if no node exists at path.
 */
function removeNodeAtPath(nodes: WorkspaceNode[], path: string): WorkspaceNode | null {
  const index = nodes.findIndex((node) => node.path === path);
  if (index !== -1) {
    const [removed] = nodes.splice(index, 1);
    return removed;
  }
  for (const node of nodes) {
    if (node.kind === "directory" && node.children) {
      const removed = removeNodeAtPath(node.children, path);
      if (removed) {
        return removed;
      }
    }
  }
  return null;
}

/**
 * Checks whether any node exists at the given path within a workspace tree.
 * Used only by the fallback (non-FSA) in-memory tree.
 *
 * @param nodes - Tree to search.
 * @param path - Path to look for.
 * @returns True if a node exists at path.
 */
function nodeExistsAtPath(nodes: WorkspaceNode[], path: string): boolean {
  for (const node of nodes) {
    if (node.path === path) {
      return true;
    }
    if (node.kind === "directory" && node.children && nodeExistsAtPath(node.children, path)) {
      return true;
    }
  }
  return false;
}

/**
 * Collects the path of a node and, if it is a directory, every descendant's path, in a
 * stable order. Used to rekey stored file content when a directory subtree moves.
 *
 * @param node - Root of the subtree to collect.
 * @returns Paths of node and all its descendants, node first.
 */
function collectSubtreePaths(node: WorkspaceNode): string[] {
  const paths = [node.path];
  for (const child of node.children ?? []) {
    paths.push(...collectSubtreePaths(child));
  }
  return paths;
}

/**
 * Rewrites a node's own path/id/name and, recursively, every descendant's path/id to sit
 * under a new location. Used only by the fallback (non-FSA) in-memory tree.
 *
 * @param node - Root of the subtree to rewrite, mutated in place.
 * @param newPath - New path for node itself.
 */
function relocateSubtree(node: WorkspaceNode, newPath: string): void {
  node.path = newPath;
  node.id = newPath;
  node.name = splitPath(newPath).name;
  for (const child of node.children ?? []) {
    relocateSubtree(child, `${newPath}/${child.name}`);
  }
}

type FsaPermissionMode = "read" | "readwrite";

/**
 * File System Access handles support `queryPermission`/`requestPermission` per the WICG spec,
 * but these are not yet part of TypeScript's bundled DOM lib types.
 */
interface PermissionCapableHandle {
  queryPermission(options?: { mode?: FsaPermissionMode }): Promise<PermissionState>;
  requestPermission(options?: { mode?: FsaPermissionMode }): Promise<PermissionState>;
}

/**
 * Ensures the given directory handle has the requested permission, prompting the user if needed.
 *
 * @param handle - Root directory handle to check.
 * @param mode - Permission level required for the caller's operation.
 * @throws If the user denies or dismisses the permission prompt.
 */
async function ensurePermission(handle: FileSystemDirectoryHandle, mode: FsaPermissionMode): Promise<void> {
  const capable = handle as unknown as PermissionCapableHandle;
  const current = await capable.queryPermission({ mode });
  if (current === "granted") {
    return;
  }
  const requested = await capable.requestPermission({ mode });
  if (requested !== "granted") {
    const verb = mode === "readwrite" ? "write to" : "read";
    throw new Error(`Permission to ${verb} this folder was not granted. Re-open the folder to try again.`);
  }
}

const LAST_FOLDER_DATABASE_NAME = "vista";
const LAST_FOLDER_STORE_NAME = "workspace";
const LAST_FOLDER_KEY = "lastFolder";

/**
 * Opens the IndexedDB database that stores the last opened folder handle.
 *
 * @returns The open database, or null when IndexedDB is unavailable in this environment.
 */
function openLastFolderDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") {
    return Promise.resolve(null);
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(LAST_FOLDER_DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(LAST_FOLDER_STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Runs a single request against the last-folder object store in its own transaction.
 *
 * @param mode - Transaction mode matching the operation.
 * @param operation - Builds the request to run against the object store.
 * @returns The request result, or undefined when IndexedDB is unavailable.
 */
async function runLastFolderRequest<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | undefined> {
  const database = await openLastFolderDatabase();
  if (!database) {
    return undefined;
  }
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(LAST_FOLDER_STORE_NAME, mode);
      const request = operation(transaction.objectStore(LAST_FOLDER_STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

/**
 * Reads the remembered folder handle. Read failures are logged and treated as nothing remembered.
 *
 * @returns The remembered directory handle, or null if none is stored or storage failed.
 */
async function readLastFolderHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const handle = await runLastFolderRequest<FileSystemDirectoryHandle>("readonly", (store) =>
      store.get(LAST_FOLDER_KEY),
    );
    return handle ?? null;
  } catch (err) {
    console.warn("Could not read the last opened folder:", err);
    return null;
  }
}

/**
 * Remembers a folder handle as the one to restore on the next launch. Failures are logged only.
 *
 * @param handle - Directory handle of the folder that was just opened.
 */
async function saveLastFolderHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  try {
    await runLastFolderRequest("readwrite", (store) => store.put(handle, LAST_FOLDER_KEY));
  } catch (err) {
    console.warn("Could not remember the opened folder:", err);
  }
}

/**
 * Forgets the remembered folder handle. Failures are logged only.
 */
async function forgetLastFolderHandle(): Promise<void> {
  try {
    await runLastFolderRequest("readwrite", (store) => store.delete(LAST_FOLDER_KEY));
  } catch (err) {
    console.warn("Could not forget the last opened folder:", err);
  }
}

/**
 * Creates a WorkspaceCapability adapter for the Web platform.
 * Supports direct disk read/write via the File System Access API (Chromium) and
 * falls back gracefully to standard web directory input for Firefox, Safari, and other browsers.
 *
 * @returns Configured web workspace capability.
 */
export function createWebWorkspaceAdapter(): WorkspaceCapability {
  let rootDirectoryHandle: FileSystemDirectoryHandle | null = null;
  const fileHandles = new Map<string, FileSystemFileHandle>();

  // Fallback in-memory state
  let fallbackTree: WorkspaceNode[] = [];
  const fallbackFiles = new Map<string, File>();
  const fallbackOverrides = new Map<string, string>();

  async function resolveDirectoryHandleChain(segments: string[]): Promise<FileSystemDirectoryHandle> {
    if (!rootDirectoryHandle) {
      throw new Error("No root directory handle available");
    }
    let current = rootDirectoryHandle;
    for (const segment of segments) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- Directory handles must be resolved sequentially from parent to child
      current = await current.getDirectoryHandle(segment);
    }
    return current;
  }

  async function resolveParentDirectoryHandle(
    path: string,
  ): Promise<{ parent: FileSystemDirectoryHandle; name: string }> {
    const { parentPath, name } = splitPath(path);
    const segments = parentPath === "" ? [] : parentPath.split("/");
    const parent = await resolveDirectoryHandleChain(segments);
    return { parent, name };
  }

  async function resolveFileHandle(path: string): Promise<FileSystemFileHandle> {
    const cached = fileHandles.get(path);
    if (cached) {
      return cached;
    }

    const { parent, name } = await resolveParentDirectoryHandle(path);
    const handle = await parent.getFileHandle(name);
    fileHandles.set(path, handle);
    return handle;
  }

  function forgetCachedHandlesUnder(path: string): void {
    for (const cachedPath of Array.from(fileHandles.keys())) {
      if (cachedPath === path || cachedPath.startsWith(`${path}/`)) {
        fileHandles.delete(cachedPath);
      }
    }
  }

  async function entryExistsInDirectory(parent: FileSystemDirectoryHandle, name: string): Promise<boolean> {
    try {
      await parent.getFileHandle(name);
      return true;
    } catch {
      // Not a file; fall through to check whether it's a directory instead.
    }
    try {
      await parent.getDirectoryHandle(name);
      return true;
    } catch {
      return false;
    }
  }

  async function copyFileEntry(
    sourceHandle: FileSystemFileHandle,
    destParent: FileSystemDirectoryHandle,
    destName: string,
  ): Promise<void> {
    const file = await sourceHandle.getFile();
    const destHandle = await destParent.getFileHandle(destName, { create: true });
    const writable = await destHandle.createWritable();
    await writable.write(await file.arrayBuffer());
    await writable.close();
  }

  async function copyDirectoryEntryRecursive(
    sourceHandle: FileSystemDirectoryHandle,
    destParent: FileSystemDirectoryHandle,
    destName: string,
  ): Promise<void> {
    const destHandle = await destParent.getDirectoryHandle(destName, { create: true });
    for await (const [name, handle] of sourceHandle) {
      if (IGNORED_NAMES.has(name)) {
        continue;
      }
      if (handle.kind === "directory") {
        // oxlint-disable-next-line eslint/no-await-in-loop -- entries must be copied sequentially so a mid-copy failure leaves a consistent partial result
        await copyDirectoryEntryRecursive(handle, destHandle, name);
      } else {
        // oxlint-disable-next-line eslint/no-await-in-loop -- entries must be copied sequentially so a mid-copy failure leaves a consistent partial result
        await copyFileEntry(handle as FileSystemFileHandle, destHandle, name);
      }
    }
  }

  /**
   * Makes a directory handle the active root for direct reads and writes, discarding any
   * fallback (in-memory) state from a previously opened folder.
   *
   * @param dirHandle - Directory handle to adopt as the workspace root.
   * @returns The direct-access workspace descriptor for the handle.
   */
  function adoptDirectoryHandle(dirHandle: FileSystemDirectoryHandle): Workspace {
    rootDirectoryHandle = dirHandle;
    fileHandles.clear();
    fallbackTree = [];
    fallbackFiles.clear();
    fallbackOverrides.clear();

    return {
      id: dirHandle.name,
      name: dirHandle.name,
      rootPath: "/",
      accessMode: "direct",
    };
  }

  return {
    isSupported: typeof window !== "undefined",

    async openFolder(): Promise<Workspace | null> {
      // Attempt 1: File System Access API (Chrome, Edge, Opera)
      interface FsaWindow {
        showDirectoryPicker?: (options?: { mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle>;
        isSecureContext?: boolean;
      }
      const fsaWindow = typeof window !== "undefined" ? (window as unknown as FsaWindow) : null;
      const canUseFsa = Boolean(
        fsaWindow && typeof fsaWindow.showDirectoryPicker === "function" && fsaWindow.isSecureContext,
      );

      if (canUseFsa && fsaWindow?.showDirectoryPicker) {
        try {
          // Request read-only access up front. Write access is requested lazily on
          // first save (see `ensurePermission` in `writeFile`) so opening a folder is
          // a single native picker interaction rather than two separate prompts —
          // a missed or dismissed second prompt previously surfaced as a silent no-op.
          const dirHandle = await fsaWindow.showDirectoryPicker({
            mode: "read",
          });

          const workspace = adoptDirectoryHandle(dirHandle);
          await saveLastFolderHandle(dirHandle);
          return workspace;
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") {
            return null; // User cancelled the picker
          }
          console.warn("showDirectoryPicker failed or restricted, falling back to directory input:", err);
        }
      }

      // Attempt 2: Directory Input Fallback (Firefox, Safari, non-secure origins, or iframe)
      const inputResult = await pickDirectoryViaInput();
      if (!inputResult) {
        return null;
      }

      rootDirectoryHandle = null;
      fileHandles.clear();
      fallbackTree = inputResult.nodes;
      fallbackFiles.clear();
      for (const [p, f] of inputResult.fileMap.entries()) {
        fallbackFiles.set(p, f);
      }
      fallbackOverrides.clear();
      // This folder cannot be reopened without a picker, so drop the previously remembered one.
      await forgetLastFolderHandle();

      return {
        id: inputResult.rootName,
        name: inputResult.rootName,
        rootPath: "/",
        accessMode: "fallback",
      };
    },

    async restoreFolder({ interactive }: { interactive: boolean }): Promise<RestoreFolderResult> {
      const handle = await readLastFolderHandle();
      if (!handle) {
        return { status: "none" };
      }

      const capable = handle as unknown as PermissionCapableHandle;
      const currentPermission = await capable.queryPermission({ mode: "read" });
      if (currentPermission !== "granted") {
        if (!interactive) {
          return { status: "needs-permission", name: handle.name };
        }
        // Chromium only accepts requestPermission during transient user activation, which the
        // caller guarantees when interactive is true. A dismissed prompt keeps the folder remembered.
        const requestedPermission = await capable.requestPermission({ mode: "read" });
        if (requestedPermission !== "granted") {
          return { status: "needs-permission", name: handle.name };
        }
      }

      try {
        // Reading the first entry proves the folder still exists and is readable.
        await handle.values().next();
      } catch (err) {
        console.warn(`Could not reopen the last folder "${handle.name}":`, err);
        await forgetLastFolderHandle();
        return { status: "unavailable", name: handle.name };
      }

      return { status: "restored", workspace: adoptDirectoryHandle(handle) };
    },

    async readTree(): Promise<WorkspaceNode[]> {
      if (rootDirectoryHandle) {
        await ensurePermission(rootDirectoryHandle, "read");
        fileHandles.clear();
        return scanDirectoryHandle(rootDirectoryHandle, "", fileHandles);
      }
      // A copy, so callers get a new reference after in-place mutations such as `remove()` splicing
      // this array; returning the same array would let React skip the re-render.
      return structuredClone(fallbackTree);
    },

    async readFile(path: string): Promise<string> {
      if (rootDirectoryHandle) {
        await ensurePermission(rootDirectoryHandle, "read");
        const handle = await resolveFileHandle(path);
        const file = await handle.getFile();
        return file.text();
      }

      if (fallbackOverrides.has(path)) {
        return fallbackOverrides.get(path)!;
      }

      const file = fallbackFiles.get(path);
      if (file) {
        return file.text();
      }

      throw new Error(`File not found: ${path}`);
    },

    async writeFile(path: string, content: string): Promise<void> {
      if (rootDirectoryHandle) {
        await ensurePermission(rootDirectoryHandle, "readwrite");
        const handle = await resolveFileHandle(path);
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
        return;
      }

      // Fallback mode: this browser has no direct-write API. Update the in-memory
      // cache and download a copy instead of silently doing nothing.
      fallbackOverrides.set(path, content);
      downloadFallbackFile(path, content);
    },

    async createFile(path: string): Promise<void> {
      const { parentPath, name } = splitPath(path);

      if (rootDirectoryHandle) {
        await ensurePermission(rootDirectoryHandle, "readwrite");
        const { parent } = await resolveParentDirectoryHandle(path);
        if (await entryExistsInDirectory(parent, name)) {
          throw new Error(`"${name}" already exists.`);
        }
        const handle = await parent.getFileHandle(name, { create: true });
        fileHandles.set(path, handle);
        return;
      }

      if (nodeExistsAtPath(fallbackTree, path)) {
        throw new Error(`"${name}" already exists.`);
      }
      const siblings = findChildrenArray(fallbackTree, parentPath);
      if (!siblings) {
        throw new Error(`Folder "${parentPath}" was not found.`);
      }
      const extension = name.includes(".") ? name.split(".").pop()?.toLowerCase() : "";
      siblings.push({ id: path, name, path, kind: "file", extension });
      sortNodes(siblings);
      fallbackOverrides.set(path, "");
    },

    async createDirectory(path: string): Promise<void> {
      const { parentPath, name } = splitPath(path);

      if (rootDirectoryHandle) {
        await ensurePermission(rootDirectoryHandle, "readwrite");
        const { parent } = await resolveParentDirectoryHandle(path);
        if (await entryExistsInDirectory(parent, name)) {
          throw new Error(`"${name}" already exists.`);
        }
        await parent.getDirectoryHandle(name, { create: true });
        return;
      }

      if (nodeExistsAtPath(fallbackTree, path)) {
        throw new Error(`"${name}" already exists.`);
      }
      const siblings = findChildrenArray(fallbackTree, parentPath);
      if (!siblings) {
        throw new Error(`Folder "${parentPath}" was not found.`);
      }
      siblings.push({ id: path, name, path, kind: "directory", children: [] });
      sortNodes(siblings);
    },

    async move(fromPath: string, toPath: string): Promise<void> {
      if (rootDirectoryHandle) {
        await ensurePermission(rootDirectoryHandle, "readwrite");
        const { parent: sourceParent, name: sourceName } = await resolveParentDirectoryHandle(fromPath);
        const { parent: destParent, name: destName } = await resolveParentDirectoryHandle(toPath);
        if (await entryExistsInDirectory(destParent, destName)) {
          throw new Error(`An entry already exists at "${toPath}".`);
        }

        let sourceFileHandle: FileSystemFileHandle | null = null;
        try {
          sourceFileHandle = await sourceParent.getFileHandle(sourceName);
        } catch {
          // Not a file; sourceName is expected to be a directory instead.
        }

        if (sourceFileHandle) {
          await copyFileEntry(sourceFileHandle, destParent, destName);
        } else {
          const sourceDirHandle = await sourceParent.getDirectoryHandle(sourceName);
          await copyDirectoryEntryRecursive(sourceDirHandle, destParent, destName);
        }

        // Only remove the source once the copy has fully succeeded, so a failure above
        // never destroys data (see the contract's non-atomicity note for the web host).
        await sourceParent.removeEntry(sourceName, { recursive: true });
        forgetCachedHandlesUnder(fromPath);
        return;
      }

      if (nodeExistsAtPath(fallbackTree, toPath)) {
        throw new Error(`An entry already exists at "${toPath}".`);
      }
      const removed = removeNodeAtPath(fallbackTree, fromPath);
      if (!removed) {
        throw new Error(`"${fromPath}" was not found.`);
      }
      const oldPaths = collectSubtreePaths(removed);
      relocateSubtree(removed, toPath);
      const newPaths = collectSubtreePaths(removed);

      const destSiblings = findChildrenArray(fallbackTree, splitPath(toPath).parentPath);
      if (!destSiblings) {
        throw new Error(`Folder "${splitPath(toPath).parentPath}" was not found.`);
      }
      destSiblings.push(removed);
      sortNodes(destSiblings);

      for (const [index, oldPath] of oldPaths.entries()) {
        const newPath = newPaths[index];
        const file = fallbackFiles.get(oldPath);
        if (file) {
          fallbackFiles.delete(oldPath);
          fallbackFiles.set(newPath, file);
        }
        const override = fallbackOverrides.get(oldPath);
        if (override !== undefined) {
          fallbackOverrides.delete(oldPath);
          fallbackOverrides.set(newPath, override);
        }
      }
    },

    async remove(path: string): Promise<void> {
      if (rootDirectoryHandle) {
        await ensurePermission(rootDirectoryHandle, "readwrite");
        const { parent, name } = await resolveParentDirectoryHandle(path);
        await parent.removeEntry(name, { recursive: true });
        forgetCachedHandlesUnder(path);
        return;
      }

      const removed = removeNodeAtPath(fallbackTree, path);
      if (!removed) {
        throw new Error(`"${path}" was not found.`);
      }
      for (const subPath of collectSubtreePaths(removed)) {
        fallbackFiles.delete(subPath);
        fallbackOverrides.delete(subPath);
      }
    },
  };
}
