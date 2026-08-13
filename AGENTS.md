# Agent instructions

This repository is docs-first. Before making non-trivial changes, read and follow the relevant source-of-truth documents in `docs/`, especially `docs/code-guidelines.md` and `docs/docs-guidelines.md`.

## Priority

Follow instructions in this order:

1. User request.
2. `AGENTS.md` and `CLAUDE.md`.
3. APPROVED or IMPLEMENTED documents in `docs/`.
4. Existing code.

If APPROVED or IMPLEMENTED docs conflict with code, treat code as legacy unless the doc is clearly outdated.

## Commands

Run relevant checks after changes from the repository root:

```sh
pnpm format:check
pnpm lint:check
pnpm typecheck
pnpm test
```

Format and lint scripts can run repo-wide or against a root-relative path:

```sh
pnpm format:check
pnpm format:check packages/app
pnpm lint:fix packages/app/src
```

When checking or running scripts for one package, use `pnpm --filter=<package-name> <script>` from the repository root. For example, use `pnpm --filter=@vista/app test` or `pnpm --filter=@vista/web build`. Do not change into a package directory to run package scripts.

Use package-filtered commands when a full workspace check is unnecessary, but full workspace checks are preferred before final delivery when practical.

## Change rules

- Prefer small, targeted changes.
- Do not refactor outside the requested scope.
- Update docs in the same change when behavior, public APIs, package exports, conventions, or lifecycle rules change.
- Follow `docs/code-guidelines.md` for code style, architecture, TypeScript, testing, and source documentation requirements.
- Follow `docs/docs-guidelines.md` when creating, updating, interpreting, or making exceptions to durable documentation.
- Keep package README files aligned with `package.json` `exports`.
- Do not add dependencies unless simple in-house code is worse.
- Do not commit secrets, build artifacts, or unrelated changes.
