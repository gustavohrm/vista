# Contributing

This document defines the contributor workflow, from a working tree through validation and review. It applies to maintainers, contributors, and AI agents.

[Documentation](docs/README.md) maps the architecture, guidelines, and specifications. [Tooling](docs/tooling.md) describes the commands below. [Agent instructions](AGENTS.md) contain agent-specific behavior and context guidance. Vulnerabilities are reported privately, as [`SECURITY.md`](SECURITY.md) describes.

## Setup

Vista is a pnpm workspace. You need:

- Node and pnpm at the versions the repository pins. With `nvm`, `nvm use` reads `.nvmrc`; pnpm installs the version `packageManager` names. An install outside the `engines` range fails rather than warns (`.npmrc` sets `engine-strict`).
- For the native desktop and mobile host, Rust through `rustup`. `rust-toolchain.toml` pins the version, and rustup installs it, with `clippy` and `rustfmt`, the first time cargo runs here.
- For the native host, [Tauri's prerequisites](https://tauri.app/start/prerequisites/) for your platform.

Then:

```sh
nvm use
pnpm install
pnpm dev:web
```

Use `pnpm dev:native` for the Tauri host. `pnpm install` also points git at `.githooks/` through `core.hooksPath` (the `prepare` script), so the hooks described below start working after the first install and not before. If `core.hooksPath` already points somewhere else, the install stops and asks for it to be reconciled. [CI](docs/ci.md) covers why the versions are pinned where they are.

## Changes

- Keep each change within its requested scope and preserve unrelated work.
- Applicable coding standards, specifications, and APPROVED or IMPLEMENTED documentation govern the change. Existing code may lag those contracts; conflicts and exceptions are resolved under the documentation guidelines.
- Update affected documentation in the same change when behavior, architecture, workspace exports, conventions, or platform rules change. Each contract has one owning document; references point to that owner rather than repeat its requirements.
- Do not commit secrets, build artifacts, or unrelated changes.

## Issues

Defects and requests are tracked as GitHub issues, opened through the bug and feature forms in `.github/ISSUE_TEMPLATE`. Blank issues are disabled. A vulnerability is the exception: report it privately as [`SECURITY.md`](SECURITY.md) describes.

Each issue carries one label from each group that applies:

| Group     | Labels                            | Says                                 |
| --------- | --------------------------------- | ------------------------------------ |
| `type:`   | `bug`, `feature`, `docs`, `chore` | What kind of work it is              |
| `status:` | `needs-triage`, `blocked`         | Why it is not moving, when it is not |

The bug and feature forms apply `type:bug` or `type:feature` and `status:needs-triage` themselves. `.github/labels.json` holds the full list. After editing it, run `node scripts/sync-labels.mjs` with an authenticated `gh` for this repository. The script creates or updates each label and never deletes one; a label on GitHub that the list no longer has is printed for a maintainer to remove by hand.

### A defect found mid-task

A defect hit while working on something else is filed and worked around, not fixed on the spot. Fixing it in place mixes two subjects in one branch, for the reason the [commit](#atomic-commits) and [pull request](#pull-requests) rules already reject.

File it with what triage needs:

```sh
gh issue create --title "<what is wrong>" --label "type:bug,status:needs-triage" --body "<what happened, what was expected, and the workaround>"
```

Then mark the workaround where it lives, naming the issue in full so the reference is unambiguous wherever it is read:

```ts
// Workaround for gustavohrm/vista#123: <what it works around>.
```

Once the fix lands, searching for `gustavohrm/vista#123` finds every workaround to remove. A defect with no workaround blocks the task; say so, and the fix goes first, in its own pull request.

Opening an issue is outward-facing. An agent drafts it and asks before filing, as it does before pushing.

## Branches

Work happens on a branch. Do not commit to `main`.

`main` is the branch CI verifies on every push, so a commit that lands there directly is one nobody reviewed. A pre-push hook refuses to push to it, and GitHub's branch protection refuses it too, for admins as well ([CI](docs/ci.md#branch-protection)).

The exception is real but narrow: it takes an explicit request from a maintainer, in the moment, for that specific commit. Because protection is enforced for admins, the exception means lifting it for that push and restoring it straight after. An agent must ask and be told yes. Neither a general instruction to "just fix it" nor a previous approval carries over to the next commit.

Name the branch `<type>/<slug>`, where `<type>` is the [commit type](#type) of the work and `<slug>` is kebab-case. A version in the slug keeps its dots.

```
feat/tab-search
fix/slot-eviction-order
docs/page-observation-dialogs
chore/repo-foundation
```

Every pushed branch follows the pattern, whoever or whatever created it. A tool that names its own branches, such as `claude/agent-branch-naming-03bee5` or `codex/fix-build-order`, does not make an exception: rename the branch with `git branch -m <type>/<slug>` before its first push. The `pre-push` hook refuses any other name.

## Commits

Commits follow [Conventional Commits](https://www.conventionalcommits.org):

```
<type>(<scope>)!: <subject>

<body>

<trailers>
```

A `commit-msg` hook checks the shape of the subject line. It cannot check whether the message is honest, which is the part that matters.

### Type

One of `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `style`, `test`.

### Scope

The area the change lands in, and optional. For workspace projects, use the app or package name without the `@vista/` prefix:

- `app` for the shared UI shell and product features (`packages/app`)
- `web` for the browser host and Cloudflare deployment scaffold (`apps/web`)
- `native` for the Tauri desktop and mobile host (`apps/native`)

Repository-level areas use their own name, such as `ci`, `hooks`, `docs`, `deps`. Leave the scope out when the change spans several.

### Subject

Imperative mood, lowercase, no trailing period: "add", not "added" or "Adds". Aim for 50 characters and stay within 72 characters, which the hook enforces.

Describe what the change does for someone reading the log later, not which files moved. `feat(app): add markdown note editor` or `fix(web): handle permission revocation gracefully` says what happens; `fix(web): update adapter.ts` says nothing a diff would not.

Append `!` after the scope for a change that breaks a contract, such as the format of persisted settings or folder metadata, and describe what breaks in the body.

### Body

Optional. Write one when the reason for the change is not obvious from the subject, and use it for why over what; the diff already carries the what.

### Atomic commits

One commit does one thing. A reviewer should be able to read the subject and know what is in the commit before opening it.

Split by intent, not by file count. Moving a function and changing its behavior are two commits even when they touch one file; renaming a symbol across twenty files is one commit. If a subject needs "and" to be accurate, that is usually two commits.

Formatting churn, unrelated fixes, and drive-by refactors are their own commits or their own pull request. Never bundle them into a behavior change: they make the real change unreviewable.

### Co-authorship

A commit an AI agent wrote or substantially shaped MUST carry a `Co-authored-by` trailer naming the **model**, not the tool or harness it ran in:

```
Co-authored-by: Claude Opus 5 <noreply@anthropic.com>
```

The model is what produced the change, and it is what someone auditing the history needs to know. Use the model vendor's no-reply address when it publishes one.

The human directing the work stays the commit author. The trailer is an addition to authorship, never a replacement for it.

## Validation

Run scripts from the repository root. During development, narrow checks to the package you changed with `pnpm --filter=@vista/<name> <script>`, and do not change into a package directory to run its scripts.

Before delivering a change, run the whole gate:

```sh
pnpm verify
```

Report any step that was skipped or failed. [Tooling](docs/tooling.md) documents what `pnpm verify` runs and the narrower commands.

## Pull requests

Every change reaches `main` through a pull request, using the template in `.github/pull_request_template.md`. [CI](docs/ci.md) runs two jobs on every pull request: `Web`, on Ubuntu, covers formatting, linting, typecheck, tests, the web build, and end-to-end tests; `Rust`, on Windows, covers the native layer's formatting, linting, and tests.

Pushing a branch and opening a pull request are outward-facing actions. An agent asks first and does neither on its own initiative.

Keep a pull request to one subject. A branch that fixes a bug and also restructures a doc is two pull requests, for the same reason a commit that does both is two commits.

A pull request that resolves an issue says `Fixes #123` in its description, so merging it closes the issue.

## Deployment and releases

Vista is an end-user application, not a set of published npm packages.

- **Web App**: Cloudflare Workers hosting is approved for the web app (`apps/web`). Deployment is performed via `pnpm deploy:web` or automated CI when publication is enabled in the future.
- **Desktop and Mobile App**: The native app (`apps/native`) produces desktop executables and mobile packages via Tauri (`build:desktop`, `build:android`, `build:ios`). App store distribution, code signing, and release packaging are handled at release milestones.

Deploying or publishing releases are outward-facing actions. An agent asks first and never triggers deployments on its own initiative.

## Hooks

Three hooks run locally, all from `.githooks/`. `pre-commit` and `pre-push` delegate their git checks to `scripts/check-git-state.mjs`, which holds the branch and tree rules; `commit-msg` checks the subject line itself.

| Hook         | Checks                                                                                                                                                                                                                                                                                                                |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pre-commit` | Refuses commits on `main` or a detached HEAD, and refuses while there are untracked files, unstaged changes, or unresolved conflicts. Then runs `pnpm format:check` and `pnpm lint:check`, which report and do not fix.                                                                                               |
| `commit-msg` | The subject line shape described above: a type, an optional scope, an optional `!`, a colon, a subject of 72 characters or fewer that does not start with a capital and does not end with a period. Merge, revert, `fixup!`, `squash!`, and `amend!` subjects are exempt, since git writes them rather than a person. |
| `pre-push`   | Refuses any update or deletion of `main`, and any push of a commit other than the one checked out. Refuses a branch name that does not match `<type>/<slug>`, though a deletion of a misnamed branch passes. Requires a clean working tree, including untracked files.                                                |

`--no-verify` bypasses them. It is for the commit that genuinely has to land unfixed, and an agent that reaches for it MUST say so in the same breath rather than quietly routing around a failing check. [Tooling](docs/tooling.md#git-hooks) describes what each hook does and why it does no more than that.
