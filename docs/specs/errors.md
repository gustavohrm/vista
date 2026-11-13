---
status: DRAFT
last_updated: 2026-11-13
scope: How workspace failures are classified, presented to the user, and logged across the shared app and the web and native hosts.
---

# Errors

This document describes how failures move from the platform to the interface today, then proposes a direction. Sections marked **Current behavior** are facts from the code. Sections marked **Direction** are proposals for the owner to approve or change; they are not implemented.

## Current behavior

### Where failures originate

Failures are thrown from the host adapters, `apps/web/src/workspace-adapter.ts` and `apps/native/src/workspace-adapter.ts`. Two kinds of error reach the interface:

- **Vista-authored `Error`s** with fixed text, for example `"${name}" already exists.`, `"${path}" was not found.`, `"{workspace}" is no longer open. Open the folder again.`, and the web permission message `Permission to write to this folder was not granted. Re-open the folder to try again.`
- **Platform errors passed through unchanged**, for example from `createWritable()` and `write()` on the web, and from the Tauri filesystem and dialog plugins on native. Nothing in the adapters wraps them.
- **`WorkspaceError`** (`packages/app/src/ports.ts`), a classified error carrying a `kind`. Its one kind so far is `conflict`: `writeFile` was given the version the app last read, and the file on disk no longer matches it or is gone.

The Rust host (`apps/native/src-tauri/src/lib.rs`) defines no commands and no error type. It only registers plugins, so every native file operation fails in TypeScript.

### How failures reach the user

`packages/app/src/app.tsx` wraps each file action (open, save, read, create, rename, delete, refresh, restore) in `try`/`catch`. Each handler:

1. calls `console.error("Failed to <action>:", err)`, and
2. shows `toast.show({ kind: "error", text })`, where `text` is `err.message` whenever `err instanceof Error`, and otherwise a fixed fallback such as `Failed to save ${name}.`.

So platform error text is shown to the user verbatim when the platform throws an `Error`. The one branch on a failure kind is the save conflict: `app.tsx` checks `err instanceof WorkspaceError && err.kind === "conflict"` and asks whether to overwrite, as [Changes on disk](workspaces.md#changes-on-disk) describes. No code matches on message text.

Toasts use `@codenhub/toaster` through `ToastProvider` (`packages/app/src/components/feedback/toast.tsx`). The kinds in use are `error` and `info`.

### Outcomes that are not errors

- **Cancellation.** The web picker returns `null` on `AbortError`. The native `open()` resolves to `null` on cancel, and the native adapter returns `null` for it. Callers treat `null` as "nothing happened" with no toast.
- **Folder restore.** `restoreFolder` reports `restored`, `needs-permission`, `unavailable`, or `none` as values. `unavailable` shows the info toast `Couldn't reopen "{name}". It may have been moved or deleted.` (`app.tsx`).
- **Opening a file.** `loadFile` (`packages/app/src/state/load-file.ts`) reports a file that is missing, over the size limit, or binary as a value, and each shows its own toast, as [Opening a file](workspaces.md#opening-a-file) describes. A file that isn't UTF-8 opens read-only with an info toast.
- **Unsaved changes.** `saveActiveFile` returns `false` on failure, and the caller decides whether to continue.

### Deliberately swallowed failures

These are best-effort and log a warning instead of throwing:

- Reading, writing, and forgetting the last-opened folder, in both hosts (`localStorage` on native, IndexedDB on web). The write and forget functions' doc comments say "Failures are logged only"; the read functions log and treat a failure as nothing remembered.
- An unreadable subfolder during a tree scan, in both hosts: it is logged with `console.warn` and shown in the tree marked as unreadable, so the user still sees it.
- Removing the native save's temporary file after a failed rename: the cleanup failure is logged with `console.warn`, and the rename's own error is what the user sees.
- Checking the tree and open tabs against the disk when the window regains focus: a failure is logged with `console.error` and shows no toast, because the user did not ask for the check and what is on screen is still usable. The next focus checks again.
- Falling back from `showDirectoryPicker` to the directory input after a non-cancel failure.
- Native restore, which probes the folder with `readDir` and forgets it on failure.
- Markdown editor create and destroy failures, which are logged with `console.error`.

Most of these carry a comment. Some, such as the `catch` in `readLastFolderPath`, do not.

### Logging

Failures are logged with `console.error` or `console.warn` and a fixed prefix. The logged values include folder paths and names (`relativePath`, `savedPath`, `handle.name`). File content is not logged. No logger abstraction exists.

## Direction

Proposals only. Each needs owner approval before it becomes a rule.

1. **Classify at the adapter boundary.** Adapters map platform errors to a small set of failure kinds. Proposed kinds: `permission-denied`, `not-found`, `already-exists`, `unsupported`, and `unknown`. Cancellation is not a kind; it stays a `null` or equivalent value. The mapping lives in the adapter, because only the adapter knows what `NotAllowedError` or a Tauri plugin error means.
2. **The interface never shows raw platform text.** The `unknown` kind shows a fixed message for the operation. The raw error goes to the console. This replaces the `err.message` fallback in `app.tsx`.
3. **The app package owns user-facing text.** Wording is keyed by kind and operation in `packages/app`. Adapters supply the kind and, where useful, a name such as the file name. Vista-authored messages in the adapters move out.
4. **Three parts per message.** Each message says what happened, why, and what to do next, in that order. For example: "Couldn't save notes.md. The folder doesn't allow changes. Re-open the folder and allow access when asked." A message that cannot name a next step should say so explicitly rather than omit it.
5. **Best-effort swallowing needs a comment.** Every deliberate swallow states why losing the failure is safe, and logs with `console.warn`. Sites without a comment are brought into line.
6. **Never log note content.** Logs may name an operation and a kind. Whether paths and file names may be logged is an open question for the owner; the current code logs them.
7. **One error type across the interface.** An error class carrying `kind` replaces message matching, so a future branch on failure kind does not parse text.
8. **Rust, when it has commands.** If Tauri commands are added, they return the same kinds through a Rust enum exported to TypeScript. Until then, no Rust error type is proposed.

## Open questions

- Whether file and folder names may appear in logs.
- Whether the three-part message rule applies to info toasts as well as errors.
- Whether `unknown` should offer a retry action.
