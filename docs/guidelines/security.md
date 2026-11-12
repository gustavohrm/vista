---
status: APPROVED
last_updated: 2026-11-12
scope: How code keeps Vista's security commitments, for anyone writing or reviewing a change.
---

# Security guidelines

This document says how code handles untrusted input, the user's folders, and what leaves the device, so the same problem is solved the same way everywhere. Vulnerabilities are reported as [SECURITY.md](../../SECURITY.md) describes, never in a public issue.

Vista reads and writes folders the user grants it, and the notes and documents in them are private. [SECURITY.md](../../SECURITY.md#what-matters-most) states what Vista protects and where each boundary lives, and [Architecture](../architecture.md#platform-adapters) where host-specific code is kept. Where either of them and this document disagree, they win and this document is fixed.

Vista issues and stores no secrets: it has no accounts, sessions, or server-side state. A change that adds any of them adds the rules for them here first.

## Secrets

- **Secrets in the repository** do not exist. Configuration reads them from the environment or a secret store; examples use obvious placeholders.
- **Build-time variables** with the `VITE_` prefix are compiled into the browser bundle, so they are public. A secret never goes in one.
- **Random values** for anything security-relevant come from `crypto.getRandomValues`, never `Math.random`.

## Never in logs, errors, or messages

- Note and document content stays out of logs, error messages, and test snapshots. An error message names what failed, never the content involved.
- Logs go only to the local console. Today they include folder paths and file names, as [Errors](../specs/errors.md#logging) records; a change that sends a log or an error anywhere off the device is a decision, recorded first, and keeps paths and names out of what it sends.
- [Errors](../specs/errors.md#direction) proposes that the interface show a fixed message for an unexpected failure and leave the raw error to the console. Until it is approved, toasts show the error's own message.
- Where a leak would matter, a test proves it: it feeds known note content through the flow and asserts it never appears in what was logged, shown, or snapshotted.

## Untrusted input

- Every input crossing a trust boundary is validated at that boundary, before any other code sees it, and parsed into a typed value. What does not parse is rejected, not passed along.
- Every input has a size bound. New code that reads input enforces the bound during the read, such as by reading a stream that stops at the limit, rather than reading it whole and checking afterwards, when the memory is already spent. A size check before the read can reject a file early, but it is not the bound: another program can grow the file between the check and the read. File reads from the user's folder have no bound yet: a very large file is read whole into memory by both hosts' adapters.
- Files in the user's folder are untrusted input: the user or another program can edit them. So is state Vista stores, such as the settings in `localStorage`, which `packages/app/src/domain/settings.ts` reads field by field and replaces with the default where a field does not parse. A value read from either is checked as if it came from outside.
- A file or folder name the user types is checked against what the file system accepts, as `packages/app/src/domain/path-validation.ts` does, before any adapter sees it.
- Do not build a path by concatenating input. Resolve it through the adapter, which keeps it inside the granted folder.
- Do not build a command by concatenating input. Pass its arguments as an array, as `scripts/` does when it runs `git` and `gh` through `spawnSync`.
- Do not build HTML from input. Rendered Markdown and document content go through the editor's own rendering, never through `innerHTML` or `dangerouslySetInnerHTML`.

## Folder access and host permissions

- Shared code in `packages/app` reaches the user's files only through the contracts in `packages/app/src/ports.ts`. It never imports a host API.
- On the web, access comes only from a folder the user picks. Code never asks for more than the folder it was given.
- On desktop and mobile, `apps/native/src-tauri/capabilities/default.json` grants the dialog and filesystem permissions. A change that widens a capability, adds a plugin, or loosens the content security policy in `apps/native/src-tauri/tauri.conf.json` names it in its pull request.

## Outbound calls and dependencies

- Vista makes no network calls of its own. No telemetry, update checks, or third-party lookups without a recorded decision and a way for the user to turn them off.
- Every dependency is a trust decision. The rule in the [coding guidelines](code.md#architecture-and-design) on adding dependencies applies with extra force to anything that runs at install time, which `allowBuilds` in [Workspace](../workspace.md#dependency-installs) lists, or that handles file content.

## Reviewing a change

A change that touches any of the above names it in its pull request and adds or updates its tests. The [pull request template](../../.github/pull_request_template.md) carries the check. Ask:

- Does it add a way for untrusted input, such as a file from the user's folder, to reach the code? Is that input validated and bounded at the boundary?
- Does note content, a file name, or a path now reach a log, an error, or a snapshot?
- Does it widen a Tauri capability or permission, loosen the content security policy, or add an outbound call? Is that named in the pull request and tested?
- Can it reach a file outside the folder the user granted?
