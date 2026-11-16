---
status: APPROVED
last_updated: 2026-11-16
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
- Every input has a size bound. New code that reads input enforces the bound during the read: an input of exactly the limit is accepted, and once the read finds more than the limit, it stops and the input is rejected, never truncated and parsed as if it were whole. Reading at most `limit + 1` bytes and rejecting when the extra byte exists is enough; a reader that works in chunks of a fixed maximum size can stop at the first chunk that crosses the limit, but not one that takes chunks of any size a stream hands it. Checking the size after reading the whole input is too late, because the memory is already spent. A size check before the read can reject a file early, but it is not the bound: another program can grow the file between the check and the read. File reads from the user's folder fall short of this rule: opening a file checks its size against **Largest file to open** before reading and rejects it after reading when it grew, as [Opening a file](../specs/workspaces.md#opening-a-file) describes, but both hosts' adapters read the file whole, so a file that grew in between is in memory before it is refused.
- Files in the user's folder are untrusted input: the user or another program can edit them. So is state Vista stores, such as the settings in `localStorage`, which `packages/app/src/domain/settings.ts` reads field by field and replaces with the default where a field does not parse. A value read from either is checked as if it came from outside.
- A file or folder name the user types is checked against what the file system accepts, as `packages/app/src/domain/path-validation.ts` does, before any adapter sees it.
- Do not build a path by concatenating input. Resolve it through the adapter, which keeps it inside the granted folder.
- Do not build URLs or redirects from values a client controls, such as the `Host` or `X-Forwarded-*` headers. The Worker builds its release URLs and download redirects from `PUBLIC_ORIGIN`, set in `apps/web/wrangler.json`.
- Do not build a command by concatenating input. Pass its arguments as an array to a call that runs no shell: with `shell: true`, Node.js joins the array into a shell command line, so a metacharacter in an argument runs as a command. `scripts/` runs `gh` this way, through `spawnSync` with `shell: false`.
- Do not build HTML from input. Rendered Markdown and document content go through the editor's own rendering, never through `innerHTML` or `dangerouslySetInnerHTML`.

## Folder access and host permissions

- Shared code in `packages/app` reaches the user's files only through the contracts in `packages/app/src/ports.ts`. It never imports a host API.
- On the web, access comes only from a folder the user picks. Code never asks for more than the folder it was given.
- An adapter that writes a file in place writes the new content to a temporary file in the same folder and renames it over the original, so a crash or a full disk during the write leaves the old file whole rather than truncated. The temporary file shares the folder because only a rename within one file system replaces a file in a single step. It is created exclusively, under a name no other file has, so it never writes through a file that was already there, and it carries over as much of the original's permissions as the platform allows. A symbolic link is the exception: a rename would replace the link with a regular file, so the adapter writes through it in place, without the temporary file's protection. [Workspaces](../specs/workspaces.md#platform-specific-implementations) records how each host saves, and which permissions a save can lose on each platform.
- On desktop and mobile, `apps/native/src-tauri/capabilities/default.json` grants the dialog and filesystem permissions. A change that widens a capability, adds a plugin, or loosens the content security policy in `apps/native/src-tauri/tauri.conf.json` names it in its pull request.

## Web host responses

- Every response from the web host carries the security headers in `apps/web/src/security-headers.ts`, including the content security policy. Cloudflare serves the static app without running the Worker, so `apps/web/src/public/_headers` sets the same headers on it, and the Worker sets them on its own responses; a unit test fails when the two differ. A route never loosens them.
- No inline script. Inline styles are allowed because the editors inject their own `<style>` elements. Images may come from any HTTPS origin, because a note's web images load in the browser, as [Workspaces](../specs/workspaces.md) records.
- Every end-to-end test fails on a content security policy violation, so a change that needs a looser policy finds out before it ships. Loosening the policy names it in the pull request.

## Outbound calls and dependencies

- Vista makes no network calls of its own, except the desktop update check below. No telemetry, update checks, or third-party lookups without a recorded decision and a way for the user to turn them off.
- **Exception, temporary: the desktop update check.** The desktop app asks `https://vista.coden.dev/releases/latest.json` for a newer version at every startup (`checkForUpdates` in `packages/app/src/app.tsx`), and the user cannot turn it off. It breaks the rule above in the desktop host only; the web host makes no such call. It is tolerated for now because it reaches only Vista's own release host, sends nothing but the request itself, and installs nothing without the user's confirmation and a valid signature. It is to be fixed by making update checks opt-in, as the [roadmap](../roadmap.md) records; this exception is removed in that change.
- Every dependency is a trust decision. The rule in the [coding guidelines](code.md#architecture-and-design) on adding dependencies applies with extra force to anything that runs at install time, which `allowBuilds` in [Workspace](../workspace.md#dependency-installs) lists, or that handles file content.

## Reviewing a change

A change that touches any of the above names it in its pull request and adds or updates its tests. The [pull request template](../../.github/pull_request_template.md) carries the check. Ask:

- Does it add a way for untrusted input, such as a file from the user's folder, to reach the code? Is that input validated and bounded at the boundary?
- Does note content, a file name, or a path now reach a log, an error, or a snapshot?
- Does it widen a Tauri capability or permission, loosen either content security policy, the desktop app's or the web host's, or add an outbound call? Is that named in the pull request and tested?
- Can it reach a file outside the folder the user granted?
