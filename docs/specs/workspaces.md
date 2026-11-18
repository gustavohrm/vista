---
status: IMPLEMENTED
last_updated: 2026-11-18
scope: Workspaces of one or more local folders, the application shell, file tree representation, document view modes, and persistence across hosts.
---

# Workspaces and document management

This specification covers how Vista manages workspaces of local folders, the application shell around them, file tree representations, document view modes (`raw` vs `enriched`), and explicit persistence across platform hosts.

## Core philosophy

Vista is an Obsidian-, Notion-, and VS Code-inspired personal workspace application that operates directly on user-selected local folders:

- **Local-first, direct disk access**: No proprietary database, shadow sync sandbox, or browser-isolated storage is used as a surrogate for user files.
- **Explicit saving**: Changes are saved only when the user explicitly triggers save (via `Ctrl+S` or `Cmd+S`, or **Save** in the command palette). Vista does not save automatically or in the background. Navigating away from unsaved changes asks the user first, as [Unsaved changes](#unsaved-changes) describes, so edits are never discarded silently.
- **Dual-view paradigm**: Every supported file can be inspected and edited as raw text or rendered in an enriched presentation.
- **One home per action**: every action has exactly one visible place in the interface. Shortcuts, the command palette, and right-click menus mirror that place with the same label and the same result, and so does a list in Settings for adding to that list, since the list is where the user looks for it; a mirror never does something its home does not, and no action has two homes. Two controls that look like they might differ make the user wonder whether they do, which is the doubt this rule exists to remove.

## Workspaces

A workspace is one or more folders, plus a name, an icon, a colour, and a session that remembers its open tabs. Every open folder belongs to a workspace: there is no separate "folder mode", so the user never has to wonder whether a workspace must be created first. The start screen says this in one sentence before anything is opened: `A workspace is one or more folders. Vista remembers its tabs and its look; your files stay where they are.`

A workspace has no settings of its own, only its details: the name, icon, colour, folders, and where the details are kept, which its page in [Settings](#workspaces-in-settings) edits. Settings stay global, because a workspace value overriding a global one would leave the user asking which of the two applies. This can be revisited once a setting has a concrete reason to differ per workspace.

### Opening a folder

**Open Folder** and [New Workspace](#creating-a-workspace) start a workspace. Open Folder opens the workspace that is exactly that folder, creating it if needed:

1. When the folder holds a readable `.vista/workspace.json`, the workspace it describes opens, as [Where a workspace's details live](#where-a-workspaces-details-live) describes. When this device has no workspace stored in that folder yet, but has one that is exactly the folder, that one takes the file's details, keeping its session, so the folder is not listed twice.
2. Otherwise, when a workspace on this device has that folder as its only folder, that workspace opens, so opening the same folder twice never creates a duplicate.
3. Otherwise, a new workspace is created holding just that folder, named after it, and opens.

A workspace with several folders grows from there with **Add Folder to Workspace…**.

Users pick folders with the platform's native picker (`window.showDirectoryPicker` on web; `@tauri-apps/plugin-dialog` on native). Each picked folder is a `WorkspaceFolder` (`id`, `name`, `rootPath`, and an optional `accessMode` distinguishing direct disk access from a more limited fallback, which [Platform-specific implementations](#platform-specific-implementations) details). Its `id` is stable across restarts, because saved workspaces refer to their folders by it.

Each folder's tree is scanned and mapped into hierarchical `WorkspaceNode` models (`file` and `directory` nodes). Directories start collapsed, and empty folders show no children. A folder inside the tree that the host cannot list, such as one the user has no permission to read, is still shown, with an alert icon and the tooltip and accessible name `Vista can't read this folder, so its files aren't listed`, so its files are never missing without a reason. A workspace folder that cannot be read at all does not fail the workspace: its root row says why and what to do, as [File and folder management](#file-and-folder-management) describes, and the other folders work normally.

### Creating a workspace

**New Workspace…**, the plus button of the **Workspaces** group in [Settings' navigation](#workspaces-in-settings), always creates a new workspace, even from a folder that already is one. It asks for the first folder with the native picker, creates a workspace on the device holding just that folder and named after it, and shows its page in Settings, where it can be renamed and given more folders. It does not open the workspace, since opening would close the current workspace's tabs; the page's **Open** does that when the user is ready. Cancelling the picker creates nothing. A folder picked with the web fallback makes a workspace that lasts for the session only, as Open Folder's does.

Open Folder was once the only way to start a workspace, because a New Workspace dialog looked like a second way to reach the same result. It is not the same result: Open Folder on a folder that is already a workspace opens that workspace, so a second workspace starting from the same folder, such as a Work workspace of `notes` and `projects` beside the plain `notes` one, could only be made by reshaping the first.

### Folder rules

- **Folders may not overlap.** Adding `C:\notes\work` to a workspace that has `C:\notes`, or the reverse, is refused with `"{name}" is already part of this workspace, inside "{other}".` or `"{name}" contains "{other}", which is already part of this workspace.` Overlapping folders would show the same file twice and open it in two tabs, and saving one tab would overwrite the other's edits. Adding a folder that is already in the workspace is refused too. Hosts compare folders with `relate`, as [Platform capability contract](#platform-capability-contract) describes.
- **A folder may belong to several workspaces**, such as a shared `notes` folder in both a Work and a Personal workspace. The workspaces do not share sessions.
- **Removing a folder from a workspace, or deleting a workspace, never touches the disk.** Both confirmations say so: `Your folders and files aren't changed.`
- **Files do not move between folders.** Renaming and moving work within one folder. Dragging an entry onto another workspace folder shows `Moving between folders isn't supported yet.` and moves nothing. A move across folders needs a host operation that copies between two folders, which the contract does not have yet; it is a later change, not a limitation to work around.

### Where a workspace's details live

Each workspace keeps its details in exactly one place, chosen on its page in [Settings](#workspaces-in-settings), so there is never a copy in two places to disagree:

- **On this device** (the default). Vista keeps the details in its own storage, and nothing is written into the folders. Read access to the folders is enough.
- **In the folder.** Vista writes `.vista/workspace.json` into the workspace's first folder, its _home folder_. The details then travel with the folder: a sync client or a git repository carries them to another device, and opening the home folder there opens the same workspace.

`.vista/workspace.json` holds the name, icon, colour, and the other folders' locations relative to the home folder:

```json
{ "version": 1, "name": "Research", "icon": "book-open", "color": "indigo", "folders": [".", "../sources"] }
```

- **The session never goes in the file.** Open tabs change constantly; writing them into a synced folder would churn the sync client or git, and two devices would overwrite each other's tabs. Sessions always stay on the device, as [Sessions](#sessions) describes.
- **Locations are relative to the home folder**, so the file stays valid when the whole tree moves or syncs to a device with a different user folder. Hosts work out each location with `relativeLocation`. The browser can only do that for a folder inside the home folder; for any other folder it writes `../{name}`, since folders kept side by side are the usual layout, and a desktop that finds nothing there shows the folder as missing with **Locate…**. A desktop that finds an unrelated folder of that name there opens it as that folder; the guess is kept anyway, because the result shows by its name and files and a wrong folder is only read, never changed on its own. Two folders that would share a location can't both be recorded, since reading the file back would keep one: choosing _In the folder_ then keeps the details on the device, with an info toast `Two folders named "{name}" would both be recorded as "{location}", so the details stay on this device.`, and adding such a folder to a workspace stored in its folder is refused with `"{name}" would be recorded as "{location}", like another folder of this workspace, so it can't be added while the details are stored in "{home}".` The desktop app finds the other folders with `resolveRelative`. The browser cannot turn a relative location into a folder, so on the web each extra folder is picked once per device; the picker asks for it by name, and a picked folder whose name differs is refused with `Pick the folder named "{name}".` A folder that is not found shows on its root row as missing.
- **The web asks for write access when this option is chosen**, because writing the file needs it. The prompt answers the user's own choice, so it is not a surprise.
- **A file Vista can't use is never overwritten.** When `.vista/workspace.json` is not valid JSON, its `version` is newer than this Vista understands, or it is larger than **Largest file to open** in [Settings](#settings), the folder opens as a plain one-folder workspace on the device, and an info toast says `"{name}" has workspace details this version of Vista can't read, so it opened as a plain folder.` The file stays as it is. A valid file with a bad field, such as an unknown icon, keeps its other fields, as stored settings do.
- **The file is read each time the workspace opens**, so a change made on another device shows. A folder the file no longer lists leaves the workspace, and its host forgets it once no workspace uses it; a folder the file still lists but this device didn't find stays remembered. Vista writes it only after reading it, or when the user first chooses _In the folder_, so a file it hasn't seen is never written over. A home folder that waits for permission on the web is read once **Allow access** is clicked, which opens the workspace again from the file.
- **A file that is gone keeps the workspace on the device.** When the home folder reopens without `.vista/workspace.json`, the workspace switches to _On this device_ with the details it last had, and an info toast says `"{home}/.vista/workspace.json" is gone, so the workspace's details are kept on this device now.`
- **Choosing _On this device_ for a workspace whose details are in the folder deletes the file**, and an empty `.vista` folder with it, after a confirmation that names the file. Leaving it would keep a second copy that opening the folder elsewhere would still use.
- **The home folder can't be removed while the details live in it.** The dialog says `The workspace's details are stored in this folder. Store them on this device first.` Moving the file to another folder on its own would put it somewhere the user did not choose.
- **Another workspace's file is replaced only when the user says so.** Choosing _In the folder_ for a workspace whose home folder already holds a `.vista/workspace.json` it has not read, such as one [New Workspace](#creating-a-workspace) made from a folder that is already a workspace, asks first: `"{home}" already holds the details of "{other}"`, saying `Replacing them changes that workspace on every device that opens this folder. On this device, "{other}" keeps its details here.`, with **Keep on This Device** and a destructive **Replace**. `{other}` is the name the file holds. Keep on This Device, Escape, or a click outside writes nothing and leaves the details on the device. Replace writes this workspace's details over the file, and a workspace on this device that was stored in that folder switches to _On this device_ with the details it last had, since two workspaces reading one file would become copies of each other. A file Vista can't read is never replaced, since it may hold details a newer Vista wrote: the details stay on the device, with an info toast `"{home}" holds workspace details this version of Vista can't read, so these stay on this device.` Taking on the file's details instead was rejected: the new workspace would become a copy of the one the file describes, which Open Folder on that folder already opens.
- `.vista` is hidden from the explorer, like `.git`.

### Sessions

Each workspace has a session on the device: its open tabs in order, the active tab, each tab's view mode, and the expanded folders. Opening a workspace restores its session. A tab's file is read when its tab is first shown, not all at once. A tab whose file no longer exists is dropped, and one info toast names it, or counts them: `3 files from your last session no longer exist.`

Unsaved edits are not part of a session. Leaving a workspace asks about them first, as [Unsaved changes](#unsaved-changes) describes.

### Switching workspaces

A window shows one workspace at a time. Switching closes the current workspace's tabs, after asking about unsaved edits, saves its session, and opens the next workspace with its own session.

### Workspace switcher

The switcher at the top left of the title bar is the home for switching, opening, and closing workspaces; [Settings](#workspaces-in-settings) is the home for creating, editing, and deleting them. Its button shows the current workspace's icon and name; with none open it shows `No workspace` beside an empty dashed tile, so another workspace is a click away from anywhere, including the start screen. While a workspace is still being opened or reopened at start, the button and the command palette's **Open Folder…** are unavailable, so a workspace opened meanwhile is not replaced when that finishes.

Choosing the button turns it into a search field, `Search workspaces`, in its place, with a list below it. With the field empty, the list holds:

- The [recent workspaces](#recent-workspaces), each with its icon tile in its colour and its name, the current one checked. Choosing one switches to it. The folders are not repeated here: for a one-folder workspace the name usually is the folder's, and Settings lists them.
- Then, in one group, **Open Folder…**, as [Opening a folder](#opening-a-folder) describes, and **Close Workspace** while a workspace is open. The two are together because each changes which workspace is open.

Typing searches every workspace by name, not only the recent ones, so a workspace is a few keys away however many there are: the recent ones that match come first, as they are listed, then the others by name. The actions stay in the list while their labels match. The arrow keys pick an entry, Enter chooses it, and Escape, Tab, or a click elsewhere turns the field back into the button.

Every workspace's row, the current one's too, has a **Settings** button with the adjustments icon at its right end, shown as the pointer rests on the row or the keyboard picks it, which opens that workspace's page in Settings; `Ctrl+,`, Settings' own shortcut, does the same for the picked row. A row of a recent workspace but the current one also has **Remove from Recent**, as Recent workspaces describes. The menu once had a **Workspace Settings…** item, which reached only the current workspace's page; the row's button reaches any workspace's. The command palette keeps **Workspace Settings…** for the current one.

**Close Workspace** closes the current workspace's tabs after asking about unsaved edits, as switching does, saves its session, and shows the start screen. Reopening the workspace brings its tabs back. A closed workspace is not reopened at the next start, which shows the start screen instead. Closing does not forget the workspace: **Delete Workspace…** in Settings does that.

The menu once listed every workspace, which grew past reading at a glance with dozens, and had a **Remove from Recent…** item that turned it into a list of workspaces to forget. That item read as removing the current workspace, and it forgot a workspace for good under a name that says it only leaves a list. Each row's own Remove from Recent and a workspace's **Delete Workspace…** in Settings replace it, so each control does one thing.

Adding a folder to the current workspace is not in this menu: it is a change to the open workspace's contents, so its home is the **Add Folder to Workspace** button in the explorer's header. The command palette and the folder list on the current workspace's page in [Settings](#workspaces-in-settings) mirror it as **Add Folder to Workspace…**.

### Recent workspaces

The switcher and the start screen list the same recent workspaces: the five most recently opened, newest first, leaving out any removed from Recent. Five keeps both lists readable at a glance; [Settings](#workspaces-in-settings) lists every workspace.

**Remove from Recent** is an X button at the right end of each row, shown in the switcher as the pointer rests on the row or the keyboard highlights it, and always on the start screen; in the switcher, `Shift+Delete` does the same for the highlighted row, since `Delete` alone edits the search field, and browsers take out a suggestion the same way. A workspace that typing finds but that is not in Recent has no X. It takes the workspace out of the list without forgetting it: nothing is asked, since nothing is lost, the menu stays open, and the next most recent workspace moves up into the five. Opening the workspace again, from anywhere, puts it back at the top. The open workspace has no X: it is the most recent, and it would come back the next time it opens. The button belongs to the row, so it shows wherever the row does, in both lists.

A switch on each workspace to keep it out of Recent for good, and one in Settings to turn Recent off, were weighed and left out. Remove from Recent already keeps a workspace out until it is opened again, which is when the user wants it back, and without Recent the start screen would reach a workspace only through Open Folder or Settings.

### Workspaces in Settings

[Settings](#settings) is the home for creating, editing, and deleting workspaces. Being in Settings, they are reachable with no workspace open, from the start screen's **Settings**, which matters for a workspace whose folders are all gone and so can't be opened.

The first group of Settings' navigation is **Workspaces**, with **Search Workspaces** and **New Workspace** as buttons at the right end of the group's label, New Workspace as [Creating a workspace](#creating-a-workspace) describes; below `md`, where the navigation is a row across the top and group labels are hidden, the two buttons start the row. The workspaces are items of the group, sorted by name, since with dozens a name is easier to find in order than a date: its icon tile in its colour and its name, with a small dot at the right end for the open workspace, and the tile and name faded when none of its folders is found. Choosing an item shows the workspace's page. A screen reader hears `Open` or `Not found` as the item's description. The tile's icon is 12 pixels on its 20, as in the switcher and on the start screen.

The group lists the first eight workspaces. Below them, **Show {n} more** lists up to four more; once twelve are listed, **See all** takes its place. The open workspace and the one whose page shows are always listed, in their place by name, even past the cap, so the item of the page in view never disappears. See All lists every workspace in place of Vista's sections, and the heading becomes **Settings › Workspaces**: choosing a workspace there shows its page beside the list, which stays for browsing, and choosing **Settings** in the heading brings the sections back. Closing Settings forgets both See All and Show More. Eight and twelve keep the group short enough that Vista's sections stay in view below it on a laptop screen.

**Search Workspaces** swaps the group's label for a field, and its button for **Close Search**. The field lists every workspace whose name holds the text, uncapped, since searching is how a workspace past the cap is found, and says `No matching workspaces` when none does. Close Search, or Escape in the field, ends the search and lists the workspaces as before; Escape there does not close Settings. Only names are searched: a folder's name would find a workspace for a reason its item doesn't show.

Resting the pointer on an item, or reaching it with the keyboard, shows its folders in a popover beside it, below it in the row across the top, one per line with `Needs access` or `Not found` after a folder that can't be reached. It shows for a workspace with more than one folder, and for one whose single folder is named unlike the workspace or can't be reached, since two workspaces may share a name or a folder and this is where they are told apart; it doesn't show for a workspace that is just its folder, nor for the item whose page already shows, since the page lists the folders. Escape, scrolling, or leaving the item hides it. On touch, with no pointer to rest, the folders show on the page.

Settings once had a **Workspace** group holding one **Workspaces** item, whose page listed every workspace as a row with its folders and status, and the switcher and the command palette had **Manage Workspaces…** to reach it. That was three steps named alike to reach one workspace's page: the group, the item, and the list. Listing the workspaces in the navigation reaches a page in one click and drops the list page and Manage Workspaces, at a cost weighed then: the navigation grows with the number of workspaces, which the cap, See All, and Search keep in hand, and the folders and status a row showed at a glance moved into the popover, the dot, and the fade.

A workspace's page starts with the workspace's tile and name as its heading, with **Open** at the heading's right end while it is not the open workspace. Open opens it, as choosing it in the switcher does, and closes Settings, so the workspace the user asked for shows. Its lead says that these apply to this workspace only, and that Vista's own settings apply to every workspace. **Workspace Settings…** opens the current workspace's page directly.

Every workspace's page can be edited, open or not, and every change applies at once; a workspace that is not open is changed without opening it, so the open workspace's tabs are not touched. A workspace kept on the device saves each change on the device. A workspace kept in its folder writes each change to its `.vista/workspace.json`, which Vista writes only after reading it, so its page first reads the file, as opening the workspace would, and shows the details as read. While its home folder waits for permission on the web, the page shows **Allow access** above the fields, which asks for it, and the fields are disabled until then; while the home folder is not found, they are disabled, with `"{home}" isn't found, so the details kept in it can't be changed.` When the home folder holds a `.vista/workspace.json` this version of Vista can't read, they are disabled too, with `"{home}" holds workspace details this version of Vista can't read, so they can't be changed here.`, since a file Vista can't read is never replaced. Its **Delete Workspace…** stays available either way. A page that only showed a workspace's details, to be edited after opening it, was rejected: choosing a workspace in Settings reads as opening its options, and opening it would close the current workspace's tabs.

The page holds:

- **Name**, **Icon** from a fixed set, and **Colour** from the design-system palette or the system colour picker. The icons are `folder` (the default), `book-open`, `notebook-pen`, `briefcase`, `code`, `house`, `star`, `heart`, `flask-conical`, `graduation-cap`, `pen-line`, and `globe`; they are a fixed set because an `ic-*` class must appear literally in the code to render. The colours are the palette's hues: `neutral` (the default), `indigo`, `emerald`, `amber`, and `rose`, then a last swatch, showing every hue, that opens the system colour picker; a picked colour is stored as `#rrggbb` in lowercase and shades the icon toward black on light themes and toward white on dark ones, as the palette's steps do, then caps its lightness on light themes and floors it on dark ones, so even white or black keeps at least 3:1 contrast against the surface. The workspace takes a picked colour once the picker commits it, not on every step of a drag, so moving across the picker doesn't rewrite `.vista/workspace.json` each time. A colour Vista doesn't know reads as `neutral`, and the other details are kept. A name is trimmed, may not be empty, and is at most 80 characters.
- **Folders**: the list, with a plus button in its heading's row, **Add Folder to Workspace**, mirroring the explorer's button, and a remove button per folder. [Folder rules](#folder-rules) apply.
- **Where its details are kept**: _On this device_ or _In {home folder}/.vista_, as [Where a workspace's details live](#where-a-workspaces-details-live) describes. The choice is shown only when there is one: for a folder Vista can't write to, the details can only stay on the device, so a choice of one would ask nothing; and while the home folder waits for permission or is missing, neither choice can be carried out, since each one writes or deletes its file.
- **Delete Workspace…**, last, in its own group. It asks first, `Delete "{name}"?`, saying `Vista forgets this workspace and its tabs. Your folders and files aren't changed.`, then forgets the workspace and its session and shows the next workspace's page by name, the one before it when it was last, or Appearance when none is left. Deleting the open workspace closes it first, asking about unsaved edits as **Close Workspace** does. A workspace kept in its folder leaves its `.vista/workspace.json` in place, since deleting never touches the disk, so opening that folder again brings the workspace back from it.

Workspaces were weighed as a place in the left rail, below Explorer, and rejected: the rail shows only while a workspace is open, so they would be out of reach from the start screen, and the rail's places, Explorer, Search, and Graph, all look inside the open workspace rather than across workspaces.

### Reopening at startup

Vista remembers every workspace and the one used last, unless it was closed. At startup, the last workspace reopens when every one of its folders can be reopened without asking; otherwise the start screen lists the recent workspaces. Hosts restore each folder with `restoreFolder`, which reports `restored`, `needs-permission`, `unavailable` (remembered but gone or inaccessible), or `none` (nothing remembered). Per-host behavior:

- **Web (File System Access)**: each folder's `FileSystemDirectoryHandle` is stored in IndexedDB (database `vista`, store `folders`, keyed by folder id). A folder reopens silently only when the browser already reports read permission as granted, for example after the user chose "Allow on every visit". Otherwise its workspace in the recent list says `Click to allow access`; clicking it requests permission, which needs a user gesture, so a restore never prompts on its own. Whether one click can grant access to several folders is checked by hand, as [Tests](tests.md) records; when it cannot, the start screen lists each folder that still needs access with its own button.
- **Web fallback (`webkitdirectory`)**: these folders cannot be remembered, so a workspace holding one lasts for the session only, and _In the folder_ is not offered for it, since nothing can be written. The one-time fallback notice says so. Such a folder can't be added to a workspace Vista remembers, which would try to reopen it on the next start; the error toast says `This browser can open "{name}" only until Vista closes, so it can't join a workspace Vista remembers.`
- **Native**: each folder's path is stored in the webview's `localStorage` under `vista.folders`, keyed by folder id, and probed with a directory read and a check two levels down, so a folder remembered with access to its direct children only, as the picker granted in 0.0.2 and earlier, reports `unavailable` and is picked again rather than failing to read its workspace file. Access survives restarts because the scope granted by the folder picker is persisted by `tauri-plugin-persisted-scope`, registered after the filesystem plugin; without it, dialog-granted scope would not survive a restart.
- **Mobile (Android and iOS)**: not supported yet. `@tauri-apps/plugin-dialog` has no folder picker on those platforms, so there is nothing to restore.

Failure handling: a folder that no longer exists or is inaccessible stays in its workspace, marked missing on its root row, so the user decides whether to remove it; a workspace is never edited behind the user's back. Unexpected failures surface as error toasts.

### Stored workspace data

The shared app stores workspaces and sessions in `localStorage`, beside `vista.settings`:

- `vista.workspaces`: `{ "version": 1, "lastWorkspaceId": "…", "workspaces": [{ "id", "name", "icon", "color", "folderIds": [], "storage": "device" | "folder", "locations": { "{location}": "{folderId}" }, "lastOpenedAt", "hiddenFromRecent" }] }`. `hiddenFromRecent` is `true` once the workspace is removed from [Recent](#recent-workspaces), and absent otherwise; opening the workspace removes it. A workspace stored in its folder keeps a copy of its name, icon, and colour here too, so the recent list can show it while its folder still waits for permission; the file's values replace the copy each time it is read. Its `locations` say which folder on this device each location in the file is, since the same file names folders that are picked separately on each device; `folderIds` lists the ones found, in the file's order, and a location with no folder yet shows on its own root row with **Locate…**. `locations` is absent for a workspace stored on the device.
- `vista.session.{workspaceId}`: `{ "version": 1, "tabs": [{ "folderId", "path", "viewMode" }], "activeIndex", "expanded": { "{folderId}": ["path"] } }`.

A list Vista can only partly read, such as one that is not valid JSON or holds a workspace without folders, is copied to `vista.workspaces.damaged` before Vista first saves over it, and is not saved over when the copy can't be written. A stored value that is missing, of the wrong type, or out of range falls back field by field, as [Editor settings](#editor-settings) describes for settings, so one bad field does not lose a workspace. When the store can't be read, Vista starts with no remembered workspaces; when it can't be written, the current session still works but is not remembered.

**Migration.** The `v0.0.1` release remembered a single folder instead of workspaces. At the first start of a build with workspaces, the folder it remembered (IndexedDB key `lastFolder` in store `workspace` on web, `localStorage` key `vista.lastFolder` on native) becomes a one-folder workspace on the device, and the old key is removed. Each host moves that folder into its new store under the id `last-folder` (`LEGACY_FOLDER_ID`), which the shared app restores once, before any workspace is stored. A folder that is already gone is forgotten instead, with the info toast `Couldn't reopen "{name}". It may have been moved or deleted.`, since a workspace for it could never open.

## Supported formats & view modes

Vista opens `.txt`, `.md` (and `.markdown`), and `.csv` files:

| Format             | Raw View                   | Enriched View                                                                     |
| :----------------- | :------------------------- | :-------------------------------------------------------------------------------- |
| `.txt`             | Plain-text editor          | None; plain text has only the raw view                                            |
| `.md`, `.markdown` | Plain-text Markdown editor | WYSIWYG editable rendering (Milkdown), styled against `@codenhub/styles` tokens   |
| `.csv`             | Plain-text CSV editor      | Interactive data table with in-place cell editing; the first record is the header |

Other formats are planned, as the [roadmap](../roadmap.md) records.

### CSV table

The table shows a file of at most 10,000 cells, counted as the widest record's fields times the records, since every row takes the widest record's columns (`MAX_TABLE_CELLS` in `packages/app/src/domain/csv.ts`). It draws one input per cell, and opening a larger file in it keeps the window from responding for too long, so a larger file opens in the raw view, with no view switch, and the status bar notes **Raw only** with a tooltip that says why. The limit is a constant, not a setting: it protects the window, and the raw view already edits the file in full. A tab whose file grows past it, on disk or through the raw view, stays in or returns to the raw view; one that shrinks below it gets the switch back.

The table treats the first record as the header: its cells are the column names, edited in place like any other cell, and the rows below are numbered from 1. A line break at the end of the file ends the last record rather than starting an empty one, so the table shows no empty row for it, and the table writes the file back with that final line break and with the file's own line breaks and field separator, such as `;` or a tab. **Add column**, a plus at the end of the header, adds an empty column after the last one; **Add row**, under the table, adds an empty row after the last one, so each control sits where its result appears. Cells use the interface's 13px text, as in a spreadsheet, not the document's reading size. A row moves by dragging its number, which turns into a grip on hover: the row follows the pointer up and down the table and the rows it passes slide aside, as tabs do, and Escape puts it back; with the number focused, Shift+Up and Shift+Down move it one place. The header stays the first record. The table sits 6px from the frame's left edge, in line with the first tab, and 6px below the tabs, the same gap the tabs keep from the frame's edge; it takes a control's 6px corner rather than the package's larger surface corner.

### Markdown WYSIWYG editing

The Enriched view for `.md`/`.markdown` files (`packages/app/src/components/editor/markdown-editor.tsx`) is a WYSIWYG editor built on [Milkdown](https://milkdown.dev/), using its CommonMark and GFM presets (headings, emphasis, lists, links, code blocks, blockquotes, tables, task lists, strikethrough) with a minimal custom theme styled directly against `@codenhub/styles` tokens rather than Milkdown's bundled Nord theme. Editing in this view mutates the same `FileDocument` buffer as every other view ([Document buffer and dirty state](#document-buffer-and-dirty-state) describes it); each tab gets its own editor instance, and switching tabs remounts it rather than live-syncing content into an existing document, since the editor owns its document once mounted. Task list items render as real design-system checkboxes that toggle the item's checked state when clicked. The document reads as a page: a 700px column of 16px text at a 1.65 line height, starting 56px below the tabs; `h1` is 32px bold without an underline, `h2` 20px, `h3` 17px, all tighter than the text; links underline in the faint colour; inline code sits on the hover fill; a quotation is a 3px rule and muted text; a checked task is faint and struck through; tables take the CSV table's 6px corner.

**Images.** An image's source resolves from the Markdown file's folder, or from the root of the workspace folder that holds it when it starts with `/`. Percent escapes such as `%20` are decoded, and a query or fragment is dropped. The file's bytes are read through the platform's `readFile` capability and shown through a `blob:` URL, typed by its extension so SVG works; the URLs are revoked when the editor closes. The Markdown text is never rewritten. A path that climbs out of that folder with `..`, a Windows drive path, and any scheme other than `http`, `https`, and `data:image/` are not loaded. Web images load in the browser, but the desktop app's content security policy blocks them. An image that is missing, unreadable, or blocked shows a placeholder with its alt text, or its path when it has none. Pasting or dropping images, an image viewer for image files, and a size limit are not built.

**Known limitation**: no WYSIWYG Markdown editor guarantees byte-for-byte round-trip on arbitrary existing Markdown. Parsing and re-serializing content the user never touched can still normalize source-level formatting that doesn't affect meaning, such as list bullet markers (`-`/`+` normalizing to `*`). This is intentional normalization, not data loss, and the accepted cases are enumerated and asserted in `packages/app/src/components/editor/markdown-round-trip.test.ts` rather than left undocumented.

### Raw editor

The raw view (`packages/app/src/components/editor/raw-editor.tsx`) is a [CodeMirror 6](https://codemirror.net/) editor with line numbers, word wrap, multiple selections (`Ctrl+D`, `Ctrl+Shift+L`), and undo history. Two more options exist but are off by default: a minimap (`@replit/codemirror-minimap`) and vim keybindings (`@replit/codemirror-vim`). The defaults are line numbers on, minimap off, vim off, and word wrap on, chosen for prose and narrow screens, the common case for Markdown and plain-text notes. Line numbers are faint and set in from the frame's edge, with the current line's number in the text colour; the current line itself has no fill, which competed with the selection.

- **One editor, per-tab state.** A single CodeMirror view serves every tab. Switching tabs, or switching a tab to the rendered view and back, saves that tab's editor state and restores it later, so each tab keeps its selection, scroll position, and undo history. The saved states live in `AppShell` outside the documents reducer, because they are not plain data. They are dropped when the tab closes, and renaming a file starts its tab with a fresh editor state. Keeping one view per tab hidden in the DOM was rejected, because memory and DOM size would grow with every open tab.
- **The buffer stays the source of truth.** Typing reports the full text to the documents store. When the buffer changes elsewhere, such as in the CSV table or the Markdown editor, the raw editor applies only the changed range, which keeps the cursor and undo history around it, and does not report that change back as an edit. Line endings are kept: a file containing any CRLF line break is edited with CRLF, any other file with LF, and a buffer whose line endings change, such as after a CSV table edit, rebuilds the editor state for the new ending. Text it reported that the buffer echoes back late, after newer typing, is recognized as an echo and does not undo that typing.
- **Keys.** Editing keys live in CodeMirror's keymap. App commands such as Save and Close Tab keep their shortcuts even with vim on: the editor ignores any key that matches a command shortcut. CodeMirror's own search panel and go-to-line binding (`Ctrl+Alt+G`) are removed so that the app's find bar and go-to command own those actions.
- **Cursor.** The status bar shows the cursor as `Ln {line}, Col {column}`, counted from 1, with the column in UTF-16 code units as CodeMirror counts them, followed by the selected character count when there is a selection. With vim on, it also shows the vim mode, such as `NORMAL` or `VISUAL LINE`.

### Editor settings

Line numbers, word wrap, minimap, and vim mode are switches in the Editor section of [Settings](#settings); `Alt+Z` toggles word wrap, and the command palette lists all four. While the raw editor shows, a gear at the right end of the tabs row, after **Find**, opens a menu of the same four as check items, followed by **All settings…**, which opens the Editor section. It is the same menu component as the right-click menus. The gear is a second home for these toggles, which the [core philosophy](#core-philosophy) otherwise rules out. It is the one exception because the toggles change only how the raw editor looks, and checking the result means looking at the document, which Settings covers; a version without the gear was tried and rejected for that reason. It shows only with the raw editor, since in a rendered view it would change nothing visible: as the raw view comes in, the buttons before it slide left to make room and the gear then grows in; leaving, it shrinks away first. With reduced motion it appears at once. They apply to the raw editor at once and are remembered in the browser's `localStorage` under `vista.settings`, as `{ "version": 1, "editor": { "lineNumbers": true, "minimap": false, "vim": false, "wordWrap": true }, "files": { "maxOpenSizeMb": 10 }, "updates": { "checkAtStartup": false, "dismissedVersion": null } }`. A stored value that is missing, of the wrong type, or outside its allowed range (a whole number from 1 to 512 for `maxOpenSizeMb`, a non-empty string of at most 64 characters for `dismissedVersion`) falls back to its default, field by field, so one bad field does not reset the others. When the store can't be read, the editor starts with the defaults. When it can't be written, a changed setting still applies for the rest of the session but is lost on reload.

### Settings

The gear at the bottom of the left rail, or `Ctrl+,`, opens Settings, the one home for settings, keyboard shortcuts, and About. Settings takes the document frame's place rather than floating over it, since it is a place to look around in, not one question to answer: the tabs row, the document, and the status bar step aside, keeping their state, and come back as they were when Settings closes. From `md` up, Settings also takes the explorer's place: the explorer collapses as Settings opens, so two places never show at once, and comes back as it was when Settings closes; the rail's **Explorer** button closes Settings and goes back to it. Below `md`, the explorer drawer closes as Settings opens, since it would cover it, and can be opened over Settings from the title bar. While Settings shows, commands that act on the document in view, such as Find or Close Tab, are disabled; Save and Save All still work. The gear is pressed while Settings shows, and pressing it again closes Settings, as do Escape and the close button in its header. Focus moves to the shown section as Settings opens, and back to where it was when it closes.

Settings opens at the current workspace's page, or at Appearance with no workspace open. Its sections are listed on the left, below `md` in a row across the top, in two groups by where they apply: **Workspaces**, with each workspace's page, as [Workspaces in Settings](#workspaces-in-settings) describes, and **Vista**, whose sections apply in every workspace. Each section starts with its name and one sentence that says where it applies. Settings are rows in hairline groups, the name and description on the left and the control on the right; an on-off setting is a switch. The Vista sections are:

- **Appearance**: the theme, as _System_, _Light_, or _Dark_. _System_ follows the operating system and changes with it. The choice is stored by `@codenhub/theme` under `vista-theme`; the default is _System_. There is no theme button in the title bar, so the theme has one home.
- **Editor**: the four editor switches.
- **Files**: **Largest file to open (MB)**, described below.
- **Keyboard Shortcuts**: every command that has a key, by category.
- **About**: the version, with its release date, and **What's New**, which shows the version's one-sentence summary and opens a dialog with its [changelog](changelog.md) entry, `What's new in Vista {version}`: the date, the summary, and each heading with its changes, closed with the **Close** icon at its top right, which leaves the entry the room a row of buttons would take, Escape, or a click outside. Both come from the entry the build carries, so they show offline; a build whose version has no published entry shows neither. Then, where the host has an updater, **Check for Updates** and the **Check at startup** switch. Check for Updates asks at once and says what it found. Check at startup is off by default: until the user turns it on, Vista asks for no update when it starts; once on, it asks quietly at each start, from the next one. A newer version found at startup does not interrupt: it shows as a small **Update to {version}** notice, at the right end of the title bar. Choosing it asks `Install it now?`, as Check for Updates does. When the release gives the new version's summary, the notice's tooltip includes it and either offer starts with it, as in `Folders open faster. Install it now?`; its close button, **Dismiss Vista {version}**, hides it and remembers that version as `updates.dismissedVersion`, so later starts show no notice until a newer version is out. Check for Updates offers a version whether or not its notice was dismissed, since the user asked. Once an install starts, the notice goes away, and asking again while it downloads says `Vista is already downloading an update. It restarts when it's installed.` rather than starting a second one. Either way, a new version installs only when the user accepts it.

The Files section holds **Largest file to open (MB)**, the size limit [Opening a file](#opening-a-file) applies. The limit defaults to 10 MB and takes a whole number from 1 to 512; while the field holds anything else, the hint below it says `Enter a whole number from 1 to 512. The limit stays at {n} MB.` and the old limit stays in force. Every change applies at once and is stored with the editor settings. A different limit for each user is the point: a folder of large logs or exports needs a higher one, and a low one keeps a slow machine responsive.

### Find and replace

`Ctrl+F` opens the find bar over the editor, and `Ctrl+H` opens it with the replace row. The Find button in the tabs row opens it too. Typing searches as you go, and the bar shows the position, such as `3 of 12`, or `No results`, or `Invalid regex`. Enter and Shift+Enter move to the next and previous match, wrapping around, and Escape closes the bar and returns focus to the document. Match case, whole word, and regular expression toggles start off each time and are not remembered.

- **Raw view.** The bar drives CodeMirror's search, so matches are highlighted in the text and the current one is selected. Replace changes the current match and moves to the next one; Replace all changes every match as one undoable edit. The search follows the active tab, so switching tabs with the bar open searches the new tab.
- **Rendered views.** Find works, but replace is hidden, since the rendered text is not the file's text. In the Markdown view, matches are highlighted in place with the CSS Custom Highlight API, which leaves the editor's DOM untouched; browsers without it still count and scroll to matches but do not highlight them. A match must lie within one run of text, so a phrase that crosses formatting, such as `**bold** text`, is not found. In the CSV table, the cells whose value matches are marked, and the current one scrolls into view.

### Start screen

With no file open, the editor area shows a start screen instead of staying empty, so the next step is always on screen.

- **No workspace open.** The start screen fills the window below the [title bar](#shell-layout); the explorer and rail are not shown, since they have nothing to list. It shows Vista's logo, then a **Start** list: **Open Folder…**, then the rail's actions that need no workspace, which the list stands in for while the rail is hidden: **Settings**, with its shortcut, and in the browser the desktop download where the [rail](#shell-layout) offers one, as **Download for Windows** or **Download for Linux**, with the same naming of the build, and the version it downloads beside it, `v{version}`, which is the running version, since a release deploys the web app. **New Workspace…** is not repeated here: its home is [Settings](#workspaces-in-settings), and Open Folder already makes a workspace of a folder that isn't one. Below it, **Recent workspaces** lists the [recent workspaces](#recent-workspaces), each with its icon tile, name, and when it was last opened (`Today`, `Yesterday`, or the date). Its folders are not listed: for most workspaces the name is the folder's, listing several would crowd each entry, and Settings shows them; choosing one opens it, as [Reopening at startup](#reopening-at-startup) describes, and an entry that needs permission on the web says `Click to allow access`. Each entry has **Remove from Recent**, as Recent workspaces describes. Nothing is offered while a workspace is still being opened or restored; the [loader](../guidelines/brand.md#loop) shows instead. When the start screen is the app's first view in a run, because no workspace reopened at startup, the logo writes itself at twice its size in the middle of the window, in the [Single stroke](../guidelines/brand.md#entrance) entrance, settles into its place over 350 ms, and the lists then fade in. Any key or click skips to the end, so nothing waits on it; with reduced motion the screen starts at the end. Once a workspace has been open in the run, such as after **Close Workspace**, the logo starts in its place and plays [the opening](../guidelines/brand.md#entrance) entrance while the lists show at once: writing itself again there would hold up someone who just finished in a workspace, and is a greeting for arriving, not for coming back. Each list's heading is followed by a hairline that runs to the rows' right end, so the shortcuts and dates aligned there have an edge to line up with.
- **Workspace open, no tabs.** The frame shows only two faint key hints, `Go to file` and `All commands`, with their shortcuts. They are text, not buttons: every action already has its home in the shell (Go to file in the title bar, new files in the explorer, shortcuts in Settings), and the workspace's name is already in the switcher, so the empty frame repeats none of them.

### Shell layout

From top to bottom, the window holds:

- **Title bar**: the [workspace switcher](#workspace-switcher) on the left, the go-to-file field in the middle, and on the right the update notice when there is one, as [Settings](#settings) describes, then from `md` up the panel toggles: **Toggle Explorer** and **Toggle Status Bar**, one for each bar around the frame, in the order of their place, so a later right-hand panel joins them. A toggle's glyph shows the panel's state, solid while it shows and dashed while it is hidden, rather than a pressed fill on every button. Toggle Explorer is disabled while Settings shows, since Settings takes the explorer's place; Toggle Status Bar is disabled while no file is shown, since the bar is hidden then anyway. Hiding the status bar holds until it is shown again in the same run; it is not remembered. There is no menu bar, as [Commands and menus](#commands-and-menus) explains. With no workspace open the title bar stays, holding only the switcher and the update notice: the go-to-file field and the panel toggles have nothing to act on then, so they are not shown. Hiding the whole bar was tried and dropped: the desktop app keeps the row for its window buttons anyway, so an empty bar looked broken, and the switcher there reaches every workspace without the start screen.
- **Window frame (desktop)**: the desktop app has no system title bar or frame; Vista draws its own, so the window matches the app instead of the system's chrome. **Minimize**, **Maximize** (**Restore** while maximized), and **Close** sit at the right end of the title bar's row, after the panel toggles, as 28px buttons like the title bar's others, with the thin glyphs Windows draws, and Close turning red under the pointer. Pressing an empty part of the row moves the window, and a double press maximizes or restores it. Close asks about unsaved edits as any other close does. The system frame was dropped rather than recoloured, since a recoloured frame still shows the system's title text and buttons above Vista's own bar; Windows shows its snap layouts only when the pointer rests on a system frame's Maximize, which the window no longer has, so on Windows resting the mouse on Vista's Maximize for half a second shows them by pressing `Win + Z`, the shortcut that shows them for the window in front. It does nothing when Vista is not the window in front, since the shortcut would act on another window, or when the user turned off _Show snap layouts when I hover over a window's maximize button_ in Windows' settings. Maximize keeps its tooltip: the layouts open over it, and when Windows shows none, the tooltip still names the button. Asking Windows to treat Vista's button as the frame's own, which would show them exactly as for a system frame, was not possible: WebView2 marks a page's region as a window button only in the visual hosting Tauri does not use. Snapping by dragging to a screen edge and with `Win + arrow` works as for any window. The browser and the phone builds have no such row: the browser and the phone draw their own.
- **Left rail**: a narrow column of icon buttons. **Explorer** goes to the explorer, closing Settings and showing the explorer if it was hidden; it never hides it, which is the title bar toggle's job, because a button for a place that also hides that place read as a surprise. One background marks what the frame shows, the workspace's files under Explorer or Settings, and slides from one button to the other as it changes, so the rail reads as a set of places and one is always marked while a workspace is open. Explorer stays marked while its panel is collapsed, since the frame still shows the workspace's files. The rail's icons sit as far from the frame as from the window's edge, so the frame takes no margin beside the rail, with the explorer open or collapsed. **Search** and **Graph** are shown disabled with the tooltip `Coming soon`, so the places those features will take are already where users will look for them. The **Settings** gear sits at the bottom, pressed while Settings shows.

  In the browser, on a system the desktop app is built for, a download icon sits above the gear and links to its installer, with the tooltip **Download Vista for Windows**, linking to `/download/windows`, or **Download Vista for Linux** on x86_64 desktop Linux, linking to `/download/linux`, the AppImage, which needs no package manager but, like any AppImage, runs only where the system's glibc is at least as new as the one it was built against; the `.deb` and `.rpm` stay at their own links, as [CI](../ci.md) lists. The system is read from the browser's user agent. On Linux the user agent cannot tell the processor, since both Chromium and Firefox name x86_64 on every Linux, ARM included, so the processor is read from the browser's client hints where it reports one: x86_64 gets the plain label, and any other processor gets nothing. Where it reports none, as in Firefox, or in Chromium on a non-secure origin or when the hints are blocked, the label names the build, **Download Vista for Linux (x86_64)**, so a user on another processor can tell it is not for them. On macOS, ChromeOS, a phone, Linux whose browser reports a processor other than x86_64, or in the desktop app itself, it does not show. It is a link, not a button that acts in the app, so it is never pressed, and a download link, so a click saves what the host answers rather than navigating away from the app. That is the installer from the deployed host; a host that answers with a page, such as the development server, saves the page, and the app stays open. The start screen's link is the same.

- **Explorer**, beside the rail: the workspace's folders, as [File and folder management](#file-and-folder-management) describes. Below `md` it is a drawer over the document. When the window narrows past `md`, the explorer closes, so resizing never leaves the document covered; when it widens again, the explorer is open or closed as the user last left it at that width, whatever the drawer did in between.
- **Tabs row** above the document: the tabs, then, at the right end, the view switch, **Find**, and, while the raw editor shows, the [editor settings](#editor-settings) gear. These act on the active tab, so they sit on the row that chooses it. There is no Save button: saving is `Ctrl+S`, and the dot in the tab shows unsaved edits.
- **Path and status bar** at the bottom, as [Path and status bar](#path-and-status-bar) describes.

Three actions look for something, and each has its own icon so one is never taken for another: Go to file, in the title bar and wherever else it is offered, shows a page under a magnifier; Find, in the tabs row, shows lines of text under one; and the rail's Search, for searching the whole workspace, has the plain magnifier.

The tabs row and the document sit together in one frame, a lighter panel with a hairline border and rounded corners, and the title bar, rail, explorer, and status bar sit on the darker ground around it, so the document is what stands forward. Each boundary is drawn once: the frame's edge separates it from everything else, and nothing inside the shell adds a second line.

Shortcuts are written with spaced plus signs, as in `Ctrl + P` and `Ctrl + Shift + S`, wherever the interface shows one: the title bar, the palette, menus, tooltips, and Settings. The spaces keep the keys apart at small sizes, where `Ctrl+Shift+S` runs together.

**Tooltips.** Every icon-only control has a tooltip with its name, and its shortcut after it in a fainter colour when it has one, as in `Find  Ctrl + F`. It shows after the pointer rests on the control for 400 ms, or at once when another tooltip hid less than 300 ms before, so moving along a row of buttons reads each name without waiting at every one. It also shows when keyboard focus reaches the control, but not when a click focused it. It stays while the pointer moves onto the bubble, so a long one, such as a path, can be read under magnification. A bubble above or below its control is centered on it whenever that fits in the window, however close the control is to an edge; one that would cross the window's edge lines up with the control's edge on that side instead, and one too wide even for that keeps 8 px from the window's edge. A click or Escape hides it until the pointer leaves and returns, and Escape does so wherever focus is.

**Motion.** The shell moves only where something changes place, so the user can see where a part came from and where it went. Opening a workspace grows the rail and explorer in from the left while the frame shrinks to make room; closing it reverses that. Showing or hiding the explorer resizes the frame. The status bar slides up when a file opens and down when the last one closes. A folder's rows unfold from its row as it opens, and its chevron turns. A new tab grows in, pushing the tabs after it aside, and a closed one shrinks away as they close the gap. Tooltips and menus grow from the point they open at; a menu closes at once, since by then the user has chosen. Copying from the path bar turns the copy button into a check for a moment. These take 140 to 350 ms, ease without bouncing, and are instant with the operating system's reduced-motion setting. One exception: the rail's marked background travels on a light spring, about 500 ms, drawing in to a small round drop on the way and swelling just past its size as it lands, because it crosses the whole rail between Explorer and Settings, and at the usual speed that trip read as a box sliding. Typing, switching tabs, moving through a list or menu with the keyboard, and scrolling never animate, since a delay there is only a delay.

The view switch is two labelled segments in one hairline box: **Rich text** (eye) and **Raw** (code) for Markdown, **Table** (table) and **Raw** for CSV. The pressed one is the view shown, with a fill behind it that slides to the other segment when the view changes. The labels are written out, not left to tooltips, because two icons alone did not say which view was which until hovered. A format with one view shows no switch.

There is no breadcrumb above the document: the path bar shows the whole path instead, so no folder is hidden on a narrow screen.

### Go to file and line

`Ctrl+P` opens a picker that fuzzy-matches the query against every file path in every folder of the workspace, ranking matches at word starts, consecutive characters, and the file name higher. It lists at most 50 results. Each result shows `{folder} / {path}`, and the folder's name is part of what the query matches, so typing it narrows the list to that folder. Arrow keys pick a result and Enter opens it. Adding `:line` or `:line:column` to the query, as in `readme:12:4`, opens the file at that position. `Ctrl+G`, or clicking the cursor position in the status bar, opens the same picker with `:` typed, so `:12` moves within the current file. Going to a position switches the tab to the raw view, since only the raw view has lines and columns. A line or column past the end moves to the last line or the end of the line.

The same picker runs commands. `Ctrl+Shift+P`, or typing `>` first, lists every command as `Category: Command` with its shortcut, a check mark on a toggle that is on, and commands that cannot run now dimmed; Enter does not run those. The query fuzzy-matches the same way as for files. A chosen command runs after the picker has closed and focus is back where it was, so Edit commands act on the editor the picker was opened from. The field in the title bar always opens the picker on files; it never changes meaning with the app's state. With no workspace open the picker says `Open a folder to find its files. Type > for commands.` A footer in the picker names its keys.

Searching inside file contents is not built; it is planned as a separate feature with its own view behind the rail's **Search** button. Finding a file by name stays here, because jumping to a known file has to be instant and the two tasks rank results differently.

### Path and status bar

The bar below the frame shows, on the left, where the active file is, and on the right, facts about it. It is shown only while a file is: with none open it would have nothing to say. The title bar's **Toggle Status Bar** hides it while a file is shown, and the **View: Status Bar** command does the same. The file's name is set in strong text after the faint folders, so it reads first.

**Path.** On desktop it is the file's full path on disk, as in `C:\Users\gustavo\projects\notes\docs\example.md`. On the web, which has no path on disk, it is `{folder} / {path}`, as in `notes / docs / example.md`. When the path doesn't fit, its middle is shortened with `…` a segment at a time, keeping the start and the file name, as in `C:\Users\gustavo\…\docs\example.md`; the full path is in its tooltip. Beside it:

- **Copy Path** (desktop) copies the full path. The web has no full path, so its bar offers **Copy Relative Path** instead, which copies the path within the folder, such as `docs/example.md`. After a copy that worked, the button shows a check for 1.5 seconds and screen readers hear `Copied`; a copy that failed shows an error toast instead.
- **Reveal in File Explorer** (desktop only) opens the operating system's file manager with the file selected. The web has no way to open the file manager, so the button is not shown there rather than shown disabled.
- **Notes** about the buffer follow the path: **Read-only**, **Raw only**, **Changed on disk**, or **Deleted on disk**, each with the tooltip that explains it, as [Opening a file](#opening-a-file), [CSV table](#csv-table), and [Changes on disk](#changes-on-disk) describe.

**Facts.** With a file open, the right side shows the cursor and vim mode (raw view only; see [Raw editor](#raw-editor)), then facts about the buffer: the line count, the size in bytes as UTF-8 (`B`, `KB`, or `MB`), the line ending (`CRLF` when the buffer contains any CRLF line break, `LF` otherwise), the format, and, for Markdown, the word count.

### Commands and menus

There is no menu bar. Every action has a visible home elsewhere: workspace actions in the [workspace switcher](#workspace-switcher) and [Settings](#workspaces-in-settings), file actions in the explorer, tab actions on the tabs, document actions in the tabs row, and settings, keyboard shortcuts, and About in [Settings](#settings). A menu bar would repeat almost all of them, which is the second way of doing the same thing the [core philosophy](#core-philosophy) rules out. Keeping it for browsing every command by mouse was weighed and rejected: the command palette (`Ctrl+Shift+P`) lists every command, with its shortcut, and is reachable from the start screen and the Keyboard Shortcuts section.

Every action is a command, as defined in [Commands and shortcuts](../architecture.md#commands-and-shortcuts), so the palette, the right-click menus, and the Keyboard Shortcuts list show the same label and shortcut, and grey out a command that can't run. Commands are grouped by category:

- **Workspace**: Open Folder, New Workspace, Add Folder to Workspace, Workspace Settings.
- **File**: New File, New Folder, Save, Save All, Copy Path, Copy Relative Path, Reveal in File Explorer (desktop only). New File and New Folder create the entry in the active file's folder, or in the workspace's first folder when no file is open, and the name field opens there in the explorer, so the user sees where it lands. When the first folder can't be reached yet, they use the first folder that can, since the name field still shows where the entry will land. They have no shortcut: browsers reserve `Ctrl+N` for a new window.
- **Tabs**: Close Tab, Close All Tabs, Next Tab, Previous Tab, Move Tab Left, Move Tab Right.
- **Edit**: Undo, Redo, Cut, Copy, Paste, Find, Replace.
- **Selection**: Select All, Select Line, Add Next Occurrence, Select All Occurrences, Add Cursor Above, Add Cursor Below. All but Select All need the raw view's multiple selections, so they are disabled in the rendered views.
- **View**: Show All Commands, Explorer, Status Bar, Raw Text, Word Wrap, Line Numbers, Minimap, Vim Mode.
- **Go**: Go to File, Go to Line.
- **Settings**: Settings, Keyboard Shortcuts, About Vista.

A command chosen in the palette or a menu runs after focus is back where it was, so Edit and Selection commands apply to the editor the user was in. Undo, Redo, Cut, Copy, Paste, Select All, and the Selection commands show the keys the editors handle themselves; the app does not bind those keys, so they keep working in every text field. Paste from a menu or the palette reads the clipboard with the Clipboard API, which can ask for permission; when reading fails, a toast says to press `Ctrl+V` instead.

**Highlight in menus.** A menu has one highlighted item at a time, and the highlight follows the input that is in use:

- Opened with the keyboard, the first enabled item is highlighted, so the arrow keys start from it. Opened with the pointer, nothing is highlighted until the pointer moves over an item.
- Moving the pointer over an item highlights it and only it; the hover and keyboard highlights are the same state, never two fills added together.
- When the pointer leaves the menu, the highlight clears, unless the keyboard moved it since. The arrow keys then start from the first item.

This is how native menus behave. Highlighting the first item on every open, and keeping the last hovered item lit after the pointer left, were rejected because they show a pointer user a choice they had not made.

Right-clicking opens a menu built the same way. The explorer's menu is described in [File and folder management](#file-and-folder-management), and the tab menu in [Tabs](#tabs). In the editors it offers Cut, Copy, Paste, Select All, and Find, plus Replace and Go to Line in the raw view. Shift+right-click keeps the browser's own menu, for spelling suggestions.

### Tabs

Every opened file gets its own tab, and selecting a file that is already open switches to its tab instead of reloading it. There are no preview tabs: a tab stays until the user closes it. A new tab opens to the right of the active one. Closing the active tab shows its right neighbor, or its left neighbor when it was the last tab.

- Each tab remembers its own view mode. Markdown opens in the rendered view and CSV in the table, since a table is what a CSV file is read as; plain text opens raw. Which views a format offers comes from the viewer registry in `packages/app/src/domain/viewers.ts`, so a later format with no raw form, such as PDF, hides the toggle.
- A tab closes from its Close button, a middle click, or the Close Tab shortcut: `Ctrl+W` on native and `Alt+W` on the web, because browsers reserve `Ctrl+W` for closing their own tab. Arrow keys move between tabs.
- **Reordering.** Dragging a tab moves it: the tab follows the pointer along the row, never out of it, and the tabs it passes slide aside to open the place it will land in, a tab being passed once the dragged tab's leading edge reaches its middle, so the new order is visible before the drop. On release it slides into that place; Escape slides everything back. The strip scrolls when the drag nears its edge. The dragged tab has no shadow, since it stays in the row rather than lifting off it. There is no separate drop marker, because the row itself shows the result. With a tab focused, `Shift+ArrowLeft` and `Shift+ArrowRight` move it one place, and **Move Tab Left** and **Move Tab Right** in the palette do the same, so reordering does not need a pointer. The order is part of the workspace's [session](#sessions).
- **Names.** A tab shows the file name. When two open tabs have the same file name, each adds its folder, as in `readme.md · notes`, so they can be told apart; its tooltip is the path the [path bar](#path-and-status-bar) shows.
- Right-clicking a tab offers Close, Close Others, Close to the Right, Close Saved, Close All, then Copy Path, Copy Relative Path, and, on desktop, Reveal in File Explorer. Closing several tabs asks once about all their unsaved edits.
- Renaming a file or folder updates every open tab inside it in place. Deleting closes every open tab inside it, with an info toast naming the file or counting them.
- Tabs are keyed by workspace folder and path, so two folders can hold files at the same relative path.

### Document buffer and dirty state

Opening a file loads its contents into an in-memory `FileDocument` buffer, one per tab:

- `path`: relative or canonical path within the workspace.
- `name`: file name.
- `extension`: file extension without leading dot.
- `content`: current in-memory string representation.
- `isDirty`: boolean indicating whether unsaved edits exist in the buffer.

Beside the buffer, each tab keeps the file's version on disk as it last read or wrote it (size and modification time), whether the file began with a UTF-8 byte order mark, whether it is read-only, and any change made on disk since, as [Changes on disk](#changes-on-disk) describes.

### Opening a file

Opening a file reads its size first. A file over the limit set in [Settings](#settings) is not read, and an error toast says `"{name}" is {size} MB, over the {limit} MB limit. You can raise the limit in Settings.` The size is checked again after reading, so a file that grew in between is refused too. A file that no longer exists shows `"{name}" no longer exists. It may have been moved or deleted.` and the tree is scanned again.

The bytes are then decoded:

- **UTF-8 text** opens for editing. A leading byte order mark is removed from the buffer and written back on save, so saving never adds or drops one.
- **A file with a NUL byte in its first 8,000 bytes**, the window Git uses, is treated as binary and not opened: `Vista can't open "{name}" because it isn't a text file.`
- **A file that starts with a UTF-16 byte order mark** opens read-only, decoded as UTF-16, for the same reason as the next case. Its NUL bytes are part of the encoding, so it is never called binary.
- **Any other file that isn't valid UTF-8**, such as Latin-1 or Windows-1252 text, opens read-only, decoded with replacement characters, and an info toast says `"{name}" isn't UTF-8 text, so it opened read-only to keep its characters intact.` The path bar shows **Read-only**. Saving it would replace every unreadable character with U+FFFD, so editing it is not offered. Converting from other encodings is not built.

Edits made in either the Raw view or the rendered view (such as editing a CSV cell, or typing in the Markdown WYSIWYG editor) update that tab's buffer and set `isDirty: true`. A dot in the tab marks unsaved edits. Save (`Ctrl+S` or `Cmd+S`, or **Save** in the command palette) writes the active tab's buffer to disk via the platform's `writeFile` capability. The tab becomes clean only if its buffer still matches what was written, so edits typed while a save is in flight stay marked unsaved.

### Changes on disk

Vista is not the only program that edits a folder: a sync client, a git checkout, or another editor can change a file while its tab is open. A save asks before overwriting such a change, except one landing between the check and the write, as below.

- **Saving checks the version.** Save passes the version the tab last read or wrote, and the host refuses the write when the file on disk no longer matches, or is gone, with a `conflict` error. Vista then asks `"{name}" changed on disk` with **Overwrite** and **Cancel**. Overwrite writes again without the check; Cancel keeps the buffer and its edits as they are.
- **Returning to Vista checks every open tab.** When the window gains focus or becomes visible, Vista scans every folder of the workspace again, quietly, and compares each open tab with the file on disk. A tab without unsaved edits whose file changed is reloaded in place. A tab with unsaved edits keeps them, and the path bar shows **Changed on disk**; a tab whose file was deleted shows **Deleted on disk** and keeps its buffer; saving it asks the same question, and Overwrite recreates the file. An info toast names the changed file, or counts them, and says that saving will ask before overwriting.
- **The check and the write are separate calls**, so a change landing in the instant between them can still be overwritten. Neither host offers a compare-and-write on a file, so this window cannot be closed; it is milliseconds wide, against the minutes or hours an open tab otherwise covers.
- **Fallback mode** has no disk to compare against: a save downloads a copy, so nothing on disk is overwritten.

### Unsaved changes

Unsaved edits are never discarded silently. Switching tabs or opening another file keeps every buffer as it is. Closing a tab with unsaved edits, or leaving the workspace while any tab has them, by switching workspaces or opening a folder, shows a modal titled "Save changes to {file}?" with **Save**, **Don't Save**, and **Cancel**. When several tabs have unsaved edits, one modal titled "Save changes to {n} files?" lists them and offers **Save All**. The list shows paths, prefixed with the folder name when the workspace has more than one folder, so two files with the same name stay distinguishable. Edits made after the user answers, such as typing while a save is in flight, are asked about again before the action continues. Cancel, Escape, and a backdrop click keep everything open with its edits intact, and the requested action does not happen. A failed save also stops the action and shows an error toast.

Closing or reloading the browser tab while any tab has unsaved edits triggers the browser's own unload warning. Vista cannot customize that prompt's text.

Closing the desktop window asks the same question as leaving the workspace, through the host's `window.onCloseRequested`, because a webview window gets no unload warning. The window closes after Save All or Don't Save, and stays open after Cancel or a failed save. A second close request while the question is showing is ignored, and a check that fails lets the window close rather than trapping the user in it.

## Platform capability contract

The shared application consumes folder operations via `WorkspaceCapability` injected in `AppAdapter`. Hosts deal only in folders: picking one, keeping access to it, and reading and writing inside it. Workspaces, their details, and their sessions belong to the shared app, as [Stored workspace data](#stored-workspace-data) describes, so a host never learns what a workspace is.

```ts
export interface WorkspaceFolder {
  id: string; // stable across restarts
  name: string;
  rootPath: string;
  accessMode?: "direct" | "fallback";
}

export interface WorkspaceCapability {
  readonly isSupported: boolean;
  pickFolder(): Promise<WorkspaceFolder | null>;
  restoreFolder(id: string, options: { interactive: boolean }): Promise<RestoreFolderResult>;
  forgetFolder(id: string): Promise<void>;
  relate(a: WorkspaceFolder, b: WorkspaceFolder): Promise<FolderRelation>;
  resolveRelative?(from: WorkspaceFolder, relativePath: string): Promise<WorkspaceFolder | null>;
  relativeLocation?(from: WorkspaceFolder, to: WorkspaceFolder): Promise<string | null>;
  reveal?(folder: WorkspaceFolder, path: string): Promise<void>;
  readTree(folder: WorkspaceFolder): Promise<WorkspaceNode[]>;
  stat(folder: WorkspaceFolder, path: string): Promise<FileStat | null>;
  readFile(folder: WorkspaceFolder, path: string): Promise<FileContents>;
  writeFile(folder: WorkspaceFolder, path: string, bytes: Uint8Array<ArrayBuffer>, options?: { expected?: FileStat }): Promise<FileStat>;
  createFile(folder: WorkspaceFolder, path: string): Promise<void>;
  createDirectory(folder: WorkspaceFolder, path: string): Promise<void>;
  move(folder: WorkspaceFolder, fromPath: string, toPath: string): Promise<void>;
  remove(folder: WorkspaceFolder, path: string): Promise<void>;
}

export interface WindowCapability {
  onCloseRequested(check: () => Promise<boolean>): () => void;
  controls?: WindowControls;
}

export interface WindowControls {
  minimize(): Promise<void>;
  toggleMaximize(): Promise<void>;
  close(): Promise<void>;
  startDragging(): Promise<void>;
  showSnapLayouts?(): Promise<void>;
  watchMaximized(listener: (isMaximized: boolean) => void): () => void;
}

export interface FileStat {
  size: number; // bytes
  modifiedAt: number; // milliseconds since the epoch
}

export interface FileContents {
  bytes: Uint8Array<ArrayBuffer>;
  stat: FileStat;
}

export type FolderRelation = "same" | "contains" | "inside" | "separate";

export const LEGACY_FOLDER_ID = "last-folder";

export type RestoreFolderResult = { status: "restored"; folder: WorkspaceFolder } | { status: "needs-permission"; name: string } | { status: "unavailable"; name: string } | { status: "none" };
```

Every file operation names the folder it acts on, so a host keeps no "current folder" of its own.

- `pickFolder` shows the native picker and remembers access to the chosen folder under its `id`. Picking a folder the host already remembers returns the same `id`, so the shared app can recognize it.
- `restoreFolder` reopens one remembered folder. `forgetFolder` drops the host's access record; the shared app calls it when no remembered workspace uses the folder any more.
- `relate(a, b)` says whether `a` is the same folder as `b`, contains it, is inside it, or is separate. The desktop compares normalized paths; the web uses `FileSystemHandle.isSameEntry` and `FileSystemDirectoryHandle.resolve`.
- `relativeLocation(from, to)` returns where `to` is relative to `from`, such as `../sources` or `drafts/2024`, with `/` separators, or `null` when the host can't tell. The desktop works it out from the paths; the web uses `FileSystemDirectoryHandle.resolve`, which only answers for a folder inside `from`. It is optional so a host without either can still offer every other feature.
- `resolveRelative` and `reveal` are optional and only the desktop host provides them. `resolveRelative` finds a folder from a location such as `../sources`, as [Where a workspace's details live](#where-a-workspaces-details-live) describes, and returns `null` when nothing is there. `reveal` opens the operating system's file manager with the entry selected.
- `stat` returns a file's version, or `null` when nothing is there or the entry is not a file.
- `readFile` returns the bytes and the version they were read at. Text decoding is the shared app's job (`packages/app/src/domain/text-codec.ts`), so both hosts handle encodings the same way. A host stats before it reads, so a change made between the two reads as newer than the version returned and is noticed on the next check instead of hidden.
- `writeFile` with `expected` throws `WorkspaceError` with kind `conflict` when the file on disk is missing or its version differs. It returns the version written.
- `.vista/workspace.json` is read and written with `readFile`, `writeFile`, and `createDirectory`; no operation exists for it alone.
- `WindowCapability` is optional and only the desktop host provides it. Its `check` resolves `true` when the window may close. Its `controls` are there where the app draws the window's frame, the desktop window on Windows, Linux, and macOS: `close` asks to close, so the `check` runs; `watchMaximized` reports the state at once and on every change; and `showSnapLayouts` is there on Windows only.

`restoreFolder(id, { interactive: true })` MUST only be called from a user gesture such as a click handler. With `interactive: false` the host never prompts. [Reopening at startup](#reopening-at-startup) describes each host's behavior.

### Platform-specific implementations

1. **Web (`apps/web`)**:
   - **Primary direct-disk mode**: Uses the File System Access API (`window.showDirectoryPicker({ mode: "read" })`) in Chromium-based browsers (Chrome, Edge, Opera) for live in-place read access to local folders. Requesting read-only access up front keeps folder-open to a single native picker interaction. Write access is requested lazily, the first time a file is saved (`FileSystemDirectoryHandle.requestPermission({ mode: "readwrite" })`), so the second, easy-to-miss permission prompt fires in direct response to the user's own Save action instead of immediately after the folder picker. Every subsequent read or write re-checks the handle's current permission (`queryPermission`) and re-requests it if it was revoked, rather than assuming a previously granted handle stays valid for the life of the session.
   - **Universal directory fallback**: In browsers that do not support the File System Access API (such as Firefox and Safari) or restricted environments (such as non-secure origins or cross-origin iframes), automatically falls back to `<input type="file" webkitdirectory />`. This allows any browser to select local folders and explore/edit their file tree in-memory with file export capabilities. A folder opened this way reports `accessMode: "fallback"` on its `WorkspaceFolder` (as [Opening a folder](#opening-a-folder) describes); the application surfaces a one-time notice that saves will download a file instead of writing in place, and that the workspace won't be remembered.
   - **Hidden entries**: the tree leaves out Vista's own `.vista` folder, version-control internals (`.git`, `.svn`, `.hg`), installed dependencies (`node_modules`), and OS metadata files (`.DS_Store`, `Thumbs.db`). Nothing else is hidden, because notes can live in a `build` or `.vscode` folder. Moving a folder still copies every entry inside it, hidden ones included, so a moved project keeps its `.git`.
   - **Saving**: `createWritable` writes to a swap file the browser moves into place when the stream closes, so a failed write leaves the original intact. The version is the file's `lastModified` and `size`.
   - **Remembered folders**: each directory handle is stored in IndexedDB (database `vista`, version 2, store `folders`, keyed by folder id), and `pickFolder` compares a newly picked handle with the stored ones (`isSameEntry`) to return the same id for a folder picked again. Fallback-mode folders are never stored, as [Reopening at startup](#reopening-at-startup) describes.
2. **Native (`apps/native`)**:
   - Uses Tauri's dialog plugin (`@tauri-apps/plugin-dialog`) for native directory selection.
   - Uses Tauri's filesystem plugin (`@tauri-apps/plugin-fs`) for directory enumeration and file I/O, hiding the same entries as the web host. A scan reads at most 16 folders at once, because each read is an IPC call and an open directory handle.
   - **Saving**: the bytes are written to a new temporary file beside the target, `{name}.vista-save-{id}`, which is then renamed over it, so a crash or a full disk mid-save leaves the original intact rather than truncated. On Unix the temporary file is created with the original's permission bits, less any the process umask clears, so a group-writable file can lose group write. The rename replaces the file in one step on Windows, Linux, and macOS, but the file is a new one: on Windows, permissions set on the file itself rather than inherited from its folder, and alternate data streams, are not carried over. The temporary file is removed if the rename fails. A symbolic link is written through, in place, without a temporary file: a rename would replace the link with a regular file, and the file it points to would stop changing.
   - Persists the granted folder scope with `tauri-plugin-persisted-scope` so a remembered folder can be reopened after restart. Each folder's root path is stored in `localStorage` under `vista.folders`, keyed by folder id.
   - The filesystem plugin is configured with `requireLiteralLeadingDot: false`, so a granted folder's scope also covers its entries whose names start with a dot, as it already does on Windows. The plugin's Unix default keeps `**` from matching them, which would deny `.vista/workspace.json`, Markdown under `.github`, and the `.git` folder a move copies. The scope still reaches only folders the user granted.
   - **Reveal** uses `tauri-plugin-opener`'s `revealItemInDir`, and the desktop capability alone grants `opener:allow-reveal-item-in-dir`, so the plugin can't open files or URLs, and Android and iOS, where the plugin can't reveal, get no permission at all. The tree hides the same entries as the web host, `.vista` included.
   - Always direct-disk (`accessMode` is omitted, meaning `"direct"`); there is no fallback mode on native hosts.

### Observable failure behavior

Workspace operations do not fail silently. A user-initiated cancellation of the folder picker (the platform picker's own Cancel/Escape) resolves `pickFolder()` to `null` with no error and no user-visible message — this is expected, ordinary behavior, not a failure. Any other failure — permission denied or revoked, a file or folder that no longer exists, an unreadable/unwritable path — rejects with a descriptive `Error` and is surfaced to the user as a toast message (`packages/app/src/components/feedback/toast.tsx`), not just logged to the console. This applies to every `WorkspaceCapability` operation, including the file management operations below.

## File and folder management

The explorer follows the open documents: opening a file from anywhere, such as the picker or a tab, expands the folders above it and highlights its row, and a file with unsaved edits shows a dot beside its name.

The explorer's header reads **Explorer**, with **Add Folder to Workspace** and **Collapse All** beside it. It does not repeat the workspace's name, which the switcher already shows directly above. Below it, every folder of the workspace is a root row, even when there is only one, so the tree looks the same with one folder or five and folder actions always have the same place. Root rows start expanded.

Users create, rename/move, and delete files and folders from the tree:

- **Folder rows**, root rows included, show **New File** and **New Folder** buttons on hover and keyboard focus. The name field opens inside that folder, so the user sees where the entry lands. The header has no New File button: with several folders it could not say which one it means.
- **Right-clicking a file** offers Open, Rename, Delete, then Copy Path (desktop), Copy Relative Path, and Reveal in File Explorer (desktop).
- **Right-clicking a folder** offers New File, New Folder, Rename, Delete, then the same three path items.
- **Right-clicking a root row** offers New File, New Folder, the path items, and **Remove Folder from Workspace**, which asks first and changes nothing on disk. Rename and Delete are not offered on a root row: renaming or deleting a whole workspace folder from inside its own workspace is easy to do by accident and hard to undo.
- **Right-clicking empty space** below the tree offers New File and New Folder in the workspace's first folder, or the first one that can be reached when it can't be yet.

Copy Relative Path copies the path within the entry's own folder. Copy Path and Reveal exist on desktop only; the browser has no full path to copy and cannot open the file manager, so they are not shown there rather than shown disabled. Renaming is implemented as `move` within the same parent directory — there is no separate rename operation, matching VS Code's own model.

- **A folder Vista can't reach** keeps its root row, which says why and what to do: **Allow access** on the web when the browser needs permission again, **Locate…** beside **Remove Folder from Workspace** when a folder from `.vista/workspace.json` was not found, and **Remove Folder from Workspace** alone when it no longer exists. Removing a folder that was not found drops its location from the file. The workspace's other folders work normally.
- **Two folders with the same name**: on desktop, each root row adds its parent location in grey, as in `notes  ~/work`. The browser has no location to show, so same-named folders differ only by their order there. A label per folder was considered and left out until this proves to be a real problem.
- **Moving between folders** is refused, as [Folder rules](#folder-rules) describes.

- **Delete confirmation**: choosing "Delete" opens a modal dialog titled `Delete "{name}"?` with **Cancel** and **Delete** buttons, and nothing is removed until Delete is confirmed. The message warns that a folder's contents are deleted with it. When an open tab inside the deleted entry has unsaved edits, the message also warns that those edits will be lost. The dialog is a native `<dialog>`, so Escape cancels it.

- **Validation**: candidate names are validated client-side before any disk operation, via `validateEntryName` (`packages/app/src/domain/path-validation.ts`). Rejected: empty or whitespace-padded names, the reserved names `.` and `..`, a trailing period, the characters `" * / : < > ? \ |` and ASCII control characters (disallowed universally rather than per-platform, since a name valid only on one OS could break when a workspace is later opened on another), and a case-insensitive collision with an existing sibling in the same directory.
- **Active document handling**: renaming the open file updates its path and name in place, without re-reading the file from disk (the bytes did not change). Deleting the open file, or a directory that contains it, clears the editor and shows a toast explaining why.
- **Tree refresh**: every create, move, or delete is followed by a full `readTree` re-scan rather than a local, incremental tree edit — the only tree-construction logic lives in each platform adapter (per [Platform adapters](../architecture.md#platform-adapters)), so the shared UI does not duplicate it.
- **Platform-specific move semantics**: the File System Access API has no native move or rename, so the web host implements `move` as a recursive copy followed by a delete of the source. This is **not atomic**: on a failure partway through, the source is left in place (never deleted before the copy fully succeeds) and the error propagates to the user rather than silently losing data. The native host uses `@tauri-apps/plugin-fs`'s `rename`, which is atomic; because `rename` silently replaces an existing destination rather than failing, the native adapter explicitly checks for a destination collision first to honor the same "throws on collision" contract as the web host.
- **Fallback mode**: on the web host's non-FSA fallback (as [Platform-specific implementations](#platform-specific-implementations) describes), file management operates entirely on the in-memory tree and file map — there is no real disk backing to mutate, consistent with how `writeFile` already behaves in that mode.

## Theming and presentation

The appearance is light, dark, or following the operating system, as [Settings](#settings) describes. [Architecture](../architecture.md#shared-presentation) describes how the interface is styled and themed with `@codenhub/styles` and `@codenhub/theme`, and how icons from `@codenhub/icons` render.
