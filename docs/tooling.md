---
status: IMPLEMENTED
last_updated: 2026-10-15
scope: The root `package.json` scripts, what `pnpm verify` runs, formatting and linting configuration, git hooks, and generated and ignored output.
---

# Tooling

Every check is a root `package.json` script, run from the repository root. Package scripts are reached with `pnpm --filter=<package>` rather than by changing directory. CI runs the same scripts, and [CI](ci.md) describes how.

There is no task runner. Vista is one application split across a few packages, and a set of scripts chained with `&&` is easier to read and reproduce than a tool that would have to be learned, versioned, and trusted first.

## Toolchain

The versions are declared once and read by both local runs and CI:

| Where                           | Declares                                              |
| ------------------------------- | ----------------------------------------------------- |
| `package.json` `engines`        | The Node and pnpm range every run must satisfy        |
| `package.json` `packageManager` | The exact pnpm version pnpm installs itself           |
| `.nvmrc`                        | The exact Node version                                |
| `.npmrc` `engine-strict`        | Makes an install outside `engines` fail               |
| `rust-toolchain.toml`           | The exact Rust version and its `clippy` and `rustfmt` |

[CI](ci.md) covers how the workflow reads them.

## Scripts

| Script               | Runs                                                              |
| -------------------- | ----------------------------------------------------------------- |
| `pnpm dev:web`       | The web host's Vite dev server                                    |
| `pnpm dev:native`    | `tauri dev`, the native app with the interface served by Vite     |
| `pnpm build`         | `build:web`, then `build:native`                                  |
| `pnpm build:web`     | The web host's production bundle                                  |
| `pnpm build:native`  | The native host's frontend bundle, which the Tauri build packages |
| `pnpm deploy:web`    | `build:web`, then `wrangler deploy` for the web host              |
| `pnpm verify`        | `verify:web`, then `verify:rust`                                  |
| `pnpm verify:web`    | Format, lint, type check, tests, and both frontend bundles        |
| `pnpm verify:rust`   | rustfmt, clippy, and `cargo test`, through `@vista/native`        |
| `pnpm format:check`  | oxfmt, and Prettier for Markdown, without writing                 |
| `pnpm format:fix`    | oxfmt, Prettier for Markdown, and `cargo fmt` for Rust, writing   |
| `pnpm lint:check`    | oxlint, with warnings denied                                      |
| `pnpm lint:fix`      | oxlint's automatic fixes                                          |
| `pnpm typecheck`     | `tsc --noEmit` in every package that has a `typecheck` script     |
| `pnpm test`          | The git hook tests, then each package's `test` script             |
| `pnpm test:hooks`    | The git hook tests alone, with `node --test`                      |
| `pnpm test:watch`    | Each package's `test:watch` script                                |
| `pnpm test:coverage` | Each package's `test:coverage` script                             |
| `pnpm test:e2e`      | The Playwright end-to-end tests for the web host                  |
| `pnpm labels`        | Creates or updates the GitHub labels in `.github/labels.json`     |
| `pnpm hooks:install` | Points `core.hooksPath` at `.githooks`, the step `prepare` runs   |
| `pnpm prepare`       | Installs the git hooks, run automatically by `pnpm install`       |

The Rust scripts live in `apps/native/package.json`: `format:rust:check`, `lint:rust:check`, and `test:rust`. `verify:rust` reaches them with `pnpm --filter=@vista/native`. Each passes `--manifest-path src-tauri/Cargo.toml`, so nothing needs to run from inside `apps/native/src-tauri`. They also pass `--locked` where cargo resolves dependencies, the Rust counterpart to `pnpm install --frozen-lockfile`: a `Cargo.lock` that disagrees with `Cargo.toml` fails rather than being rewritten.

There is no `pnpm format` script. When a name matches no pnpm script, pnpm runs the executable of that name from `PATH` instead, and on Windows `format` is the system disk formatter. The explicit `format:check` and `format:fix` names avoid that.

## Verification

`pnpm verify` is the gate a change passes before delivery. It runs `verify:web` and then `verify:rust`, and each stops at its first failure.

`verify:web`:

1. `format:check`: oxfmt over code, CSS, HTML, and JSON, then Prettier over Markdown.
2. `lint:check`: oxlint with `--deny-warnings`.
3. `typecheck`: `tsc --noEmit` in every package.
4. `test`: the hook tests, then Vitest in `packages/app`.
5. `build:web`: the web host's production bundle, where a missing import or a broken virtual module shows up.
6. `build:native`: the native host's frontend bundle, which the Tauri build packages.

`verify:rust`:

1. `format:rust:check`: rustfmt, without writing.
2. `lint:rust:check`: clippy over every target, with warnings denied.
3. `test:rust`: `cargo test`.

The order is by cost. Within the web half, the checks that report in seconds run first, and each bundle runs after the tests that would catch the same mistake sooner. The web half runs before the Rust half because it reports in seconds, while the Rust half may compile for minutes.

`verify` does not run `test:e2e`, `build:desktop`, `build:android`, or `build:ios`. The end-to-end tests need a browser and a local Worker, and the native installers need a platform toolchain. CI runs the end-to-end tests on every pull request.

