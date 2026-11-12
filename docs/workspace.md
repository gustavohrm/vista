---
status: IMPLEMENTED
last_updated: 2026-11-12
scope: The root script names and what each guarantees, the shared tool configurations, the pinned toolchain, install rules, how dependency versions are declared, and how the git hooks are wired.
---

# Workspace

This document is the workspace's contract: the names of the root scripts and what each one guarantees, the configuration files every package shares, and how versions are declared. CI, the git hooks, and the agent instructions rely on it. How the scripts are implemented, how to narrow a run, and how to add a package is in [Tooling](tooling.md).

## Root scripts

| Script               | Guarantees                                                                                                                         |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm format:check`  | Every file is formatted: code, CSS, HTML, JSON and YAML by oxfmt, Markdown by Prettier. Reports, writes nothing.                   |
| `pnpm format:fix`    | The same two formatters, and rustfmt for Rust, rewriting files.                                                                    |
| `pnpm lint:check`    | oxlint passes over the repository, with warnings treated as errors.                                                                |
| `pnpm lint:fix`      | oxlint, applying its safe fixes.                                                                                                   |
| `pnpm typecheck`     | Every package with TypeScript type-checks.                                                                                         |
| `pnpm test`          | The git hook tests and every package's unit and integration suites pass.                                                           |
| `pnpm test:watch`    | The package suites, in watch mode.                                                                                                 |
| `pnpm test:coverage` | The package suites, with a coverage report.                                                                                        |
| `pnpm test:e2e`      | The web host's browser suite passes. Needs a browser installed; `pnpm verify` does not run it.                                     |
| `pnpm build`         | The web and native frontend bundles build.                                                                                         |
| `pnpm verify`        | `verify:web`, then `verify:rust`, stopping at the first failure. It is the delivery gate [Contributing](../CONTRIBUTING.md) names. |
| `pnpm verify:web`    | `format:check`, `lint:check`, `typecheck`, `test`, `build:web` and `build:native`, in that order.                                  |
| `pnpm verify:rust`   | rustfmt, then clippy, over the native host's Rust crate.                                                                           |
| `pnpm prepare`       | Runs on install: points git at the committed hooks in `.githooks/`.                                                                |

`pnpm verify` is what CI runs ([CI](ci.md)), so a green local `verify` predicts a green run. [Tooling](tooling.md#verification) gives the order of its steps and why.

Keep these names as they are: CI, the git hooks and the agent instructions call them by name.

Vista's own root scripts:

| Script               | Does                                                                            |
| -------------------- | ------------------------------------------------------------------------------- |
| `pnpm dev:web`       | The web host's Vite dev server.                                                 |
| `pnpm dev:native`    | `tauri dev`, the native app with the interface served by Vite.                  |
| `pnpm build:web`     | The web host's production bundle.                                               |
| `pnpm build:native`  | The native host's frontend bundle, which the Tauri build packages.              |
| `pnpm deploy:web`    | `build:web`, then `wrangler deploy` for the web host. Production is not set up. |
| `pnpm test:hooks`    | The git hook tests alone.                                                       |
| `pnpm labels`        | Creates or updates the GitHub labels in `.github/labels.json`.                  |
| `pnpm hooks:install` | Points `core.hooksPath` at `.githooks`, the step `prepare` runs.                |

There is no `pnpm format` script. When a name matches no pnpm script, pnpm runs the executable of that name from `PATH` instead, and on Windows `format` is the system disk formatter. The explicit `format:check` and `format:fix` names avoid that.

## Configuration

| File                                 | Configures                                                                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `package.json`                       | The root scripts, the root tooling as `devDependencies`, and the pinned Node.js and pnpm (`engines`, `packageManager`).                                |
| `pnpm-workspace.yaml`                | The workspace globs, the catalog of every dependency version, the supply-chain rules for installs ([below](#dependency-installs)), and `engineStrict`. |
| `.nvmrc`                             | The exact Node.js version, read by `nvm` and by CI.                                                                                                    |
| `rust-toolchain.toml`                | The exact Rust version, with `clippy` and `rustfmt`.                                                                                                   |
| `.editorconfig`                      | Indentation, final newline, LF line endings, four-space Rust, and no hard wrap in Markdown.                                                            |
| `.gitattributes`                     | LF line endings in the repository and the working tree on every platform, and the binary file types.                                                   |
| `.oxfmtrc.json`                      | oxfmt: 120 columns, double quotes, semicolons, trailing commas, sorted imports and `package.json` keys. Markdown is excluded; Prettier owns it.        |
| `.prettierrc.json`                   | Prettier, for Markdown only: `proseWrap: "never"`, so a paragraph is one line and a diff shows the sentence that changed.                              |
| `.prettierignore`                    | Paths inside the Markdown set Prettier leaves alone: build output and caches.                                                                          |
| `.oxlintrc.json`                     | oxlint's plugins and rules, described [below](#lint-rules).                                                                                            |
| `apps/native/src-tauri/rustfmt.toml` | rustfmt at width 120, the same as oxfmt's, so both languages wrap at the same column.                                                                  |
| `tsconfig.json`                      | The compiler settings every package's `tsconfig.json` extends: strict, `verbatimModuleSyntax`, bundler resolution, and type-checking only (`noEmit`).  |

### Two formatters

oxfmt formats everything it understands except Markdown; Prettier formats only Markdown. oxfmt is far faster and agrees with Prettier's output for code, but its Markdown support does not yet match Prettier's, and the documentation is where formatting churn costs the most review time. `.oxfmtrc.json` ignores `**/*.md`, and the scripts hand Prettier `**/*.md` explicitly, so neither formatter touches the other's files. `proseWrap: "never"` is the no-hard-wrap rule the [documentation guidelines](guidelines/documentation.md#formatting) set.

### Lint rules

oxlint runs with `--deny-warnings`, so a warning fails the check as an error does. `.oxlintrc.json` turns on the core, oxc, and TypeScript rules, JSDoc, Vitest, unicorn, promise, and the React and jsx-a11y plugins. `no-console` allows `console.warn` and `console.error`, deliberate diagnostics, and refuses the rest, such as a forgotten `console.log`, except in `.githooks/`, `scripts/` and tests, where printing is the point.

The React Compiler rules oxlint 1.93 turned on by default (`react/refs`, `react/set-state-in-effect`, `react/immutability`, and `react/preserve-manual-memoization`) are off: Vista does not build with the React Compiler, and they flag the latest-value refs and state-syncing effects the app uses on purpose.

A finding that is wrong for one place is suppressed on that line with a comment naming the rule and the reason, in the form `// oxlint-disable-next-line <rule> -- <reason>`. A rule that is wrong everywhere is changed in `.oxlintrc.json`, and this document changes with it.

