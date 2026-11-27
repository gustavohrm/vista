---
status: IMPLEMENTED
last_updated: 2026-11-26
scope: How workspace failures are classified, presented to the user, and logged across the shared app and the web and native hosts.
---

# Errors

This document describes how workspace failures move from the platform to the interface, and how they are classified, worded, and logged. It is implemented.

## Failure kinds

A failed workspace operation has one kind: `permission-denied`, `not-found`, `already-exists`, `unsupported`, `conflict`, or `unknown`. `conflict` is the save conflict [Changes on disk](workspaces.md#changes-on-disk) describes. A folder that is no longer open in this session is `not-found`, since what the user does next is the same: open it again. Cancellation is not a kind; it stays a `null` or equivalent value, and shows nothing.

The interface branches on the kind and never on message text, so wording a message differently or translating it cannot change behavior. Rejected: matching on message text, which breaks the first time a platform or a translation words the same failure differently.

## Classifying at the adapter boundary

The adapter decides the kind, because only it knows what a `NotAllowedError` or a Tauri plugin error means. Every failure that leaves an adapter is a `WorkspaceError` (`packages/app/src/ports.ts`) carrying its kind, with the platform's error as its `cause`:

- A failure the adapter detects itself, such as a name already taken or a folder no longer open, is thrown as a `WorkspaceError` of that kind. Its message describes the failure for the console and is never shown.
- A platform error is classified through `@codenhub/error`. `packages/app` registers each kind as a code, and each adapter adds the platform failures it recognizes as aliases of those codes: error names on the web, such as `NotAllowedError` for `permission-denied`, and the operating-system error in a Tauri plugin message on the desktop. An alias names a kind without wording it, so both adapters report the same failure the same way. A platform error no alias matches is `unknown`. Each adapter's list is in its `platform-failures.ts`, and `classifyWorkspaceFailures` (`packages/app/src/domain/workspace-errors.ts`) wraps the adapter's workspace capability so that every rejection leaving it is classified.

Rejected: classifying in the shared app, which would need it to know each platform's errors and break the rule that `packages/app` stays host-free.

The Rust host (`apps/native/src-tauri/src/lib.rs`) defines no commands and no error type. It only registers plugins, so every native file operation fails in TypeScript, where the desktop adapter classifies it.

## What the user sees

The interface never shows a platform's text. The app shows its own message, from the dictionaries, keyed by the operation that failed and the failure's kind, and the raw error goes to the console. Each file action in `packages/app/src/app.tsx` catches its failure, logs it with `console.error`, and shows an error toast built by `failureText`: the operation's sentence, under `failures.operations` in the dictionaries, followed by the kind's, under `failures.reasons`. A value that is not a `WorkspaceError` reads as `unknown`. The save conflict is the one kind the app branches on rather than words: it asks whether to overwrite, as [Changes on disk](workspaces.md#changes-on-disk) describes. A platform's text cannot be translated and can name internals the user cannot act on.

Each failure message says what happened, why, and what to do next, in that order: "Couldn't save notes.md. Vista isn't allowed to change this folder. Open the folder again and allow access when asked." A message that cannot name a next step says so rather than leave it out. The operation part names the file or folder where there is one; the kind part words the reason and the next step, so a kind reads the same whichever operation hit it. Each part is one or two whole sentences, so joining them never splits a sentence across translations, as [Languages](languages.md#writing-translations) requires. Failures that are not workspace operations, such as checking for or installing an update, have whole messages of their own in the same group.

The rule applies to failures, not to info toasts such as a folder that couldn't be reopened: those report an outcome the user does not have to act on, and holding them to three sentences only makes them longer.

An `unknown` failure offers no retry action. Retrying is safe for some operations and not others, as a save that half-ran shows, and repeating the action by hand is as quick; the message says to try again.

Toasts use `@codenhub/toaster` through `ToastProvider` (`packages/app/src/components/feedback/toast.tsx`). The kinds in use are `error` and `info`.

## Outcomes that are not errors

- **Cancellation.** The web picker returns `null` on `AbortError`. The native `open()` resolves to `null` on cancel, and the native adapter returns `null` for it. Callers treat `null` as "nothing happened" with no toast.
- **Folder restore.** `restoreFolder` reports `restored`, `needs-permission`, `unavailable`, or `none` as values. An `unavailable` folder stays in its workspace, marked missing on its root row, as [Reopening at startup](workspaces.md#reopening-at-startup) describes; a workspace none of whose folders can be reopened, and none waiting for permission, does not open; when at least one of them is `unavailable`, it shows the info toast `Couldn't reopen "{name}". It may have been moved or deleted.`, or `Couldn't reopen "{workspace}". Its folders may have been moved or deleted.` when it has several folders (`app.tsx`). A workspace whose folders all report `none` shows no toast while it reopens at startup, where nothing was asked for; opened by choice, as from the switcher or its page in Settings, it shows the toast naming the workspace, since nothing else would say why the click did nothing.
- **Opening a file.** `loadFile` (`packages/app/src/state/load-file.ts`) reports a file that is missing, over the size limit, or binary as a value, and each shows its own toast, as [Opening a file](workspaces.md#opening-a-file) describes. A file that isn't UTF-8 opens read-only with an info toast.
- **Unsaved changes.** `saveActiveFile` returns `false` on failure, and the caller decides whether to continue.

## Swallowed failures

A deliberate swallow carries a comment saying why losing the failure is safe, and logs with `console.warn`. These are best-effort:

- Reading and writing the remembered folders, in both hosts (`vista.folders` in `localStorage` on native, the `folders` store in IndexedDB on web): a read that fails is treated as nothing remembered.
- An unreadable subfolder during a tree scan, in both hosts: it is shown in the tree marked as unreadable, so the user still sees it.
- Removing the native save's temporary file after a failed rename: the rename's own error is what the user sees.
- Checking the tree and open tabs against the disk when the window regains focus: no toast, because the user did not ask for the check and what is on screen is still usable. The next focus checks again.
- Checking whether a tab from the last session still exists: the tab is kept, and reading it when it is shown reports the problem.
- Forgetting a folder no workspace uses any more: the host keeping a record of it is harmless.
- Looking up the folder names of a recent workspace: the entry still opens, without its folder names.
- Falling back from `showDirectoryPicker` to the directory input after a non-cancel failure.
- Native restore, which probes the folder with `readDir` and reports the folder `unavailable`. The remembered path is kept.
- Destroying the Markdown editor, which is leaving the screen.

A failure to create the Markdown editor is logged with `console.error` and not swallowed as safe: it can only come from a defect, and the error is what reports it.

## Logging

Logs stay on the local console, as [Security](../guidelines/security.md) requires. A log may name the operation, the kind, and the file and folder names and paths involved, because a log that cannot say which file failed cannot be acted on, and a name is far less sensitive than what the file holds. A log never includes note content. Rejected: keeping names out of logs, which leaves a failure in a workspace of many files undiagnosable for a gain the local console does not need. Failures are logged with `console.error`, or `console.warn` for a swallow, and a fixed prefix. No logger abstraction exists.

## Rust, when it has commands

If Tauri commands are added, they return the same kinds through a Rust enum exported to TypeScript. Until then, the Rust host has no error type.