## Formatting and linting

| Language                    | Formatter | Linter | Configuration                         |
| --------------------------- | --------- | ------ | ------------------------------------- |
| TypeScript, CSS, HTML, JSON | oxfmt     | oxlint | `.oxfmtrc.json`, `.oxlintrc.json`     |
| Markdown                    | Prettier  | —      | `.prettierrc.json`, `.prettierignore` |
| Rust                        | rustfmt   | clippy | `apps/native/src-tauri/rustfmt.toml`  |

oxfmt ignores Markdown: `**/*.md` is in its ignore list. Prettier formats only the `**/*.md` set the scripts pass it, and runs with `proseWrap: "never"`, which is the no-hard-wrap rule [Documentation guidelines](guidelines/documentation.md) set.

rustfmt runs at width 120, the same as oxfmt's `printWidth`, so both languages wrap at the same column.

oxlint runs with `--deny-warnings`, so a warning fails the check as an error does. Its rules are in `.oxlintrc.json`: the core, oxc, and TypeScript rules, JSDoc, Vitest, unicorn, promise, and the React and jsx-a11y plugins. A finding that is wrong for one place is suppressed on that line with a comment naming the rule and the reason, in the form `// oxlint-disable-next-line <rule> -- <reason>`. A rule that is wrong everywhere is changed in `.oxlintrc.json`, and this document changes with it.

clippy runs with warnings denied over every target. A lint that is wrong for one place is allowed there with `#[allow(...)]` and a comment saying why.

## Git hooks

Three hooks live in `.githooks/`. The `prepare` script runs `scripts/install-hooks.mjs` on every `pnpm install`, which points `core.hooksPath` at that directory and makes the hooks executable. The setting is local to the clone rather than tracked, so a fresh clone runs no hooks until it installs. The script does nothing in CI, and nothing in a tree without a `.git` directory. It refuses to replace a `core.hooksPath` that already points somewhere else, so a different hook setup is reconciled by hand rather than overwritten.

| Hook         | Checks                                                                                                                                                   |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pre-commit` | Refuses commits on `main` or a detached HEAD, untracked files, unstaged changes, and unresolved merges; then runs `pnpm format:check && pnpm lint:check` |
| `commit-msg` | The Conventional Commits subject described in [Contributing](../CONTRIBUTING.md)                                                                         |
| `pre-push`   | Refuses a push to `main`, a branch not named `<type>/<slug>`, a commit other than the checked-out one, and a dirty working tree                          |

`pre-commit` is the one hook that runs a formatter and a linter, and it runs them over the whole repository, not over the staged files. A failure can come from a file the commit does not touch. Type checking, tests, and the Rust checks take minutes, and a hook that slow gets bypassed until it may as well not exist; `pnpm verify` is where they belong.

`commit-msg` checks the subject line only: a known type, an optional scope, an imperative lowercase subject, no trailing period, and 72 characters at most. No hook can tell whether a message describes the commit honestly, so that half stays with review. Merges, reverts, and `fixup!`, `squash!`, and `amend!` subjects pass unchecked, because git composed them.

`pre-push` reads the destination ref rather than the current branch, so it holds for a push from `main`, for an explicit refspec targeting it, and for a deletion. It checks the branch name because the name is often not a choice anyone made: an agent harness can create a branch before the agent has read a file. Deleting a remote branch passes whatever it is called, and tags are not checked.

The checks that are not shell live in `scripts/check-git-state.mjs`, which `pre-commit` and `pre-push` call. The hook tests in `scripts/git-hooks.test.mjs` run as part of `pnpm test`.

Each hook ignores SIGPIPE. Git for Windows counts a hook killed by any signal as passed, and when the caller pipes git through something that closes early, a hook writing its rejection message can be killed mid-message. Ignoring the signal leaves the hook's own verdict in charge of its exit status.

`--no-verify` bypasses the hooks: on `git commit` for `pre-commit` and `commit-msg`, on `git push` for `pre-push`. It is for the change that genuinely has to land unfixed, and using it is worth saying out loud.

## Generated and ignored output

These paths are produced by the tools and ignored by git. None is edited by hand.

| Path                                     | Produced by                                          |
| ---------------------------------------- | ---------------------------------------------------- |
| `dist/`                                  | `build:web` and `build:native`, the Vite bundles     |
| `target/`, `**/target/`                  | cargo, for the Rust crate in `apps/native/src-tauri` |
| `apps/native/src-tauri/gen/`             | The Tauri build, including its generated schemas     |
| `.wrangler/`                             | Wrangler, for local Worker state and `wrangler dev`  |
| `coverage/`, `**/coverage/`              | `test:coverage`                                      |
| `test-results/`, `playwright-report/`    | `test:e2e`                                           |
| `*.tsbuildinfo`                          | `tsc` incremental builds                             |
| `*.local`, `.env`, `.env.*`, `.dev.vars` | Local configuration and credentials, never committed |

The formatters and linters skip the build output and generated paths through their own ignore lists, so generated files are never reformatted or reported. `.prettierignore` carries the same set for Markdown.
