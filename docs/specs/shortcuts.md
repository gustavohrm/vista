---
status: DRAFT
last_updated: 2026-11-26
scope: Customizable keyboard shortcuts, which commands can be given a key, how a key is recorded, removed, and reset in Settings, which keys are refused, how a key already in use is handled, and how the choice is stored and shown.
---

# Keyboard shortcuts

This document makes Vista's keyboard shortcuts customizable. Sections marked **Current behavior** are facts from the code. Sections marked **Direction** are proposals for the owner to approve or change; they are not implemented. [Open questions](#open-questions) lists the choices the direction leaves to the owner.

## Current behavior

Every shortcut is fixed in code. [Commands and shortcuts](../architecture.md#commands-and-shortcuts) describes the mechanism: each action is a `Command` built in `AppShell` (`packages/app/src/app.tsx`), and a command has either a `shortcut`, which one window `keydown` listener (`useCommandShortcuts`) binds, or a `shortcutHint`, a key an editor handles itself, which menus show but the app does not bind.

- **Bound keys.** Save (`Mod+S`), Close Tab (`Mod+W` on the desktop, `Alt+W` in the browser, which keeps `Ctrl+W` for itself), Find (`Mod+F`), Replace (`Mod+H`), Go to File (`Mod+P`), Show All Commands (`Mod+Shift+P`), Go to Line (`Mod+G`), Word Wrap (`Alt+Z`), and Settings (`Mod+,`).
- **Editor keys.** Undo, Redo, Cut, Copy, Paste, Select All, and the Selection commands carry a `shortcutHint`. The raw editor's CodeMirror keymap, and vim when it is on, handle them, and the browser handles them in every other text field. The rendered Markdown editor has keymaps of its own.
- **No key.** Every other command, such as Save All, New File, Next Tab, or Vim Mode, has no key; the palette and menus reach it.
- **The editor yields.** The raw editor receives every bound shortcut as `reservedShortcuts` and ignores a key that matches one, so a command wins over a CodeMirror or vim binding on the same key.
- **Matching.** A shortcut is written as `+`-joined modifiers and one key, such as `Mod+Shift+S`, where `Mod` is Ctrl or Cmd. A letter matches the typed character or, when Alt or Shift changed it, the physical key (`event.code`), so `Alt+Z` works on layouts where Alt+Z types another character.
- **Display.** `formatShortcut` writes `Ctrl + Shift + S` wherever a key shows: the title bar, the palette, menus, tooltips, the start screen and the empty frame's hints, and Settings → Keyboard Shortcuts, which lists every command that has a key, bound or hinted, as a read-only table. Key names are not translated, as [Languages](languages.md#what-is-not-translated) records.

## Direction

Proposals only. Each needs owner approval before it becomes a rule.

### Which commands take a key

Every command can be given a key, removed from its key, or reset, except the commands that carry a `shortcutHint`. Those stay as they are and show in the list without the controls, with the description `The editor handles this key.`

The editor commands are left out because binding their key in the app would take it from every text field: a rebound `Ctrl+C` would stop copying in the find bar, the rename field, and the go-to picker. Remapping the editor's own keymap instead is a different feature, with its own conflicts with vim, and nobody has asked for it.

Commands that have no key today are included. They are most of the commands, and giving one a key, such as `Ctrl + Tab` for Next Tab on the desktop, is the most common reason to want this at all.

Each command has at most one key. A command with two keys, as some editors allow, doubles every display of a shortcut, from tooltips to the palette, for a case the user can already cover by choosing the key they prefer. Chords such as `Ctrl+K Ctrl+S` are not supported either: they need a pending-key state shown somewhere, and Vista has fewer commands than free single keys.

### In Settings

Settings → Keyboard Shortcuts lists every command by category, including those with no key, so a command without one is found where the user looks for it, as the [core philosophy](workspaces.md#core-philosophy) requires of a list in Settings. A search field at the top filters the list by command name or key, since it grows from about twenty rows to about fifty.

Each row shows the command's name and its key, or `None` in a fainter colour. A changed key has a dot before it and the description `Default: {key}`, or `Default: none`.

- **Changing a key.** Pressing the key cell, or Enter on it, turns it into `Press a shortcut…`. The first allowed key pressed becomes the command's key at once, applies everywhere, and is saved. Escape, a click elsewhere, or focus leaving the cell cancels without a change. Escape cannot be recorded, since it is how recording ends; Tab and Shift+Tab are not recorded either, since they move focus, so the keyboard never traps the user in the cell.
- **A refused key.** A key [Keys that are refused](#keys-that-are-refused) names keeps the cell recording and shows why below it, as in `The browser keeps Ctrl + N for itself.`
- **A key already in use.** See [Open questions](#open-questions), item 1. The proposal: the cell shows `Ctrl + G is used by Go to Line.` with **Replace** and **Cancel**. Replace gives the key to this command and leaves Go to Line with none, which its row then shows.
- **Removing and resetting.** Each row has a menu at its right end, shown as the pointer rests on the row or the keyboard reaches it, with **Change Shortcut**, **Remove Shortcut**, and **Reset to Default**, the last one only on a changed row. The section's header has **Reset All Shortcuts**, which asks `Reset all shortcuts to their defaults?` through the app's confirmation, since it can undo many choices at once.

While a key is being recorded, the window listener runs no command, so pressing `Ctrl + S` to record it does not save.

### Keys that are refused

A key is refused when it cannot work, or when binding it would break typing:

- **No modifier.** A key without Ctrl, Alt, or Cmd is refused, as is Shift alone with a key, because it would stop that character from being typed in any text field. F1 to F12 are the exception: they type nothing.
- **AltGr's keys.** `Ctrl+Alt` with a letter, digit, or symbol is refused, because Windows sends AltGr as Ctrl+Alt, and on many layouts AltGr types characters: on a Spanish keyboard AltGr+2 types `@`, and on a Brazilian one AltGr+Q types `/`. Binding `Ctrl+Alt+2` would make `@` impossible to type for those users. `Ctrl+Alt` with an arrow or F-key is allowed.
- **Keys the host keeps.** In the browser, keys the browser never hands to a page are refused: `Ctrl+N`, `Ctrl+Shift+N`, `Ctrl+T`, `Ctrl+Shift+T`, `Ctrl+W`, `Ctrl+Shift+W`, `Ctrl+Tab`, and `Ctrl+Shift+Tab`. The list is the shared app's, keyed by `adapter.platform`, since the app already chooses Close Tab's default that way. On the desktop nothing is refused for this reason; keys the system takes, such as `Alt+F4` or the Windows key's, never reach the window and so are never recorded.
- **Editor keys.** The keys of the commands with a `shortcutHint` are refused, as in `Ctrl + Z is Undo in the editor.`, for the reason [Which commands take a key](#which-commands-take-a-key) gives. Other keys CodeMirror or vim handle, such as vim's `Ctrl+R`, are allowed, and the command wins as it does today; see [Open questions](#open-questions), item 2.

A key is recorded from the physical key for letters and digits (`event.code`, as `KeyG` becomes `G`) and from `event.key` for the rest, so a shortcut recorded with Alt or Shift held matches the way [matching](#current-behavior) already does.

### Storage

The choices are stored with the other settings in `vista.settings`, as a `shortcuts` field that holds only what differs from the defaults: `"shortcuts": { "goto.line": "Mod+L", "tabs.close": null }`, where a key is the command's id, a string is its key, and `null` means removed. A command not listed has its default, so a later version that changes a default reaches every user who did not change that command.

The field falls back entry by entry, as [Editor settings](workspaces.md#editor-settings) describes for the others: an entry whose command does not exist, whose value is not a string or `null`, or whose key is refused is ignored, and the rest stay. An ignored entry is not removed from storage until the user next changes a shortcut, so a command a later build brings back still has its key. Two entries with the same key keep the first in the list's command order and ignore the other. The settings version stays `1`: the field is new and optional, and a missing one reads as no changes.

Each host keeps `vista.settings` in its own webview, so the browser and the desktop app have separate choices. That suits the [refused keys](#keys-that-are-refused), which differ between them. Syncing them would need an account or a file, and nothing else in Vista syncs.

Keeping the shortcuts in a store of their own, `vista.shortcuts`, was rejected: it would duplicate the settings store's reading, fallback, and failure handling for one more field.

### Applying the keys

`AppShell` resolves each command's key from its default and the stored choices before building the command list, so the window listener, `reservedShortcuts`, the palette, menus, and tooltips read the one resolved list as they read the fixed one today. The start screen's and the empty frame's hints, and the title bar's Go to File, read the resolved keys of their commands instead of the constants they use now, and a hint whose command has no key is not shown. A change applies at once, without a reload.

### Tests

- **Resolution.** Defaults, a changed key, a removed key, an unknown id, a refused stored key, and two entries with the same key resolve as [Storage](#storage) describes.
- **Refusal.** Each rule in [Keys that are refused](#keys-that-are-refused), for each platform, with a Spanish-layout `Ctrl+Alt+2` among the cases.
- **Recording.** Recording a key saves it and runs it, Escape cancels, a key in use asks before replacing, and recording `Ctrl + S` does not save.
- **Display.** A changed key shows in the palette, a tooltip, a menu, and the start screen's hints.
- **The editor yields.** A key given to a command in the raw editor runs the command, with vim on and off.

## Open questions

1. **A key already in use.** Pressing `Ctrl + G` for Go to File, when Go to Line has it. (a) Ask, with **Replace** and **Cancel**, and move the key on Replace: one more step, but nothing changes without the user seeing it. (b) Move it at once and say so in a toast with **Undo**: faster, but a key can vanish from a command the user wasn't looking at. (c) Refuse it until the other command's key is removed: simplest to build, and tedious to use. Recommendation: (a).
2. **Keys CodeMirror or vim already use.** Binding `Ctrl+R` to a command takes vim's Redo while vim is on, and `Ctrl+D` takes the raw editor's Add Next Occurrence, though that one is refused as an editor key. (a) Allow it, the command winning as it does today, with no warning: the user chose the key. (b) Warn, which needs a list of every CodeMirror and vim key kept in step with both packages. Recommendation: (a), since the list in (b) would go stale with each upgrade, and the editor commands that matter most are already refused.
3. **The search field in the list.** It is new surface for a list of about fifty rows grouped by category. Recommendation: keep it, since finding a command by its key, as in "what is `Ctrl + L`?", is not possible by reading names.
