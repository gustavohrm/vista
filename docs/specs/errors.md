---
status: DRAFT
last_updated: 2026-10-15
scope: How workspace failures are classified, presented to the user, and logged across the shared app and the web and native hosts.
---

# Errors

This document describes how failures move from the platform to the interface today, then proposes a direction. Sections marked **Current behavior** are facts from the code. Sections marked **Direction** are proposals for the owner to approve or change; they are not implemented.

## Current behavior

### Where failures originate

Failures are thrown from the host adapters, `apps/web/src/workspace-adapter.ts` and `apps/native/src/workspace-adapter.ts`. Two kinds of error reach the interface:

- **Vista-authored `Error`s** with fixed text, for example `"${name}" already exists.`, `File not found: ${path}`, `No native workspace root folder selected`, and the web permission message `Permission to write to this folder was not granted. Re-open the folder to try again.`
- **Platform errors passed through unchanged**, for example from `createWritable()` and `write()` on the web, and from the Tauri filesystem and dialog plugins on native. Nothing in the adapters wraps them.

The Rust host (`apps/native/src-tauri/src/lib.rs`) defines no commands and no error type. It only registers plugins, so every native file operation fails in TypeScript.

### How failures reach the user

`packages/app/src/app.tsx` wraps each file action (open, save, read, create, rename, delete, refresh, restore) in `try`/`catch`. Each handler:

1. calls `console.error("Failed to <action>:", err)`, and
2. shows `toast.show({ kind: "error", text })`, where `text` is `err.message` whenever `err instanceof Error`, and otherwise a fixed fallback such as `Failed to save ${name}.`.

So platform error text is shown to the user verbatim when the platform throws an `Error`. Nothing branches on the failure kind; no code matches on message text either.

Toasts use `@codenhub/toaster` through `ToastProvider` (`packages/app/src/components/feedback/toast.tsx`). The kinds in use are `error` and `info`.

### Outcomes that are not errors

- **Cancellation.** The web picker returns `null` on `AbortError`. The native `open()` resolves to `null` on cancel, and the native adapter returns `null` for it. Callers treat `null` as "nothing happened" with no toast.
- **Folder restore.** `restoreFolder` reports `restored`, `needs-permission`, `unavailable`, or `none` as values. `unavailable` shows the info toast `Couldn't reopen "{name}". It may have been moved or deleted.` (`app.tsx`).
- **Unsaved changes.** `saveActiveFile` returns `false` on failure, and the caller decides whether to continue.

### Deliberately swallowed failures

These are best-effort and log a warning instead of throwing:

- Reading, writing, and forgetting the last-opened folder, in both hosts (`localStorage` on native, IndexedDB on web). The write and forget functions' doc comments say "Failures are logged only"; the read functions log and treat a failure as nothing remembered.
- Skipping an unreadable subdirectory during the web tree scan (`console.warn`).
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
