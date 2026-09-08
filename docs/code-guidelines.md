# Coding guidelines

**Status:** IMPLEMENTED
**Last updated:** 2026-09-08

This document outlines patterns, conventions and guidelines to follow when working on this codebase.

## Naming conventions

- Files & Folders: kebab-case (`user-service.ts`, `api-routes/`)
- Variables & Functions: camelCase (`getUserById`, `isValid`)
- Classes & Types: PascalCase (`UserService`, `ApiResponse`)
- Constants & Enums: UPPER_SNAKE_CASE (`MAX_RETRY_ATTEMPTS`)
- Booleans: prefix with is/has/can/should (`isLoading`, `hasPermission`)
- Arrays: plural nouns (`users`, `items`)
- Functions: verb phrases (`calculateTotal`, `fetchUser`)

Use names that describe domain intent. Avoid names based only on type or implementation, such as `data`, `item`, `manager`, or `helper`, unless the scope makes the meaning obvious.

## Architecture & design

- Single Responsibility: each function/class does ONE thing well
- High Cohesion: logic that belongs together stays together
- Loose Coupling: minimize dependencies between modules
- Prefer dependency injection over hard-coding
- Prefer using folders to group related files, with an `index.ts` entrypoint
- Keep public API surface small and intentional
- Do not add compatibility layers unless there is a real consumer, persisted data, shipped behavior, or explicit requirement

## Coding good/bad practices

- Functions should be small and clearly nameable
- Prefer `const` over `let`; never use `var`
- Avoid magic numbers and strings; extract to named constants when the value has domain meaning or is reused
- Code should be self-explanatory; use descriptive names
- Design for predictable, deterministic behavior
- Avoid God Objects, Feature Envy, and excessive method chaining
- ALWAYS prefer readable code over clever code

Literal values MAY stay inline when extraction makes code worse, such as protocol literals, package names, CSS selectors, event names, test fixtures, one-off validation messages, and external API values used once near their boundary.

Function parameters:

- 0-1 parameters: excellent
- 2 parameters: acceptable
- 3+ parameters: refactor into typed object

Exceptions: framework callbacks, test helpers, tiny local functions, and APIs where an object parameter would hide meaning instead of improving it.

## TypeScript

- Use strict TypeScript.
- Prefer `unknown` over `any`.
- Prefer interfaces for object shapes and type aliases for unions/intersections.
- Use type-only imports when importing only types.
- Validate `unknown` at boundaries before use.
- Keep casts close to the boundary and make them narrow.
- Do not export types or values that are not part of the package API.

## Modules and imports

- Prefer named exports for reusable library code.
- Use barrel files only as package or folder entrypoints.
- Avoid deep imports across package internals unless the subpath is part of `exports`.
- Keep dependency direction clear: shared code must not import app-specific code.

## Async and errors

- Use `async`/`await` for asynchronous code.
- Run independent async work in parallel with `Promise.all()`.
- Do not swallow errors silently.
- Throw or return errors with enough context to debug.
- Do not log secrets, tokens, credentials, or private user data.
- `console` is allowed for examples, CLIs, debugging utilities, and deliberate diagnostics. Do not use casual logging as a substitute for error handling.

## Testing

- Test behavior, edge cases, and error paths (not just happy paths).
- One behavior per test. Use descriptive names (e.g., `shouldReturnEmptyWhenNull`).
- Test files are colocated with the code they test.
- Mock external dependencies such as network, storage, filesystem, timers, and browser APIs.
- Prefer observable behavior over implementation details.
- Update affected tests when changing behavior.

For comprehensive details on test categorization (Unit, Integration, E2E), config file requirements, and coverage targets, see the [Testing Specification](./specs/tests.md).

## Documentation

- Comments explain WHY, not WHAT or HOW.
- Remove and avoid redundant comments, decorations and outdated docs.
- Public package APIs MUST have JSDoc/TSDoc in source, even when the README also documents them.

Every symbol exposed through `package.json` `exports` is public API. Public API includes exported functions, classes, methods, interfaces, type aliases, constants, config objects, plugin factories, CSS/token surfaces represented in TypeScript, and other consumer-facing values.

Public API JSDoc/TSDoc MUST describe consumer-facing purpose, important inputs or properties, return values or side effects, and observable error or failure behavior. It MUST NOT restate the type signature in prose or document private implementation details.

When changing package `exports`, public symbols, public behavior, or observable failure behavior, update source JSDoc/TSDoc and the package README/reference material in the same change.

Oxlint validates JSDoc structure and tag quality where supported, but current Oxlint rules do not fully detect missing docs for package public exports. Code authors and reviewers MUST enforce public API JSDoc/TSDoc coverage during implementation and review until a dedicated lint rule or custom plugin exists.

## Formatting, linting, and type checking

- Code MUST pass `pnpm format:check`.
- Code MUST pass `pnpm lint:check`.
- Code MUST pass `pnpm typecheck` for changed packages or the full workspace when practical.
- Formatting is owned by Oxfmt. Do not manually fight formatter output.
- Lint rules are enforceable project policy. Change the rule or document an exception instead of ignoring it broadly.

## Git workflow

- Work on a feature branch, normally named `codex/<description>` for agent changes. All changes, including new files, must reach `main` through a pull request.
- Before committing, stage all intended changes and explicitly ignore only files that do not belong in the repository. Hooks reject non-ignored untracked files and unstaged changes, including partially staged files. They never stage or stash files automatically.
- The pre-commit hook rejects commits on `main` or detached HEAD, then checks formatting and linting across the repository.
- The pre-push hook rejects updates or deletions targeting remote `main`, regardless of the local branch name. It requires a clean working tree and checks that every non-deletion update points to the checked-out commit. Push other commits from their own checkout.
- Pre-push enforces only Git state rules. One Windows CI job runs formatting, linting, TypeScript checks, hook/unit tests, and the Chromium smoke test. Run Rust formatting, Clippy, Rust tests, and a native executable build manually when changing Tauri/Rust configuration or implementing native adapters; native compilation is outside CI for now.
- GitHub branch protection requires a pull request and a successful `Windows checks` job against an up-to-date branch. It applies to administrators, prohibits force pushes/deletion, and requires no reviewer approvals so the owner can merge their own PR after checks pass.
- Hooks are installed per checkout with `pnpm hooks:install` and automatically during a normal local `pnpm install`. GitHub checks remain authoritative because local hooks can be bypassed. Documentation accuracy, architecture, public API documentation, and other semantic guidelines still require PR review.
