/** Platform host kinds supported by the shared application. */
export type AppPlatform = "native" | "web";

/** Presentation mode for document content. */
export type ViewMode = "raw" | "enriched";

/** Opaque workspace descriptor representing an opened root folder. */
export interface Workspace {
  /** Unique identifier for the workspace session. */
  id: string;
  /** Human-readable folder name. */
  name: string;
  /** Platform-specific root path or uri reference. */
  rootPath: string;
  /**
   * How this workspace accesses disk. `"direct"` means reads and writes go straight
   * to the file system. `"fallback"` means the host could not get direct write access
   * (for example, an unsupported browser) and writes take a different, more limited
   * path such as downloading a file instead of writing it in place. Omitted or
   * `"direct"` on platforms that only ever have one access mode, such as native hosts.
   */
  accessMode?: "direct" | "fallback";
}

/** Node in the workspace file tree. */
export interface WorkspaceNode {
  /** Unique identifier for the node within the workspace tree. */
  id: string;
  /** Name of the file or directory. */
  name: string;
  /** Path relative to the workspace root. */
  path: string;
  /** Whether this node is a file or directory. */
  kind: "file" | "directory";
  /** Normalized file extension without leading dot, if kind is 'file'. */
  extension?: string;
  /** Child nodes if kind is 'directory'. */
  children?: WorkspaceNode[];
}

/** In-memory document buffer representing an open file. */
export interface FileDocument {
  /** Path of the file relative to the workspace root. */
  path: string;
  /** File name with extension. */
  name: string;
  /** File extension without leading dot. */
  extension: string;
  /** Current in-memory content of the document. */
  content: string;
  /** Indicates whether the buffer contains unsaved modifications. */
  isDirty: boolean;
}

/**
 * Outcome of trying to reopen the most recently opened folder without showing a picker.
 *
 * - `"restored"`: the folder was reopened and is ready to read.
 * - `"needs-permission"`: the folder is remembered, but the host needs a user gesture before it
 *   may access it again (web). Call `restoreFolder({ interactive: true })` from a click handler.
 * - `"unavailable"`: the folder is remembered but can no longer be opened (deleted, moved, or
 *   access revoked). The host has already forgotten it, so later attempts return `"none"`.
 * - `"none"`: no folder is remembered, or the host cannot remember folders at all.
 */
export type RestoreFolderResult =
  | { status: "restored"; workspace: Workspace }
  | { status: "needs-permission"; name: string }
  | { status: "unavailable"; name: string }
  | { status: "none" };

/** Host capabilities for accessing, reading, and persisting local files and folders. */
export interface WorkspaceCapability {
  /** Whether workspace filesystem access is supported in the current environment. */
  readonly isSupported: boolean;
  /**
   * Prompts the user to pick a local directory to open as a workspace. A successfully opened
   * folder becomes the one `restoreFolder` reopens later, where the host supports that.
   *
   * @returns The opened workspace descriptor, or null if the user cancelled.
   */
  openFolder(): Promise<Workspace | null>;
  /**
   * Reopens the most recently opened folder without showing a picker.
   *
   * @param options - `interactive: true` allows the host to show a permission prompt, and MUST only
   *   be passed from a user gesture such as a click handler. With `false`, the host never prompts.
   * @returns The restore outcome. Rejects only on unexpected failures; a missing or inaccessible
   *   folder resolves to `"unavailable"` instead.
   */
  restoreFolder(options: { interactive: boolean }): Promise<RestoreFolderResult>;
  /**
   * Scans and returns the directory tree structure for the given workspace.
   *
   * @param workspace - The workspace to read.
   * @returns A promise resolving to the list of root nodes in the directory tree.
   */
  readTree(workspace: Workspace): Promise<WorkspaceNode[]>;
  /**
   * Reads the content of a file from disk as UTF-8 text.
   *
   * @param path - Relative path of the file to read.
   * @returns A promise resolving to the string contents of the file.
   */
  readFile(path: string): Promise<string>;
  /**
   * Writes the provided UTF-8 text content to the specified file on disk.
   *
   * @param path - Relative path of the file to write.
   * @param content - String content to persist.
   * @returns A promise that resolves when writing is complete.
   */
  writeFile(path: string, content: string): Promise<void>;
  /**
   * Creates a new, empty file at the given path.
   *
   * @param path - Relative path of the file to create, including its extension.
   * @returns A promise that resolves when the file has been created.
   * @throws If an entry already exists at path, or an intermediate segment is not a directory.
   */
  createFile(path: string): Promise<void>;
  /**
   * Creates a new, empty directory at the given path.
   *
   * @param path - Relative path of the directory to create.
   * @returns A promise that resolves when the directory has been created.
   * @throws If an entry already exists at path, or an intermediate segment is not a directory.
   */
  createDirectory(path: string): Promise<void>;
  /**
   * Moves or renames a file or directory. A rename is a move within the same parent directory.
   * Directory moves are recursive. On the web host this is implemented as a copy followed by a
   * delete (the File System Access API has no native move), so it is not atomic: a failure
   * partway through leaves the source in place rather than risking data loss, and the error
   * propagates for the caller to handle. The native host performs an atomic rename.
   *
   * @param fromPath - Current relative path of the entry.
   * @param toPath - Destination relative path of the entry.
   * @returns A promise that resolves when the move completes.
   * @throws If fromPath does not exist, or an entry already exists at toPath.
   */
  move(fromPath: string, toPath: string): Promise<void>;
  /**
   * Permanently deletes a file or directory. Directory deletion is recursive. This cannot be undone.
   *
   * @param path - Relative path of the entry to delete.
   * @returns A promise that resolves when deletion completes.
   * @throws If path does not exist.
   */
  remove(path: string): Promise<void>;
}

/** Host or shared capability for managing application theme preferences. */
export interface ThemeCapability {
  /** Current active theme scheme. */
  theme: "light" | "dark";
  /**
   * Sets the active theme explicitly.
   *
   * @param theme - The desired theme scheme.
   */
  setTheme(theme: "light" | "dark"): void;
  /** Toggles between light and dark themes. */
  toggleTheme(): void;
}

/** Capabilities and platform information supplied by a Vista host. */
export interface AppAdapter {
  /** Platform currently hosting the shared application. */
  platform: AppPlatform;
  /** Workspace filesystem operations provided by the host. */
  workspace: WorkspaceCapability;
  /** Optional theme management provided by or synchronized with the host. */
  theme?: ThemeCapability;
}
