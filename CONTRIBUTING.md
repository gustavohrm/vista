# Contributing

This document defines the contributor workflow, from a working tree through validation, review, and release. It applies to maintainers, contributors, and AI agents.

[Documentation](docs/README.md) maps the architecture, guidelines, and specifications. [Tooling](docs/tooling.md) describes the commands below. [Agent instructions](AGENTS.md) contain agent-specific behavior and context guidance. Vulnerabilities are reported privately, as [`SECURITY.md`](SECURITY.md) describes.

## Setup

Vista is a pnpm workspace. You need:

- Node at the version `.nvmrc` pins. With `nvm`, `nvm install` reads it, downloads that version when it is missing, and switches to it.
- pnpm on the `PATH`, installed apart from Node with the standalone script in [pnpm's installation guide](https://pnpm.io/installation), not through `npm` or Corepack; [Tooling](docs/tooling.md#setup) says why. It switches itself to the version `packageManager` names. An install outside the `engines` range fails rather than warns (`pnpm-workspace.yaml` sets `engineStrict`).
- For the native desktop and mobile host, Rust through `rustup`. `rust-toolchain.toml` pins the version, and rustup installs it, with `clippy` and `rustfmt`, the first time cargo runs here.
- For the native host, [Tauri's prerequisites](https://tauri.app/start/prerequisites/) for your platform.

Then:

```sh
nvm install
pnpm install
pnpm dev:web
```

Use `pnpm dev:native` for the Tauri host. `pnpm install` also points git at `.githooks/` through `core.hooksPath` (the `prepare` script), so the hooks described below start working after the first install and not before. [CI](docs/ci.md) covers why the versions are pinned where they are.

## Changes

- Keep each change within its requested scope and preserve unrelated work.
- Applicable coding standards, specifications, and APPROVED or IMPLEMENTED documentation govern the change. Existing code may lag those contracts; conflicts and exceptions are resolved under the [documentation guidelines](docs/guidelines/documentation.md).
- Update affected documentation in the same change when behavior, architecture, workspace exports, conventions, platform rules, or decisions change. Each contract has one owning document; references point to that owner rather than repeat its requirements.
- Do not commit secrets, `.env` or `.dev.vars` files, build artifacts, or unrelated changes.

## Issues

Defects and requests are tracked as GitHub issues, opened through the bug and feature forms in `.github/ISSUE_TEMPLATE`. Blank issues are disabled. A vulnerability is the exception: report it privately as [`SECURITY.md`](SECURITY.md) describes.

Each issue carries one label from each group that applies:

| Group     | Labels                                        | Says                                 |
| --------- | --------------------------------------------- | ------------------------------------ |
| `type:`   | `bug`, `feature`, `security`, `docs`, `chore` | What kind of work it is              |
| `status:` | `needs-triage`, `blocked`, `upstream`         | Why it is not moving, when it is not |

`status:upstream` means the issue waits on a change in a dependency Vista's maintainers also maintain, as [below](#a-defect-found-mid-task) describes. The bug and feature forms apply `type:bug` or `type:feature` and `status:needs-triage` themselves, and Dependabot labels its pull requests `type:chore`, so those labels must exist before either uses them.

`.github/labels.json` holds the full list. After editing it, run `node scripts/sync-labels.mjs` (or `pnpm labels`) with an authenticated `gh` for this repository. The script writes every label with `gh label create --force`, so a run is safe to repeat and updates colors and descriptions in place. It never deletes a label: deleting one strips it from every issue that carries it, so a label on GitHub that the list no longer has is printed for a maintainer to remove by hand. Renaming a label on GitHub, rather than creating it again, keeps it on the issues that carry it.

### A defect found mid-task

A defect hit while working on something else is filed and worked around, not fixed on the spot. Fixing it in place mixes two subjects in one branch, for the reason the [commit](#atomic-commits) and [pull request](#pull-requests) rules already reject.

File it with what triage needs:

```sh
gh issue create --title "<area>: <what is wrong>" --label "type:bug,status:needs-triage" --body "<what happened, what was expected, and the workaround>"
```

Then mark the workaround where it lives, naming the issue in full so the reference is unambiguous wherever it is read:

```ts
// Workaround for gustavohrm/vista#123: <what it works around>.
```

Once the fix lands, searching for `gustavohrm/vista#123` finds every workaround to remove. A defect with no workaround blocks the task; say so, and the fix goes first, in its own pull request.

A defect or gap in a dependency Vista's maintainers also maintain, such as an `@codenhub/*` package, is fixed upstream, not around. File it in that dependency's repository, label the local issue that waits on it `status:upstream`, and mark the workaround with the upstream issue. Once the fix is released, raise the dependency to that version and remove every workaround that names the issue.

Opening an issue is outward-facing. An agent drafts it and asks before filing, as it does before pushing.

## Branches

Work happens on a branch. Do not commit to `main`.

`main` is the branch CI verifies on every push, so a commit that lands there directly is one nobody reviewed. A pre-push hook refuses to push to it, and GitHub's branch protection refuses it too, for admins as well ([CI](docs/ci.md#branch-protection)).

The exception is real but narrow: it takes an explicit request from a maintainer, in the moment, for that specific commit. Because protection is enforced for admins, the exception means lifting it for that push and restoring it straight after. An agent must ask and be told yes. Neither a general instruction to "just fix it" nor a previous approval carries over to the next commit.

Name the branch `<type>/<slug>`, where `<type>` is the [commit type](#type) of the work and `<slug>` is kebab-case. A version in the slug keeps its dots, as in `chore/tauri-2.9-upgrade`.

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

Append `!` after the scope for a change that breaks a contract someone relies on, such as the format of persisted settings or folder metadata, and say in the body what breaks and what to do about it.

### Body

Optional. Write one when the reason for the change is not obvious from the subject, and use it for why over what; the diff already carries the what.

### Atomic commits

One commit does one thing. A reviewer should be able to read the subject and know what is in the commit before opening it.

Split by intent, not by file count. Moving a function and changing its behavior are two commits even when they touch one file; renaming a symbol across twenty files is one commit. If a subject needs "and" to be accurate, that is usually two commits.

Formatting churn, unrelated fixes, and drive-by refactors are their own commits or their own pull request. Never bundle them into a behavior change: they make the real change unreviewable.

### Co-authorship

A commit an AI agent wrote or substantially shaped MUST carry a `Co-authored-by` trailer naming the **model**, not the tool or harness it ran in:

```
Co-authored-by: Claude Opus 5.5 <noreply@anthropic.com>
```

`Claude Opus 5.5`, not `Claude Code`; the model is what produced the change, and it is what someone auditing the history needs to know. A harness name records which client a person happened to open, which explains nothing about the commit. Use the model vendor's no-reply address when it publishes one.

The human directing the work stays the commit author. The trailer is an addition to authorship, never a replacement for it.

## Validation

Run scripts from the repository root. During development, narrow checks to the package you changed with `pnpm --filter=@vista/<name> <script>`, and do not change into a package directory to run its scripts.

Before delivering a change, run the whole gate:

```sh
pnpm verify
```

Report any step that was skipped or failed. [Workspace](docs/workspace.md#root-scripts) documents what `pnpm verify` guarantees, and [Tooling](docs/tooling.md) its order and the narrower commands.

`pnpm verify` does not run the end-to-end tests, which need a browser installed; CI runs them on every pull request. Run `pnpm test:e2e` as well when a change touches what a user sees or how the web host serves it.

## Pull requests

Every change reaches `main` through a pull request, using the template in `.github/pull_request_template.md`, and [CI](docs/ci.md) verifies it.

Pushing a branch and opening a pull request are outward-facing actions. An agent asks first and does neither on its own initiative.

Keep a pull request to one subject. A branch that fixes a bug and also restructures a doc is two pull requests, for the same reason a commit that does both is two commits.

A pull request that resolves an issue says `Fixes #123` in its description, so merging it closes the issue. Merging is not releasing: a fix reaches users with the next release or deployment.

A pull request that builds on another unmerged one targets that one's branch and names it in its description. Merge them in order, the base first. GitHub then deletes the merged branch, with the setting [CI](docs/ci.md#branch-protection) recommends, and retargets the next pull request to `main`; merged out of order or before that retarget, it lands in the other branch instead of `main`.

## Deployment and releases

Releasing is a maintainer action, and it is separate from merging. Merging changes `main`; a release or deployment puts a version where people install or reach it, and a published version can be superseded but rarely taken back. Bump the version and record what users need to know in an ordinary pull request first; the release itself names a commit already on `main`.

Vista is an end-user application, not a set of published npm packages, and it has no releases yet.

- **Web App**: Cloudflare Workers hosting is approved for the web app (`apps/web`), but production deployment is not set up yet: no account, credentials, or deployment workflow exist. `pnpm deploy:web` builds the web host and runs `wrangler deploy`, and is there for when publication is enabled; `pnpm --filter=@vista/web deploy:check` runs the same build with `--dry-run`.
- **Desktop and Mobile App**: The native app (`apps/native`) produces desktop executables and mobile packages via Tauri (`build:desktop`, `build:android`, `build:ios`). App store distribution, code signing, and release packaging are handled at release milestones.

Pushing a release tag, deploying, and publishing a release are outward-facing actions. An agent asks first and never does any of them on its own initiative.

## Hooks

Three hooks run locally, all from `.githooks/`:

| Hook         | Checks                                                       |
| ------------ | ------------------------------------------------------------ |
| `pre-commit` | Formats and lints the staged files, re-staging what it fixed |
| `commit-msg` | The subject line shape described above                       |
| `pre-push`   | Refuses a direct push to `main`, and a misnamed branch       |

`--no-verify` bypasses them: on `git commit` for the first two, on `git push` for the last. It is for the commit that genuinely has to land unfixed, and an agent that reaches for it MUST say so in the same breath rather than quietly routing around a failing check. The whole point of a hook is that skipping one is visible.

### Why each hook does that much and no more

`pre-commit` runs only the formatters and linters, the checks `.githooks/profile.sh` declares for the stack. Type checking and tests take minutes, and a hook that slow gets bypassed until it may as well not exist; `pnpm verify` is where the rest belongs. [Workspace](docs/workspace.md#git-hooks) says which tools the profile runs and how the hooks are set up.

`pre-commit` reads files from the working tree rather than from the index. For a file that is only partly staged that matters: the hook never rewrites it, because re-staging would sweep in the parts deliberately left out of the commit, and it checks the file as it sits on disk. A commit whose staged content is already clean can therefore still fail. The reverse also holds: when the file was formatted on disk after its changes were staged, the hook passes while the staged content is still unformatted, and `pnpm verify` in CI then fails it. After formatting a partly staged file, stage the formatted parts again and review the staged content with `git diff --cached`. The alternative, skipping such files, would let unformatted code through in every case rather than this one.

`commit-msg` checks the subject line and nothing else. A body is optional, and no hook can tell whether a message describes the commit honestly, so the mechanical half is automated and the rest stays with review. Merges, reverts, and `fixup!`, `squash!`, and `amend!` markers pass unchecked: git composes those subjects, and rejecting a message nobody wrote would only train people to reach for `--no-verify` out of habit, which costs the checks that do matter. The 72-character limit is where practice already sat rather than a number from a style guide: replayed over 200 earlier commits of codenhub/codenhub, the monorepo the template was extracted from, it rejected six, three merely long and three joining two changes with "and", which is the split the convention asks for anyway.

`pre-push` reads the destination ref rather than the branch you are standing on, so its refusal to push to `main` holds for a push from `main`, for an explicit refspec that targets it from elsewhere, and for a `--delete`. It also refuses a branch whose name is not `<type>/<slug>`. That check sits in a hook rather than in wording alone because the name is often not a choice anyone made: an agent harness creates `claude/...` or `codex/...` before the agent has read a file, and a rule about naming a branch does not read as applying to a branch that already has a name. Deleting a remote branch passes whatever it is called, since removing a misnamed branch is the cleanup, and tags are not checked.
