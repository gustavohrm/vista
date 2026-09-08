# Vista

Vista is an early-stage, multi-platform workspace for managing notes and personal data. Its goal is a lightweight middle ground between Notion, Obsidian, and VS Code that operates directly on local folders.

Planned capabilities include rich Markdown editing, structured CSV views, backlinks, folder search, and data export. Current implementation provides shared React, web, and Tauri foundations; product features are not implemented yet.

## Setup

Use Node **24.14.1** (also recorded in `.node-version`) and pnpm **11.7.0** (pinned in `package.json`). Install pnpm with `npm install --global pnpm@11.7.0` if it is not already available. Then, from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm dev:web
```

For Windows development, install Rust through rustup, Microsoft C++ Build Tools, and WebView2. The root `rust-toolchain.toml` pins Rust **1.95.0**. See the [native host setup](apps/native/README.md) for Windows details and Android/iOS initialization. The immediate verification targets are desktop Chrome/Edge and Windows; mobile remains prepared but unverified.

The web MVP will work on user-selected existing folders through supported browser APIs. Browser-private storage is not a substitute for folder access. See the [architecture](docs/specs/architecture.md) for the approved adapter boundaries and platform constraints.

## Commands

Use pnpm from the repository root. Run workspace-wide commands with no package filter:

```sh
pnpm build
pnpm format:check
pnpm format:fix
pnpm lint:check
pnpm lint:fix
pnpm test
pnpm test:e2e
pnpm typecheck
pnpm verify
```

Development and platform commands:

```sh
pnpm dev:web
pnpm dev:native
pnpm build:web
pnpm build:native # Native frontend only
pnpm --filter=@vista/native build:desktop
pnpm --filter=@vista/native build:android
pnpm --filter=@vista/native build:ios
```

## Architecture

- `packages/app`: shared React product code and platform capability contracts.
- `apps/web`: browser adapters, Vite host, and local Cloudflare Worker scaffold. Production hosting is approved; publishing is deferred until the app is ready.
- `apps/native`: Tauri adapters and one native host for desktop, Android, and iOS.

See `docs/specs/architecture.md` for dependency boundaries.

Format and lint scripts accept an optional root-relative path:

```sh
pnpm format:check
pnpm format:check packages/app
pnpm lint:fix packages/app/src
```

When working on one package, run package scripts with `--filter` from the repository root. Use the package's `package.json` name as the filter value:

```sh
pnpm --filter=@vista/app test
pnpm --filter=@vista/web build
pnpm --filter=@vista/native typecheck
```

Before merging behavior changes, run at least:

```sh
pnpm format:check
pnpm lint:check
pnpm typecheck
pnpm test
```

`pnpm verify` runs formatting, linting, TypeScript, unit tests, and both frontend builds. Browser and Rust checks are separate:

```sh
pnpm --filter=@vista/web exec playwright install chromium
pnpm test:e2e
pnpm --filter=@vista/native format:rust:check
pnpm --filter=@vista/native lint:rust:check
pnpm --filter=@vista/native test:rust
```

The browser smoke test uses a fresh build and local Wrangler, including direct navigation and reload. GitHub CI runs frontend checks and the browser smoke test on Linux, plus Rust checks and a Windows release executable build. Native bundles, mobile device validation, signing, and store distribution are separate release concerns.

For a deployment dry run or local Cloudflare preview, see the [web host commands](apps/web/README.md). Local `.env`, `.dev.vars`, Wrangler state, and generated output are ignored. Only explicitly public client configuration belongs in `VITE_*` variables; those values are included in browser bundles.

## Contributions

Use a feature branch and open a PR for every change to `main`. A normal local `pnpm install` installs the repository's Git hooks; run `pnpm hooks:install` if lifecycle scripts were disabled. Pre-commit checks formatting and linting and requires all non-ignored changes to be staged. Pre-push requires a clean tree, blocks pushes to `main`, and runs `pnpm verify` plus `pnpm test:e2e`. Install Playwright's Chromium before your first push.

GitHub requires both CI jobs before a PR can merge, including for administrators. No additional reviewer is required for this personal project. Hooks never auto-stage untracked files, stash work, or include ignored secrets/build output. See the [Git workflow rules](docs/code-guidelines.md#git-workflow) for details.

## Documentation

This repository is docs-first: durable decisions live in `docs/` and code should follow approved documentation. Package-specific documentation lives in `packages/<name>/docs/` or `apps/<name>/docs/`.

Read these before changing behavior, public APIs, or project conventions:

- `docs/docs-guidelines.md`: documentation structure, status model, and exception rules.
- `docs/code-guidelines.md`: coding conventions and enforceable quality rules.

## License

This project is licensed under the [Apache 2.0 License](LICENSE).
