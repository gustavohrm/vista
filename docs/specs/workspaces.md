---
status: IMPLEMENTED
last_updated: 2026-11-11
scope: Local folder workspaces, file tree representation, document view modes, and persistence across hosts.
---

# Workspaces and document management

This specification covers how Vista manages local folder workspaces, file tree representations, document view modes (`raw` vs `enriched`), and explicit persistence across platform hosts.

## Core philosophy

Vista is an Obsidian-, Notion-, and VS Code-inspired personal workspace application that operates directly on user-selected local folders:

- **Local-first, direct disk access**: No proprietary database, shadow sync sandbox, or browser-isolated storage is used as a surrogate for user files.
- **Explicit saving**: Changes are saved only when the user explicitly triggers save (via `Ctrl+S`, `Cmd+S`, or the icon-only Save button in the document header). There is no automatic, background saving in v1. Navigating away from unsaved changes asks the user first, as [Unsaved changes](#unsaved-changes) describes, so edits are never discarded silently.
- **Dual-view paradigm**: Every supported file can be inspected and edited as raw text or rendered in an enriched presentation.

## Workspace lifecycle

In v1, Vista operates on **one active open folder** at a time:

- Users open a directory using the platform's native file picker (`window.showDirectoryPicker` on web; `@tauri-apps/plugin-dialog` on native).
- Opening a directory yields a `Workspace` entity (`id`, `name`, `rootPath`, and an optional `accessMode` distinguishing direct disk access from a more limited fallback, which [Platform-specific implementations](#platform-specific-implementations) details).
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
| `.txt` | Plain-text editor          | None; plain text has only the raw view                                          |
| `.md`  | Plain-text Markdown editor | WYSIWYG editable rendering (Milkdown), styled against `@codenhub/styles` tokens |
| `.csv` | Plain-text CSV editor      | Interactive data table with in-place cell editing                               |

Future versions will expand to `.json`, `.yaml`, canvas representations, and embedded graph links.

### Markdown WYSIWYG editing

The Enriched view for `.md`/`.markdown` files (`packages/app/src/components/editor/markdown-editor.tsx`) is a WYSIWYG editor built on [Milkdown](https://milkdown.dev/), using its CommonMark and GFM presets (headings, emphasis, lists, links, code blocks, blockquotes, tables, task lists, strikethrough) with a minimal custom theme styled directly against `@codenhub/styles` tokens rather than Milkdown's bundled Nord theme. Editing in this view mutates the same `FileDocument` buffer as every other view ([Document buffer and dirty state](#document-buffer-and-dirty-state) describes it); each tab gets its own editor instance, and switching tabs remounts it rather than live-syncing content into an existing document, since the editor owns its document once mounted. Task list items render as real design-system checkboxes that toggle the item's checked state when clicked.

**Images.** An image's source resolves from the Markdown file's folder, or from the workspace root when it starts with `/`. Percent escapes such as `%20` are decoded, and a query or fragment is dropped. The file is read through the platform's `readBinary` capability and shown through a `blob:` URL, typed by its extension so SVG works; the URLs are revoked when the editor closes. The Markdown text is never rewritten. A path that climbs out of the workspace with `..`, a Windows drive path, and any scheme other than `http`, `https`, and `data:image/` are not loaded. Web images load in the browser, but the desktop app's content security policy blocks them. An image that is missing, unreadable, or blocked shows a placeholder with its alt text, or its path when it has none. Pasting or dropping images, an image viewer for image files, and a size limit are not built.

**Known limitation**: no WYSIWYG Markdown editor guarantees byte-for-byte round-trip on arbitrary existing Markdown. Parsing and re-serializing content the user never touched can still normalize source-level formatting that doesn't affect meaning, such as list bullet markers (`-`/`+` normalizing to `*`). This is intentional normalization, not data loss, and the accepted cases are enumerated and asserted in `packages/app/src/components/editor/markdown-round-trip.test.ts` rather than left undocumented.

### Raw editor

The raw view (`packages/app/src/components/editor/raw-editor.tsx`) is a [CodeMirror 6](https://codemirror.net/) editor with line numbers, word wrap, multiple selections (`Ctrl+D`, `Ctrl+Shift+L`), and undo history. Two more options exist but are off by default: a minimap (`@replit/codemirror-minimap`) and vim keybindings (`@replit/codemirror-vim`). The defaults are line numbers on, minimap off, vim off, and word wrap on, chosen for prose and narrow screens, the common case for Markdown and plain-text notes.

- **One editor, per-tab state.** A single CodeMirror view serves every tab. Switching tabs, or switching a tab to the rendered view and back, saves that tab's editor state and restores it later, so each tab keeps its selection, scroll position, and undo history. The saved states live in `AppShell` outside the documents reducer, because they are not plain data. They are dropped when the tab closes, and renaming a file starts its tab with a fresh editor state. Keeping one view per tab hidden in the DOM was rejected, because memory and DOM size would grow with every open tab.
- **The buffer stays the source of truth.** Typing reports the full text to the documents store. When the buffer changes elsewhere, such as in the CSV table or the Markdown editor, the raw editor applies only the changed range, which keeps the cursor and undo history around it, and does not report that change back as an edit. Line endings are kept: a file containing any CRLF line break is edited with CRLF, any other file with LF, and a buffer whose line endings change, such as after a CSV table edit, rebuilds the editor state for the new ending. Text it reported that the buffer echoes back late, after newer typing, is recognized as an echo and does not undo that typing.
- **Keys.** Editing keys live in CodeMirror's keymap. App commands such as Save and Close Tab keep their shortcuts even with vim on: the editor ignores any key that matches a command shortcut. CodeMirror's own search panel and go-to-line binding (`Ctrl+Alt+G`) are removed so that the app's find bar and go-to command own those actions.
- **Cursor.** The status bar shows the cursor as `Ln {line}, Col {column}`, counted from 1, with the column in UTF-16 code units as CodeMirror counts them, followed by the selected character count when there is a selection. With vim on, it also shows the vim mode, such as `NORMAL` or `VISUAL LINE`.

### Editor settings

The gear button in the document header opens a popover with four switches: line numbers, word wrap, minimap, and vim mode. The View menu toggles the same four, and `Alt+Z` toggles word wrap. They apply to the raw editor at once and are remembered in the browser's `localStorage` under `vista.settings`, as `{ "version": 1, "editor": { "lineNumbers": true, "minimap": false, "vim": false, "wordWrap": true } }`. A stored value that is missing or of the wrong type falls back to its default, field by field, so one bad field does not reset the others. When the store can't be read, the editor starts with the defaults. When it can't be written, a changed setting still applies for the rest of the session but is lost on reload.

### Find and replace

`Ctrl+F` opens the find bar over the editor, and `Ctrl+H` opens it with the replace row. The Find button in the document header opens it too. Typing searches as you go, and the bar shows the position, such as `3 of 12`, or `No results`, or `Invalid regex`. Enter and Shift+Enter move to the next and previous match, wrapping around, and Escape closes the bar and returns focus to the document. Match case, whole word, and regular expression toggles start off each time and are not remembered.

- **Raw view.** The bar drives CodeMirror's search, so matches are highlighted in the text and the current one is selected. Replace changes the current match and moves to the next one; Replace all changes every match as one undoable edit. The search follows the active tab, so switching tabs with the bar open searches the new tab.
- **Rendered views.** Find works, but replace is hidden, since the rendered text is not the file's text. In the Markdown view, matches are highlighted in place with the CSS Custom Highlight API, which leaves the editor's DOM untouched; browsers without it still count and scroll to matches but do not highlight them. A match must lie within one run of text, so a phrase that crosses formatting, such as `**bold** text`, is not found. In the CSV table, the cells whose value matches are marked, and the current one scrolls into view.

### Go to file and line

`Ctrl+P` opens a picker that fuzzy-matches the query against every file path in the open folder, ranking matches at word starts, consecutive characters, and the file name higher. It lists at most 50 results. Arrow keys pick a result and Enter opens it. Adding `:line` or `:line:column` to the query, as in `readme:12:4`, opens the file at that position. `Ctrl+G`, or clicking the cursor position in the status bar, opens the same picker with `:` typed, so `:12` moves within the current file. Going to a position switches the tab to the raw view, since only the raw view has lines and columns. A line or column past the end moves to the last line or the end of the line.

### Status bar

With a file open, the status bar shows the cursor and vim mode (raw view only; see [Raw editor](#raw-editor)), then facts about the buffer: the line count, the size in bytes as UTF-8 (`B`, `KB`, or `MB`), the line ending (`CRLF` when the buffer contains any CRLF line break, `LF` otherwise), the format, and, for Markdown, the word count.

### Menus

A menu bar above the editor offers File, Edit, Selection, View, Go, and Help. Every item is a command, as defined in [Commands and shortcuts](../architecture.md#commands-and-shortcuts), so an item shows its shortcut and is greyed out when it can't run.

- **File**: Open Folder, New File, New Folder (at the workspace root, opening the explorer), Save, Save All, Close Tab, Close All Tabs.
- **Edit**: Undo, Redo, Cut, Copy, Paste, Find, Replace.
- **Selection**: Select All, Select Line, Add Next Occurrence, Select All Occurrences, Add Cursor Above, Add Cursor Below. All but Select All need the raw view's multiple selections, so they are disabled in the rendered views.
- **View**: Explorer, Raw Text, Word Wrap, Line Numbers, Minimap, Vim Mode, and the light or dark theme.
- **Go**: Go to File, Go to Line, Next Tab, Previous Tab.
- **Help**: Keyboard Shortcuts, a dialog listing every command with a key, and About Vista.

The menu bar is one Tab stop: ArrowLeft and ArrowRight move between menus, Enter, Space, or ArrowDown opens one, the arrow keys move within it, and Escape closes it. Clicking a menu does not take focus from the editor first, and choosing an item returns focus to where it was before running it, so Edit and Selection items apply to the editor the user was in. Undo, Redo, Cut, Copy, Paste, Select All, and the Selection items show the keys the editors handle themselves; the app does not bind those keys, so they keep working in every text field. Paste from a menu reads the clipboard with the Clipboard API, which can ask for permission; when reading fails, a toast says to press `Ctrl+V` instead.

Right-clicking opens a menu built the same way. The explorer's menu is described in [File and folder management](#file-and-folder-management), and the tab menu in [Tabs](#tabs). In the editors it offers Cut, Copy, Paste, Select All, and Find, plus Replace and Go to Line in the raw view. Shift+right-click keeps the browser's own menu, for spelling suggestions.

### Tabs

Every opened file gets its own tab, and selecting a file that is already open switches to its tab instead of reloading it. There are no preview tabs: a tab stays until the user closes it. A new tab opens to the right of the active one. Closing the active tab shows its right neighbor, or its left neighbor when it was the last tab.

- Each tab remembers its own view mode. Markdown opens in the rendered view; CSV and plain text open raw. Which views a format offers comes from the viewer registry in `packages/app/src/domain/viewers.ts`, so a later format with no raw form, such as PDF, hides the toggle.
- A tab closes from its Close button, a middle click, or the Close Tab shortcut: `Ctrl+W` on native and `Alt+W` on the web, because browsers reserve `Ctrl+W` for closing their own tab. Arrow keys move between tabs.
- Right-clicking a tab offers Close, Close Others, Close to the Right, Close Saved, Close All, and Copy Relative Path. Closing several tabs asks once about all their unsaved edits.
- Renaming a file or folder updates every open tab inside it in place. Deleting closes every open tab inside it, with an info toast naming the file or counting them.
- Tabs are keyed by workspace and path, so several workspace roots can later hold files at the same relative path.

### Document buffer and dirty state

Opening a file loads its contents into an in-memory `FileDocument` buffer, one per tab:

- `path`: relative or canonical path within the workspace.
- `name`: file name.
- `extension`: file extension without leading dot.
- `content`: current in-memory string representation.
- `isDirty`: boolean indicating whether unsaved edits exist in the buffer.

Edits made in either the Raw view or the rendered view (such as editing a CSV cell, or typing in the Markdown WYSIWYG editor) update that tab's buffer and set `isDirty: true`. A dot in the tab and next to the file name in the document header breadcrumb marks unsaved edits. Save (`Ctrl+S` or `Cmd+S`, or the Save button) writes the active tab's buffer to disk via the platform's `writeFile` capability. The tab becomes clean only if its buffer still matches what was written, so edits typed while a save is in flight stay marked unsaved.

### Unsaved changes

Unsaved edits are never discarded silently. Switching tabs or opening another file keeps every buffer as it is. Closing a tab with unsaved edits, or opening another folder while any tab has them, shows a modal titled "Save changes to {file}?" with **Save**, **Don't Save**, and **Cancel**. When several tabs have unsaved edits, one modal titled "Save changes to {n} files?" lists them and offers **Save All**. The list shows paths, so two files with the same name stay distinguishable. Edits made after the user answers, such as typing while a save is in flight, are asked about again before the action continues. Cancel, Escape, and a backdrop click keep everything open with its edits intact, and the requested action does not happen. A failed save also stops the action and shows an error toast.

Closing or reloading the browser tab while any tab has unsaved edits triggers the browser's own unload warning. Vista cannot customize that prompt's text.

## Platform capability contract

The shared application consumes workspace operations via `WorkspaceCapability` injected in `AppAdapter`:

```ts
export interface WorkspaceCapability {
  readonly isSupported: boolean;
  openFolder(): Promise<Workspace | null>;
  restoreFolder(options: { interactive: boolean }): Promise<RestoreFolderResult>;
  readTree(workspace: Workspace): Promise<WorkspaceNode[]>;
  readFile(path: string): Promise<string>;
  readBinary(path: string): Promise<Uint8Array<ArrayBuffer>>;
  writeFile(path: string, content: string): Promise<void>;
  createFile(path: string): Promise<void>;
  createDirectory(path: string): Promise<void>;
  move(fromPath: string, toPath: string): Promise<void>;
  remove(path: string): Promise<void>;
}

export type RestoreFolderResult = { status: "restored"; workspace: Workspace } | { status: "needs-permission"; name: string } | { status: "unavailable"; name: string } | { status: "none" };
```

`readBinary` returns a file's bytes, for images shown in Markdown. The web host reads the file handle, or the picked file in fallback mode; the native host uses `readFile` from `@tauri-apps/plugin-fs`, allowed by the `fs:allow-read-file` permission.

`restoreFolder({ interactive: true })` MUST only be called from a user gesture such as a click handler. With `interactive: false` the host never prompts. [Reopening the last folder](#reopening-the-last-folder) describes each host's behavior.

### Platform-specific implementations

1. **Web (`apps/web`)**:
   - **Primary direct-disk mode**: Uses the File System Access API (`window.showDirectoryPicker({ mode: "read" })`) in Chromium-based browsers (Chrome, Edge, Opera) for live in-place read access to local folders. Requesting read-only access up front keeps folder-open to a single native picker interaction. Write access is requested lazily, the first time a file is saved (`FileSystemDirectoryHandle.requestPermission({ mode: "readwrite" })`), so the second, easy-to-miss permission prompt fires in direct response to the user's own Save action instead of immediately after the folder picker. Every subsequent read or write re-checks the handle's current permission (`queryPermission`) and re-requests it if it was revoked, rather than assuming a previously granted handle stays valid for the life of the session.
   - **Universal directory fallback**: In browsers that do not support the File System Access API (such as Firefox and Safari) or restricted environments (such as non-secure origins or cross-origin iframes), automatically falls back to `<input type="file" webkitdirectory />`. This allows any browser to select local folders and explore/edit their file tree in-memory with file export capabilities. A workspace opened this way reports `accessMode: "fallback"` on its `Workspace` entity (as [Workspace lifecycle](#workspace-lifecycle) describes); the application surfaces a one-time notice that saves will download a file instead of writing in place.
   - **Performance filtering**: Automatically excludes heavy dependency and version-control folders (`.git`, `node_modules`, `.DS_Store`, etc.) from tree traversal to maintain instantaneous loading.
   - **Remembered folder**: the directory handle is stored in IndexedDB (database `vista`, store `workspace`, key `lastFolder`). Fallback-mode folders are never stored, as [Reopening the last folder](#reopening-the-last-folder) describes.
2. **Native (`apps/native`)**:
   - Uses Tauri's dialog plugin (`@tauri-apps/plugin-dialog`) for native directory selection.
   - Uses Tauri's filesystem plugin (`@tauri-apps/plugin-fs`) for directory enumeration and file I/O, filtering heavy folders identically.
   - Persists the granted folder scope with `tauri-plugin-persisted-scope` so a remembered folder can be reopened after restart. The root path is stored in `localStorage` under `vista.lastFolder`.
   - Always direct-disk (`accessMode` is omitted, meaning `"direct"`); there is no fallback mode on native hosts.

### Observable failure behavior

Workspace operations do not fail silently. A user-initiated cancellation of the folder picker (the platform picker's own Cancel/Escape) resolves `openFolder()` to `null` with no error and no user-visible message — this is expected, ordinary behavior, not a failure. Any other failure — permission denied or revoked, a file or folder that no longer exists, an unreadable/unwritable path — rejects with a descriptive `Error` and is surfaced to the user as a toast message (`packages/app/src/components/feedback/toast.tsx`), not just logged to the console. This applies to every `WorkspaceCapability` operation, including the file management operations below.

## File and folder management

Users create, rename/move, and delete files and folders from a right-click context menu on the sidebar file tree (right-clicking empty space targets the workspace root). The menu offers Open for a file, New File and New Folder for a folder or the root, Rename, Delete, and Copy Relative Path, plus Copy Path, the full path on disk, in the desktop app; the browser has no full path to copy. Renaming is implemented as `move` within the same parent directory — there is no separate rename operation, matching VS Code's own model.

- **Delete confirmation**: choosing "Delete" opens a modal dialog titled `Delete "{name}"?` with **Cancel** and **Delete** buttons, and nothing is removed until Delete is confirmed. The message warns that a folder's contents are deleted with it. When an open tab inside the deleted entry has unsaved edits, the message also warns that those edits will be lost. The dialog is a native `<dialog>`, so Escape cancels it.

- **Validation**: candidate names are validated client-side before any disk operation, via `validateEntryName` (`packages/app/src/domain/path-validation.ts`). Rejected: empty or whitespace-padded names, the reserved names `.` and `..`, a trailing period, the characters `" * / : < > ? \ |` and ASCII control characters (disallowed universally rather than per-platform, since a name valid only on one OS could break when a workspace is later opened on another), and a case-insensitive collision with an existing sibling in the same directory.
- **Active document handling**: renaming the open file updates its path and name in place, without re-reading the file from disk (the bytes did not change). Deleting the open file, or a directory that contains it, clears the editor and shows a toast explaining why.
- **Tree refresh**: every create, move, or delete is followed by a full `readTree` re-scan rather than a local, incremental tree edit — the only tree-construction logic lives in each platform adapter (per [Platform adapters](../architecture.md#platform-adapters)), so the shared UI does not duplicate it.
- **Platform-specific move semantics**: the File System Access API has no native move or rename, so the web host implements `move` as a recursive copy followed by a delete of the source. This is **not atomic**: on a failure partway through, the source is left in place (never deleted before the copy fully succeeds) and the error propagates to the user rather than silently losing data. The native host uses `@tauri-apps/plugin-fs`'s `rename`, which is atomic; because `rename` silently replaces an existing destination rather than failing, the native adapter explicitly checks for a destination collision first to honor the same "throws on collision" contract as the web host.
- **Fallback mode**: on the web host's non-FSA fallback (as [Platform-specific implementations](#platform-specific-implementations) describes), file management operates entirely on the in-memory tree and file map — there is no real disk backing to mutate, consistent with how `writeFile` already behaves in that mode.

## Theming and presentation

The application integrates `@codenhub/theme` and `@codenhub/styles`:

- Supports light and dark modes via `@codenhub/theme`.
- The default colors defined by `@codenhub/styles` via `light-dark()` are preserved without overriding custom palettes.
- Icons use `@codenhub/icons` in Vite SVG mode (`<i className="ic-..." aria-hidden="true" />`).
