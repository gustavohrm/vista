# Contributing

This document covers how a change gets from a working tree into `main`: branches, commits, and pull requests. It applies to everyone, and it applies unchanged to AI agents — an agent that cannot follow it should not be committing here. `AGENTS.md` routes agents to it.

What a change must contain, rather than how it lands, lives elsewhere: `docs/code-guidelines.md` for code, `docs/docs-guidelines.md` for documentation, and `docs/specs/architecture.md` and `README.md` for architecture and commands.

## Setup

The toolchain is pinned and an install outside it fails rather than warns:

```sh
nvm use
pnpm install
```

`pnpm install` also points git at `.githooks/` through `core.hooksPath` (or run `pnpm hooks:install`), so the hooks described below start working after the first install and not before. Node and pnpm versions are pinned in `.nvmrc` and `package.json`.

## Branches

Work happens on a branch. Do not commit to `main`.

`main` is the branch CI verifies in full and the branch application deployments originate from, so a commit that lands there directly is one nobody reviewed. A pre-push hook refuses to push to it.

The exception is real but narrow: it takes an explicit request from a maintainer, in the moment, for that specific commit. An agent must ask and be told yes. Neither a general instruction to "just fix it" nor a previous approval carries over to the next commit.

Name the branch `<type>/<slug>`, where `<type>` is the commit type of the work and `<slug>` is kebab-case:

```
feat/markdown-editor
fix/folder-picker-cancellation
docs/architecture-contracts
chore/update-dependencies
```

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

Repository-level areas use their own name, such as `ci`, `hooks`, `docs`, `deps`.

### Subject

Imperative mood, lowercase, no trailing period: "add", not "added" or "Adds". Aim for 50 characters and stay under 72, which the hook enforces.

Describe what the change does for someone reading the log later, not which files moved. `feat(app): add markdown note editor` or `fix(web): handle permission revocation gracefully` says what happens; `fix(web): update adapter.ts` says nothing a diff would not.

Append `!` after the scope for a breaking change, and describe what breaks in the body.

### Body

Optional. Write one when the reason for the change is not obvious from the subject, and use it for why over what — the diff already carries the what.

### Atomic commits

One commit does one thing. A reviewer should be able to read the subject and know what is in the commit before opening it.

Split by intent, not by file count. Moving a function and changing its behavior are two commits even when they touch one file; renaming a symbol across twenty files is one commit. If a subject needs "and" to be accurate, that is usually two commits.

Formatting churn, unrelated fixes, and drive-by refactors are their own commits or their own pull request. Never bundle them into a behavior change: they make the real change unreviewable.

### Co-authorship

A commit an AI agent wrote or substantially shaped MUST carry a `Co-authored-by` trailer naming the **model**, not the tool or harness it ran in:

```
Co-authored-by: Claude Opus 5 <noreply@anthropic.com>
```

or

```
Co-authored-by: Gemini 2.5 Pro <noreply@google.com>
```

The model is what produced the change, and it is what someone auditing the history needs to know. A harness name records which client a person happened to open, which explains nothing about the commit. Use the model vendor's no-reply address when it publishes one.

The human directing the work stays the commit author. The trailer is an addition to authorship, never a replacement for it.

## Before opening a pull request

Run quality checks before opening a pull request:

```sh
pnpm format:check
pnpm lint:check
pnpm typecheck
pnpm test
```

Or run `pnpm verify` for the full workspace check (formatting, linting, TypeScript, tests, and frontend builds). For single packages or hosts, use `pnpm --filter=@vista/<name> <script>`.

## Pull requests

Every change reaches `main` through a pull request. CI verifies the branch with the `Windows checks` job.

Pushing a branch and opening a pull request are outward-facing actions. An agent asks first and does neither on its own initiative.

Keep a pull request to one subject. A branch that fixes a bug and also restructures a doc is two pull requests, for the same reason a commit that does both is two commits.

## Deployment and releases

Vista is an end-user application, not a set of published npm packages.

- **Web App**: Cloudflare Workers hosting is approved for the web app (`apps/web`). Deployment is performed via `pnpm deploy:web` or automated CI when publication is enabled in the future.
- **Desktop and Mobile App**: The native app (`apps/native`) produces desktop executables and mobile packages via Tauri (`build:desktop`, `build:android`, `build:ios`). App store distribution, code signing, and release packaging are handled at release milestones.

Deploying or publishing releases are outward-facing actions. An agent asks first and never triggers deployments on its own initiative.

## Hooks

Three hooks run locally, all from `.githooks/`:

| Hook         | Checks                                                                                                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pre-commit` | Blocks commits on `main` or detached HEAD, rejects untracked or partially staged files, and verifies formatting (`pnpm format:check`) and linting (`pnpm lint:check`) across the repository |
| `commit-msg` | Enforces Conventional Commits subject line format (type, scope, lowercase imperative, $\le 72$ chars, no trailing period)                                                                   |
| `pre-push`   | Blocks direct pushes or deletions targeting remote `main`, requires a clean working tree, and ensures pushes point to the checked-out commit                                                |

`--no-verify` bypasses them. It is for the commit that genuinely has to land unfixed, and an agent that reaches for it MUST say so in the same breath rather than quietly routing around a failing check.
