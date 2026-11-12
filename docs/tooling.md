---
status: IMPLEMENTED
last_updated: 2026-11-12
scope: Setup, how the root scripts are implemented, the order of `pnpm verify`, narrowing a run, adding a package, and generated and ignored output.
---

# Tooling

[Workspace](workspace.md) names the root scripts and what each one guarantees. This document is how Vista implements them.

Every check is a root `package.json` script, run from the repository root. Package scripts are reached with `pnpm --filter=<package>` rather than by changing directory. CI runs the same scripts, and [CI](ci.md) describes how.

There is no task runner. Vista is one application split across a few packages, and a set of scripts chained with `&&` is easier to read and reproduce than a tool that would have to be learned, versioned, and trusted first.

## Setup

[Contributing](../CONTRIBUTING.md#setup) lists what to install and the commands to run. `pnpm install` runs the root `prepare` script, which installs the git hooks as [Workspace](workspace.md#git-hooks) describes. If lifecycle scripts were disabled during the install, run `pnpm hooks:install`.

nvm for Windows does not read `.nvmrc`, and `nvm install` and `nvm use` without a version fail, so name it; in PowerShell, `nvm install (Get-Content .nvmrc)`, then `nvm use (Get-Content .nvmrc)`. Checked with nvm for Windows 1.2.2, and in the source of 2.0.1, whose `install` requires the version.

## Scripts

| Script               | Runs                                                                       |
| -------------------- | -------------------------------------------------------------------------- |
| `pnpm format:check`  | `oxfmt --check`, then `prettier --check` over `**/*.md`.                   |
| `pnpm format:fix`    | The same two formatters, rewriting files, then `cargo fmt` for Rust.       |
| `pnpm lint:check`    | `oxlint --deny-warnings`.                                                  |
| `pnpm lint:fix`      | `oxlint --fix`.                                                            |
| `pnpm typecheck`     | `tsc --noEmit` in every package that has a `typecheck` script.             |
| `pnpm test`          | `test:hooks`, then each package's `test` script, which runs `vitest run`.  |
| `pnpm test:hooks`    | `node --test scripts/git-hooks.test.mjs`.                                  |
| `pnpm test:watch`    | Each package's `test:watch` script.                                        |
| `pnpm test:coverage` | Each package's `test:coverage` script, with a V8 coverage report.          |
| `pnpm test:e2e`      | `playwright test` in `@vista/web`.                                         |
| `pnpm build`         | `build:web`, then `build:native`, each `vite build` in its host.           |
| `pnpm deploy:web`    | `build:web`, then `wrangler deploy`, in `@vista/web`.                      |
| `pnpm verify`        | `verify:web`, then `verify:rust`, in the order [below](#verification).     |
| `pnpm labels`        | `node scripts/sync-labels.mjs`, which needs an authenticated `gh`.         |
| `pnpm prepare`       | `node scripts/install-hooks.mjs`, the same script as `pnpm hooks:install`. |

`lint:check` and `lint:fix` accept a root-relative path, such as `pnpm lint:fix packages/app/src`, to narrow oxlint to it.

The Rust scripts live in `apps/native/package.json`: `format:rust:check`, `format:rust:fix`, `lint:rust:check`, and `test:rust`. `verify:rust` and `format:fix` reach them with `pnpm --filter=@vista/native`. Each passes `--manifest-path src-tauri/Cargo.toml`, so nothing needs to run from inside `apps/native/src-tauri`. They also pass `--locked` where cargo resolves dependencies, the Rust counterpart to `pnpm install --frozen-lockfile`: a `Cargo.lock` that disagrees with `Cargo.toml` fails rather than being rewritten.

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

The order is by cost. Within the web half, the checks that report in seconds run first, and each bundle runs after the tests that would catch the same mistake sooner. The workspace packages are consumed as source, not built output, so type checking and tests need no build first. The web half runs before the Rust half because it reports in seconds, while the Rust half may compile for minutes.

`verify` does not run `test:e2e`, `build:desktop`, `build:android`, or `build:ios`. The end-to-end tests need a browser and a local Worker, and the native installers need a platform toolchain. CI runs the end-to-end tests on every pull request.

## Narrowing a run

pnpm's `--filter` runs any script of one package, and a path after a Vitest script runs one directory or file:

```sh
pnpm --filter=@vista/app test
pnpm --filter=@vista/app test src/domain/path-validation.test.ts
pnpm --filter=@vista/app typecheck
pnpm --filter=@vista/web test:e2e tests/e2e/startup.spec.ts
```

oxlint and oxfmt take paths: `pnpm lint:check packages/app/src` and `pnpm exec oxfmt --check packages/app`.

## Adding a package

1. Create it under `packages/` (shared code) or `apps/` (a host that is deployed or run), with a `package.json` named `@vista/<directory>`, `"private": true`, `"type": "module"`, and its dependencies as `catalog:` or `workspace:*`. A new third-party version goes in the catalog.
2. Give it a `tsconfig.json` that extends `../../tsconfig.json` and adds the `lib` and `jsx` its runtime needs, and a `typecheck` script running `tsc --noEmit`; `pnpm typecheck` runs it.
3. If it has unit tests, give it a `vitest.config.ts` and the `test`, `test:watch`, and `test:coverage` scripts [stack tests](specs/stack-tests.md#configuration) names; `pnpm test` runs them.
4. Give it `format:check`, `format:fix`, `lint:check`, and `lint:fix` scripts as the other packages have, and a `build` script if it produces output, which a root `build:*` script then reaches.
5. List it in [Architecture](architecture.md) and in the README's repository list.

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