clippy runs with warnings denied over every target. A lint that is wrong for one place is allowed there with `#[allow(...)]` and a comment saying why.

### Versions

Every third-party dependency version is declared once, in the catalog in `pnpm-workspace.yaml`, and referred to as `catalog:` in each `package.json`. The workspace therefore cannot hold two versions of one dependency by accident, and an upgrade is a one-line change that Dependabot can propose ([CI](ci.md#dependency-updates)). A workspace package depends on another as `workspace:*`, so it is not a catalog entry.

Rust dependencies are declared in `apps/native/src-tauri/Cargo.toml` and locked in its `Cargo.lock`.

## Toolchain

Local and CI runs resolve the same versions, each declared once:

| Where                                | Declares                                              |
| ------------------------------------ | ----------------------------------------------------- |
| `package.json` `engines`             | The Node.js and pnpm range every run must meet        |
| `package.json` `packageManager`      | The exact pnpm version pnpm installs itself           |
| `.nvmrc`                             | The exact Node.js version, read by `nvm` and CI       |
| `pnpm-workspace.yaml` `engineStrict` | Makes an install outside `engines` fail               |
| `rust-toolchain.toml`                | The exact Rust version and its `clippy` and `rustfmt` |

[CI](ci.md#toolchain) describes how the workflow reads the same files rather than repeating a version, and why `engineStrict` is set where it is.

### Dependency installs

`pnpm-workspace.yaml` holds the pnpm settings that govern installs, locally and in CI alike:

- `blockExoticSubdeps: true` refuses a transitive dependency that resolves to a git repository or a tarball URL instead of the registry. A direct dependency's source is written in `package.json`, where a reviewer sees it; a transitive one would arrive through another package's manifest unseen.
- `trustPolicy: no-downgrade` refuses a version whose publish-time trust evidence, such as provenance or trusted publishing, is weaker than that of an earlier version of the same package. A release that drops its provenance is a common sign of a compromised publish.
- `trustPolicyIgnoreAfter: 10080` is an age in minutes, seven days, after which a version is no longer held to the trust policy. It stops a long-published version that predates provenance from being refused as a downgrade, while a fresh release, the one a compromise would be, is still checked. When one recent version must be let through, `trustPolicyExclude` names that exact version, with the reason in a comment and the condition for removing it.
- `allowBuilds` lists the only dependencies whose install scripts run: `esbuild`, whose script checks that Vite's bundler binary resolved, and `workerd`, whose script links the Workers runtime Wrangler runs locally. A dependency that needs one gets an entry in the same change, with the reason.
- pnpm's default `minimumReleaseAge` prefers a version published at least a day ago, so a compromised release is usually caught and pulled before it is chosen here. It is not a hard gate: the workspace does not set `minimumReleaseAge`, so pnpm's default non-strict mode applies, and when the only version that matches a range or an exact pin is younger than a day, pnpm installs it anyway. Setting `minimumReleaseAge` explicitly in `pnpm-workspace.yaml` would make it strict, so such an install fails instead; a version needed sooner then goes in `minimumReleaseAgeExclude`, by exact version, and leaves it once it is old enough.

## Git hooks

[Contributing](../CONTRIBUTING.md#hooks) lists what each hook checks. This section records how they are wired and why each does that much and no more.

The `prepare` script runs `scripts/install-hooks.mjs` on every `pnpm install`, which points `core.hooksPath` at `.githooks/` and makes the hooks executable. The setting is local to the clone rather than tracked, so a fresh clone runs no hooks until it installs; doing it from `prepare` keeps a hook manager out of the dependency list. The script does nothing in CI, and nothing in a tree without a `.git` directory. It refuses to replace a `core.hooksPath` that already points somewhere else, so a different hook setup is reconciled by hand rather than overwritten.

`pre-commit` is the one hook that runs a formatter and a linter, and it runs `pnpm format:check && pnpm lint:check` over the whole repository, not over the staged files. A failure can come from a file the commit does not touch. Type checking, tests, and the Rust checks take minutes, and a hook that slow gets bypassed until it may as well not exist; `pnpm verify` is where they belong.

`commit-msg` checks the subject line only. No hook can tell whether a message describes the commit honestly, so that half stays with review. Merges, reverts, and `fixup!`, `squash!`, and `amend!` subjects pass unchecked, because git composed them.

`pre-push` reads the destination ref rather than the current branch, so it holds for a push from `main`, for an explicit refspec targeting it, and for a deletion. It checks the branch name because the name is often not a choice anyone made: an agent harness can create a branch before anyone has chosen its name. Deleting a remote branch passes whatever it is called, and tags are not checked.

The checks that are not shell live in `scripts/check-git-state.mjs`, which `pre-commit` and `pre-push` call. The hook tests in `scripts/git-hooks.test.mjs` run as part of `pnpm test`.

Each hook ignores SIGPIPE. Git for Windows counts a hook killed by any signal as passed, and when the caller pipes git through something that closes early, a hook writing its rejection message can be killed mid-message. Ignoring the signal leaves the hook's own verdict in charge of its exit status.
