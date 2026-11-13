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
  /** True for a directory the host could not list, such as one the user has no permission to read. */
  isUnreadable?: boolean;
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

/**
 * What identifies one version of a file on disk. Two stats are the same version when both fields
 * match; hosts never compare them any other way.
 */
export interface FileStat {
  /** Size in bytes. */
  size: number;
  /** Last modification time, in milliseconds since the Unix epoch. */
  modifiedAt: number;
}

/** A file's bytes and the version they were read from. */
export interface FileContents {
  bytes: Uint8Array<ArrayBuffer>;
  stat: FileStat;
}

/** Why a workspace operation failed, for failures the application handles rather than reports. */
export type WorkspaceErrorKind = "conflict";

/**
 * A failure the application branches on. `"conflict"`: the file on disk is not the version the
 * caller expected, because something else changed, created, or deleted it.
 */
export class WorkspaceError extends Error {
  readonly kind: WorkspaceErrorKind;

  constructor(kind: WorkspaceErrorKind, message: string) {
    super(message);
    this.name = "WorkspaceError";
    this.kind = kind;
  }
}

/**
 * Host capabilities for accessing, reading, and persisting local files and folders. Every
 * operation after `openFolder` and `restoreFolder` names the workspace it acts on, and paths are
 * relative to that workspace's root, with `/` separators.
 */
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
   * Reads a file's current version without reading its bytes.
   *
   * @returns The file's stat, or null when no file exists at path.
   */
  stat(workspace: Workspace, path: string): Promise<FileStat | null>;
  /**
   * Reads a file's bytes and the version they belong to.
   *
   * @throws If no file exists at path or it cannot be read.
   */
  readFile(workspace: Workspace, path: string): Promise<FileContents>;
  /**
   * Replaces a file's bytes. A reader never sees a partly written file: the host writes the new
   * bytes beside the file and swaps them in, or uses a platform write with the same guarantee.
   *
   * @param options - `expected`: the version the caller last read or wrote. When the file on disk
   *   is a different version or no longer exists, the write does not happen and the promise rejects
   *   with a `WorkspaceError` of kind `"conflict"`. Omit it to overwrite whatever is there.
   * @returns The version just written.
   * @throws `WorkspaceError` `"conflict"` as described above; otherwise, if the file cannot be written.
   */
  writeFile(
    workspace: Workspace,
    path: string,
    bytes: Uint8Array<ArrayBuffer>,
    options?: { expected?: FileStat },
  ): Promise<FileStat>;
  /**
   * Creates a new, empty file at the given path.
   *
   * @throws If an entry already exists at path, or an intermediate segment is not a directory.
   */
  createFile(workspace: Workspace, path: string): Promise<void>;
  /**
   * Creates a new, empty directory at the given path.
   *
   * @throws If an entry already exists at path, or an intermediate segment is not a directory.
   */
  createDirectory(workspace: Workspace, path: string): Promise<void>;
  /**
   * Moves or renames a file or directory. A rename is a move within the same parent directory.
   * Directory moves are recursive. On the web host this is implemented as a copy followed by a
   * delete (the File System Access API has no native move), so it is not atomic: a failure
   * partway through leaves the source in place rather than risking data loss, and the error
   * propagates for the caller to handle. The native host performs an atomic rename.
   *
   * @throws If fromPath does not exist, or an entry already exists at toPath.
   */
  move(workspace: Workspace, fromPath: string, toPath: string): Promise<void>;
  /**
   * Permanently deletes a file or directory. Directory deletion is recursive. This cannot be undone.
   *
   * @throws If path does not exist.
   */
  remove(workspace: Workspace, path: string): Promise<void>;
}

/** Host window behavior the application takes part in. */
export interface WindowCapability {
  /**
   * Registers a check that runs when the user asks to close the window. The window closes only
   * when the check resolves true; a check that rejects lets the window close, so a fault never
   * traps the user.
   *
   * @returns A function that removes the check.
   */
  onCloseRequested(check: () => Promise<boolean>): () => void;
}

/** A newer version of the desktop app, ready to install. */
export interface AvailableUpdate {
  /** The new version, such as `0.3.0`. */
  version: string;
  /**
   * Downloads, verifies, and installs the update, then restarts the app. It may not return: on
   * Windows the installer ends the running app itself.
   *
   * @throws When the download, the signature check, or the installation fails.
   */
  install(): Promise<void>;
}

/** Updates for hosts that ship as installed apps. */
export interface UpdaterCapability {
  /**
   * Asks the release source whether a newer version exists.
   *
   * @returns The update, or null when the app is up to date.
   * @throws When the release source cannot be reached or its answer is invalid.
   */
  check(): Promise<AvailableUpdate | null>;
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
  /**
   * Window behavior, for hosts that own their window. A browser tab has none: the application
   * uses the page's unload warning there instead.
   */
  window?: WindowCapability;
  /** Updates for an installed app. The web app has none: a reload loads the current version. */
  updater?: UpdaterCapability;
}
