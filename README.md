# Vista

Vista is an early-stage, multi-platform workspace for managing notes and personal data. Its goal is a lightweight middle ground between Notion, Obsidian, and VS Code that operates directly on local folders.

Planned capabilities include rich Markdown editing, structured CSV views, backlinks, folder search, and data export. Current implementation provides shared React, web, and Tauri foundations; product features are not implemented yet.

## Commands

Use pnpm from the repository root. Run workspace-wide commands with no package filter:

```sh
pnpm build
pnpm format:check
pnpm format:fix
pnpm lint:check
pnpm lint:fix
pnpm test
pnpm typecheck
```

Development and platform commands:

```sh
pnpm dev:web
pnpm dev:native
pnpm build:web
pnpm build:native # Native frontend only
pnpm deploy:web
pnpm --filter=@vista/native build:desktop
pnpm --filter=@vista/native build:android
pnpm --filter=@vista/native build:ios
```

## Architecture

- `packages/app`: shared React product code and platform capability contracts.
- `apps/web`: browser adapters, Vite host, and Cloudflare Worker deployment.
- `apps/native`: Tauri adapters and one native host for desktop, Android, and iOS.

See `docs/specs/architecture.md` for dependency boundaries.

Format and lint scripts accept an optional root-relative path:

```sh
pnpm format:check
pnpm format:check packages/app
pnpm lint:fix packages/app/src
```

When working on one package, run package scripts with `--filter` from the repository root. Use the directory name under `packages/` or `apps/` as the filter value:

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

## Documentation

This repository is docs-first: durable decisions live in `docs/` and code should follow approved documentation. Package-specific documentation lives in `packages/<name>/docs/` or `apps/<name>/docs/`.

Read these before changing behavior, public APIs, or project conventions:

- `docs/docs-guidelines.md`: documentation structure, status model, and exception rules.
- `docs/code-guidelines.md`: coding conventions and enforceable quality rules.

## License

This project is licensed under the [Apache 2.0 License](LICENSE).
