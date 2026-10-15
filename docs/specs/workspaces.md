---
status: IMPLEMENTED
last_updated: 2026-10-14
scope: Local folder workspaces, file tree representation, document view modes, and persistence across hosts.
---

# Workspaces and document management

This specification covers how Vista manages local folder workspaces, file tree representations, document view modes (`raw` vs `enriched`), and explicit persistence across platform hosts.

## Core philosophy

Vista is an Obsidian-, Notion-, and VS Code-inspired personal workspace application that operates directly on user-selected local folders:

- **Local-first, direct disk access**: No proprietary database, shadow sync sandbox, or browser-isolated storage is used as a surrogate for user files.
- **Explicit saving**: Changes are saved only when the user explicitly triggers save (via `Ctrl+S`, `Cmd+S`, or the icon-only Save button in the document header). There is no automatic, background saving in v1. Navigating away from unsaved changes asks the user first (see [Unsaved changes](#unsaved-changes)), so edits are never discarded silently.
- **Dual-view paradigm**: Every supported file can be inspected and edited as raw text or rendered in an enriched presentation.

## Workspace lifecycle

In v1, Vista operates on **one active open folder** at a time:

- Users open a directory using the platform's native file picker (`window.showDirectoryPicker` on web; `@tauri-apps/plugin-dialog` on native).
- Opening a directory yields a `Workspace` entity (`id`, `name`, `rootPath`, and an optional `accessMode` distinguishing direct disk access from a more limited fallback — see [Platform-specific implementations](#platform-specific-implementations)).
- The directory tree is scanned and mapped into hierarchical `WorkspaceNode` models (`file` and `directory` nodes). Directories start collapsed, and empty folders show no children.
- While only one folder is active at a time in v1, the capability contract and state models are designed with opaque identifiers and collection structures to prevent painting future multi-root workspace support into a corner.

### Reopening the last folder

Each host remembers the most recently opened folder so the explorer can offer to reopen it at startup. Opening a different folder replaces the remembered one. `restoreFolder` reports `restored`, `needs-permission`, `unavailable` (remembered but gone or inaccessible), or `none` (nothing remembered). Per-host behavior:

- **Web (File System Access)**: the folder's `FileSystemDirectoryHandle` is stored in IndexedDB (database `vista`, store `workspace`, key `lastFolder`). At startup the folder reopens silently only when the browser already reports read permission as granted, for example after the user chose "Allow on every visit". Otherwise the explorer shows a "Reopen {name}" button. Clicking it requests permission, which needs a user gesture, so the restore never prompts on its own. "Open Folder" stays available in both states.
- **Web fallback (`webkitdirectory`)**: these folders cannot be remembered. Opening one forgets any stored handle, so the next startup shows the plain "Open Folder" state.
- **Native**: the root path is stored in the webview's `localStorage` under `vista.lastFolder` and probed with a directory read. Access survives restarts because the scope granted by the folder picker is persisted by `tauri-plugin-persisted-scope`, registered after the filesystem plugin; without it, dialog-granted scope would not survive a restart.
- **Mobile (Android and iOS)**: not supported yet. `@tauri-apps/plugin-dialog` has no folder picker on those platforms, so there is nothing to restore.

Failure handling: a remembered folder that no longer exists or is inaccessible is forgotten, and the user sees an info toast, `Couldn't reopen "{name}". It may have been moved or deleted.` The explorer then shows the plain "Open Folder" state. Unexpected failures surface as error toasts.

## Supported formats & view modes

The initial format targets in v1 are `.txt`, `.md`, and `.csv`:

| Format | Raw View                   | Enriched View                                                                   |
| :----- | :------------------------- | :------------------------------------------------------------------------------ |
| `.txt` | Plain-text editor          | Plain-text viewer/editor                                                        |
| `.md`  | Plain-text Markdown editor | WYSIWYG editable rendering (Milkdown), styled against `@codenhub/styles` tokens |
| `.csv` | Plain-text CSV editor      | Interactive data table with in-place cell editing                               |

Future versions will expand to `.json`, `.yaml`, canvas representations, and embedded graph links.

### Markdown WYSIWYG editing

The Enriched view for `.md`/`.markdown` files (`packages/app/src/components/editor/markdown-editor.tsx`) is a WYSIWYG editor built on [Milkdown](https://milkdown.dev/), using its CommonMark and GFM presets (headings, emphasis, lists, links, code blocks, blockquotes, tables, task lists, strikethrough) with a minimal custom theme styled directly against `@codenhub/styles` tokens rather than Milkdown's bundled Nord theme. Editing in this view mutates the same `FileDocument` buffer as every other view (see below); switching to a different file remounts the editor rather than live-syncing content into the existing document, since the editor owns its document once mounted. Task list items render as real design-system checkboxes that toggle the item's checked state when clicked.

**Known limitation**: no WYSIWYG Markdown editor guarantees byte-for-byte round-trip on arbitrary existing Markdown. Parsing and re-serializing content the user never touched can still normalize source-level formatting that doesn't affect meaning, such as list bullet markers (`-`/`+` normalizing to `*`). This is intentional normalization, not data loss, and the accepted cases are enumerated and asserted in `packages/app/src/components/editor/markdown-round-trip.test.ts` rather than left undocumented.

### Document buffer and dirty state

Opening a file loads its contents into an in-memory `FileDocument` buffer:

- `path`: relative or canonical path within the workspace.
- `name`: file name.
- `extension`: file extension without leading dot.
- `content`: current in-memory string representation.
- `isDirty`: boolean indicating whether unsaved edits exist in the buffer.

Edits made in either the Raw view or the Enriched view (such as editing a CSV cell, or typing in the Markdown WYSIWYG editor) update the in-memory document buffer and set `isDirty: true`. A small dot next to the file name in the document header breadcrumb marks unsaved edits. Invoking Save persists the current buffer string to disk via the platform's `writeFile` capability and resets `isDirty: false`.

### Unsaved changes

Leaving a dirty document asks first. Selecting another file, or opening another folder, while the buffer has unsaved edits shows a modal titled "Save changes to {file}?" with **Save**, **Don't Save**, and **Cancel**. Cancel keeps the current document open with its edits intact, and the requested navigation does not happen. Escape and a backdrop click count as Cancel.

Closing or reloading the browser tab while the buffer is dirty triggers the browser's own unload warning. Vista cannot customize that prompt's text.

## Platform capability contract

The shared application consumes workspace operations via `WorkspaceCapability` injected in `AppAdapter`:

```ts
export interface WorkspaceCapability {
  readonly isSupported: boolean;
  openFolder(): Promise<Workspace | null>;
  restoreFolder(options: { interactive: boolean }): Promise<RestoreFolderResult>;
  readTree(workspace: Workspace): Promise<WorkspaceNode[]>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  createFile(path: string): Promise<void>;
  createDirectory(path: string): Promise<void>;
  move(fromPath: string, toPath: string): Promise<void>;
  remove(path: string): Promise<void>;
}

export type RestoreFolderResult = { status: "restored"; workspace: Workspace } | { status: "needs-permission"; name: string } | { status: "unavailable"; name: string } | { status: "none" };
```

`restoreFolder({ interactive: true })` MUST only be called from a user gesture such as a click handler. With `interactive: false` the host never prompts. See [Reopening the last folder](#reopening-the-last-folder).

### Platform-specific implementations

1. **Web (`apps/web`)**:
   - **Primary direct-disk mode**: Uses the File System Access API (`window.showDirectoryPicker({ mode: "read" })`) in Chromium-based browsers (Chrome, Edge, Opera) for live in-place read access to local folders. Requesting read-only access up front keeps folder-open to a single native picker interaction. Write access is requested lazily, the first time a file is saved (`FileSystemDirectoryHandle.requestPermission({ mode: "readwrite" })`), so the second, easy-to-miss permission prompt fires in direct response to the user's own Save action instead of immediately after the folder picker. Every subsequent read or write re-checks the handle's current permission (`queryPermission`) and re-requests it if it was revoked, rather than assuming a previously granted handle stays valid for the life of the session.
   - **Universal directory fallback**: In browsers that do not support the File System Access API (such as Firefox and Safari) or restricted environments (such as non-secure origins or cross-origin iframes), automatically falls back to `<input type="file" webkitdirectory />`. This allows any browser to select local folders and explore/edit their file tree in-memory with file export capabilities. A workspace opened this way reports `accessMode: "fallback"` on its `Workspace` entity (see [Workspace lifecycle](#workspace-lifecycle)); the application surfaces a one-time notice that saves will download a file instead of writing in place.
   - **Performance filtering**: Automatically excludes heavy dependency and version-control folders (`.git`, `node_modules`, `.DS_Store`, etc.) from tree traversal to maintain instantaneous loading.
   - **Remembered folder**: the directory handle is stored in IndexedDB (database `vista`, store `workspace`, key `lastFolder`). Fallback-mode folders are never stored (see [Reopening the last folder](#reopening-the-last-folder)).
2. **Native (`apps/native`)**:
   - Uses Tauri's dialog plugin (`@tauri-apps/plugin-dialog`) for native directory selection.
   - Uses Tauri's filesystem plugin (`@tauri-apps/plugin-fs`) for directory enumeration and file I/O, filtering heavy folders identically.
   - Persists the granted folder scope with `tauri-plugin-persisted-scope` so a remembered folder can be reopened after restart. The root path is stored in `localStorage` under `vista.lastFolder`.
   - Always direct-disk (`accessMode` is omitted, meaning `"direct"`); there is no fallback mode on native hosts.

### Observable failure behavior

Workspace operations do not fail silently. A user-initiated cancellation of the folder picker (the platform picker's own Cancel/Escape) resolves `openFolder()` to `null` with no error and no user-visible message — this is expected, ordinary behavior, not a failure. Any other failure — permission denied or revoked, a file or folder that no longer exists, an unreadable/unwritable path — rejects with a descriptive `Error` and is surfaced to the user as a toast message (`packages/app/src/components/feedback/toast.tsx`), not just logged to the console. This applies to every `WorkspaceCapability` operation, including the file management operations below.

## File and folder management

Users create, rename/move, and delete files and folders from a right-click context menu on the sidebar file tree (right-clicking empty space targets the workspace root). Renaming is implemented as `move` within the same parent directory — there is no separate rename operation, matching VS Code's own model.

- **Delete confirmation**: choosing "Delete" opens a modal dialog titled `Delete "{name}"?` with **Cancel** and **Delete** buttons, and nothing is removed until Delete is confirmed. The message warns that a folder's contents are deleted with it. The dialog is a native `<dialog>`, so Escape cancels it.

- **Validation**: candidate names are validated client-side before any disk operation, via `validateEntryName` (`packages/app/src/domain/path-validation.ts`). Rejected: empty or whitespace-padded names, the reserved names `.` and `..`, a trailing period, the characters `" * / : < > ? \ |` and ASCII control characters (disallowed universally rather than per-platform, since a name valid only on one OS could break when a workspace is later opened on another), and a case-insensitive collision with an existing sibling in the same directory.
- **Active document handling**: renaming the open file updates its path and name in place, without re-reading the file from disk (the bytes did not change). Deleting the open file, or a directory that contains it, clears the editor and shows a toast explaining why.
- **Tree refresh**: every create, move, or delete is followed by a full `readTree` re-scan rather than a local, incremental tree edit — the only tree-construction logic lives in each platform adapter (per [Platform adapters](../architecture.md#platform-adapters)), so the shared UI does not duplicate it.
- **Platform-specific move semantics**: the File System Access API has no native move or rename, so the web host implements `move` as a recursive copy followed by a delete of the source. This is **not atomic**: on a failure partway through, the source is left in place (never deleted before the copy fully succeeds) and the error propagates to the user rather than silently losing data. The native host uses `@tauri-apps/plugin-fs`'s `rename`, which is atomic; because `rename` silently replaces an existing destination rather than failing, the native adapter explicitly checks for a destination collision first to honor the same "throws on collision" contract as the web host.
- **Fallback mode**: on the web host's non-FSA fallback (see [Platform-specific implementations](#platform-specific-implementations)), file management operates entirely on the in-memory tree and file map — there is no real disk backing to mutate, consistent with how `writeFile` already behaves in that mode.

## Theming and presentation

The application integrates `@codenhub/theme` and `@codenhub/styles`:

- Supports light and dark modes via `@codenhub/theme`.
- The default colors defined by `@codenhub/styles` via `light-dark()` are preserved without overriding custom palettes.
- Icons use `@codenhub/icons` in Vite SVG mode (`<i className="ic-..." aria-hidden="true" />`).
