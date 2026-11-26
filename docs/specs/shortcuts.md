---
status: APPROVED
last_updated: 2026-11-26
scope: Customizable keyboard shortcuts, which commands can be given keys, how a key is added, removed, and reset in Settings, which keys are refused, how a key already in use is handled, and how the choices are stored and shown.
---

# Keyboard shortcuts

This document makes Vista's keyboard shortcuts customizable, with any number of keys for each command. It is approved and not implemented: [Current behavior](#current-behavior) describes the code as it is, and the sections after it describe what is to be built.

## Current behavior

Every shortcut is fixed in code. [Commands and shortcuts](../architecture.md#commands-and-shortcuts) describes the mechanism: each action is a `Command` built in `AppShell` (`packages/app/src/app.tsx`), and a command has either a `shortcut`, which one window `keydown` listener (`useCommandShortcuts`) binds, or a `shortcutHint`, a key an editor handles itself, which menus show but the app does not bind.

- **Bound keys.** Save (`Mod+S`), Close Tab (`Mod+W` on the desktop, `Alt+W` in the browser, which keeps `Ctrl+W` for itself), Find (`Mod+F`), Replace (`Mod+H`), Go to File (`Mod+P`), Show All Commands (`Mod+Shift+P`), Go to Line (`Mod+G`), Word Wrap (`Alt+Z`), and Settings (`Mod+,`).
- **Editor keys.** Undo, Redo, Cut, Copy, Paste, Select All, and the Selection commands carry a `shortcutHint`. The raw editor's CodeMirror keymap, and vim when it is on, handle them, and the browser handles them in every other text field. The rendered Markdown editor has keymaps of its own.
- **No key.** Every other command, such as Save All, New File, Next Tab, or Vim Mode, has no key; the palette and menus reach it.
- **The editor yields.** The raw editor receives every bound shortcut as `reservedShortcuts` and ignores a key that matches one, so a command wins over a CodeMirror or vim binding on the same key.
- **Matching.** A shortcut is written as `+`-joined modifiers and one key, such as `Mod+Shift+S`, where `Mod` is Ctrl or Cmd. A letter matches the typed character or, when Alt or Shift changed it, the physical key (`event.code`), so `Alt+Z` works on layouts where Alt+Z types another character.
- **Display.** `formatShortcut` writes `Ctrl + Shift + S` wherever a key shows: the title bar, the palette, menus, tooltips, the start screen and the empty frame's hints, and Settings → Keyboard Shortcuts, which lists every command that has a key, bound or hinted, as a read-only table. Key names are not translated, as [Languages](languages.md#what-is-not-translated) records.

## Which commands take keys

Every command can be given keys, have them removed, or be reset, except the commands that carry a `shortcutHint`. Those stay as they are and show in the list without the controls, with the description `The editor handles this key.`

The editor commands are left out because binding their key in the app would take it from every text field: a rebound `Ctrl+C` would stop copying in the find bar, the rename field, and the go-to picker. Remapping the editor's own keymap instead is a different feature, with its own conflicts with vim, and nobody has asked for it.

Commands that have no key today are included. They are most of the commands, and giving one a key, such as `Ctrl + Tab` for Next Tab on the desktop, is the most common reason to want this at all.

### Several keys per command

A command has a list of keys, empty or with one or more, and any of them runs it. Someone used to another editor can keep its key beside Vista's, such as `Ctrl + L` and `Ctrl + G` both for Go to Line, without giving up the one the rest of Vista's documentation names. Each default list has the one key the command has today, or none.

The list is ordered, and its first key is the command's **main key**: the one shown wherever a single key fits, which is the palette, menus, tooltips, the title bar, and the start screen's and the empty frame's hints. Settings shows every key. A key added goes to the end, so the main key changes only when the user removes it, and the next key becomes the main one. Reordering keys by dragging was left out: removing and adding again does the same, and the order matters only for what a tooltip shows.

Rejected: one key per command. It cannot keep a familiar key alongside the default, and that case is the one the owner set for 0.0.4. Rejected: showing every key in tooltips and menus, which would widen them for the rare command with three keys.

Chords such as `Ctrl+K Ctrl+S` are not supported: they need a pending-key state shown somewhere, and Vista has fewer commands than free single keys.

## In Settings

Settings → Keyboard Shortcuts lists every command by category, including those with no key, so a command without one is found where the user looks for it, as the [core philosophy](workspaces.md#core-philosophy) requires of a list in Settings. A search field at the top filters the list by command name or by key, since the list grows from about twenty rows to about fifty, and a question such as "what does `Ctrl + L` do?" can't be answered by reading names.

Each row shows the command's name and its keys in order, each as a key cap, or `None` in a fainter colour. A row whose list differs from the default has a dot before its keys and the description `Default: {key}`, or `Default: none`.

- **Adding a key.** The **Add Shortcut** button at the row's right end, shown as the pointer rests on the row or the keyboard reaches it, adds a cell that says `Press a shortcut…`. The first allowed key pressed is added at once, applies everywhere, and is saved. Escape, a click elsewhere, or focus leaving the cell cancels without a change. Escape cannot be recorded, since it is how recording ends; Tab and Shift+Tab are not recorded either, since they move focus, so the keyboard never traps the user in the cell.
- **A refused key.** A key [Keys that are refused](#keys-that-are-refused) names keeps the cell recording and shows why below it, as in `The browser keeps Ctrl + N for itself.` A key the command already has is refused with `Go to Line already has Ctrl + L.`
- **A key already in use.** A key another command has shows `Ctrl + G is used by Go to Line.` below the cell, with **Replace** and **Cancel**. Replace adds the key to this command and removes it from Go to Line, which keeps its other keys; its row shows the change. Cancel keeps recording. Moving the key at once, with an **Undo** in a toast, was rejected, since a command the user wasn't looking at would lose a key; refusing the key until the user removes it elsewhere was rejected as tedious.
- **Removing a key.** Each key cap has a **Remove** button with the close icon, named `Remove Ctrl + G` for screen readers, shown as the pointer rests on the row or the keyboard reaches the cap.
- **Resetting.** The row's menu, beside Add Shortcut, has **Reset to Default** on a changed row. The section's header has **Reset All Shortcuts**, which asks `Reset all shortcuts to their defaults?` through the app's confirmation, since it can undo many choices at once.

While a key is being recorded, the window listener runs no command, so pressing `Ctrl + S` to record it does not save.

## Keys that are refused

A key is refused when it cannot work, or when binding it would break typing:

- **No modifier.** A key without Ctrl, Alt, or Cmd is refused, as is Shift alone with a key, because it would stop that character from being typed in any text field. F1 to F12 are the exception: they type nothing.
- **AltGr's keys.** `Ctrl+Alt` with a letter, digit, or symbol is refused, because Windows sends AltGr as Ctrl+Alt, and on many layouts AltGr types characters: on a Spanish keyboard AltGr+2 types `@`, and on a Brazilian one AltGr+Q types `/`. Binding `Ctrl+Alt+2` would make `@` impossible to type for those users. `Ctrl+Alt` with an arrow or F-key is allowed.
- **Keys the host keeps.** In the browser, keys the browser never hands to a page are refused: `Ctrl+N`, `Ctrl+Shift+N`, `Ctrl+T`, `Ctrl+Shift+T`, `Ctrl+W`, `Ctrl+Shift+W`, `Ctrl+Tab`, and `Ctrl+Shift+Tab`. The list is the shared app's, keyed by `adapter.platform`, since the app already chooses Close Tab's default that way. On the desktop nothing is refused for this reason; keys the system takes, such as `Alt+F4` or the Windows key's, never reach the window and so are never recorded.
- **Editor keys.** The keys of the commands with a `shortcutHint` are refused, as in `Ctrl + Z is Undo in the editor.`, for the reason [Which commands take keys](#which-commands-take-keys) gives.

Other keys CodeMirror or vim handle, such as vim's `Ctrl+R` for Redo, are allowed without a warning, and the command wins as it does today: the user chose the key. Warning about them was rejected, since it needs a list of every CodeMirror and vim key, which would go stale with each upgrade of either, and the editor keys that matter most are already refused.

A key is recorded from the physical key for letters and digits (`event.code`, as `KeyG` becomes `G`) and from `event.key` for the rest, so a shortcut recorded with Alt or Shift held matches the way [matching](#current-behavior) already does.

## Storage

The choices are stored with the other settings in `vista.settings`, as a `shortcuts` field that holds only the commands whose list differs from the default, each with its whole list: `"shortcuts": { "goto.line": ["Mod+G", "Mod+L"], "tabs.close": [] }`, where a key is the command's id and `[]` means no key. A command not listed has its default, so a later version that changes a default reaches every user who did not change that command. Storing the whole list, rather than keys added and removed, keeps the order that picks the main key, and a list equal to the default is removed from the field rather than stored.

The field falls back entry by entry, as [Editor settings](workspaces.md#editor-settings) describes for the others: an entry whose command does not exist or whose value is not an array is ignored, and within a list a key that is not a string, is refused, or appears earlier in the list is dropped, and the rest stay. An ignored entry is not removed from storage until the user next changes a shortcut, so a command a later build brings back still has its keys. A key in the lists of two commands stays with the first in the command list's order and is dropped from the other. The settings version stays `1`: the field is new and optional, and a missing one reads as no changes.

Each host keeps `vista.settings` in its own webview, so the browser and the desktop app have separate choices. That suits the [refused keys](#keys-that-are-refused), which differ between them. Syncing them would need an account or a file, and nothing else in Vista syncs.

Keeping the shortcuts in a store of their own, `vista.shortcuts`, was rejected: it would duplicate the settings store's reading, fallback, and failure handling for one more field.

## Applying the keys

A command's `shortcut` becomes `shortcuts`, a list. `AppShell` resolves each command's list from its default and the stored choices before building the command list, so the window listener, which runs the command any of whose keys matches, `reservedShortcuts`, which holds every key of every command, the palette, menus, and tooltips read the one resolved list as they read the fixed one today. The start screen's and the empty frame's hints, and the title bar's Go to File, read the main keys of their commands instead of the constants they use now, and a hint whose command has no key is not shown. A change applies at once, without a reload.

## Tests

- **Resolution.** Defaults, a changed list, an empty list, an unknown id, a value that is not an array, a refused or repeated key in a list, and one key in two commands' lists resolve as [Storage](#storage) describes, and a list equal to the default is not stored.
- **Refusal.** Each rule in [Keys that are refused](#keys-that-are-refused), for each platform, with a Spanish-layout `Ctrl+Alt+2` among the cases.
- **Recording.** Adding a key saves it and makes it run the command alongside the others, Escape cancels, a key in use asks before replacing and leaves the other command its other keys, a key the command has is refused, and recording `Ctrl + S` does not save.
- **Main key.** Removing the main key makes the next one main; the palette, a tooltip, a menu, and the start screen's hints show the main key.
- **The editor yields.** Every key of a command runs it in the raw editor, with vim on and off.
