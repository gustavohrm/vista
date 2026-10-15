---
status: IMPLEMENTED
last_updated: 2026-10-15
scope: Code conventions for naming, structure, TypeScript, React and UI, Rust, testing, and documentation in this repository.
---

# Coding guidelines

This document outlines the patterns, conventions, and guidelines that apply to this codebase.

## Naming conventions

- Files & Folders: kebab-case (`user-service.ts`, `api-routes/`). Rust files and modules are snake_case, as [Rust](#rust) describes.
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
- Do not add dependencies unless simple in-house code is worse

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
- Do not export types or values that are not part of the package or module API.

## Modules and imports

- Prefer named exports for shared application code and modules.
- Use barrel files only as package or folder entrypoints.
- Avoid deep imports across package internals unless the subpath is part of `exports`.
- Keep dependency direction clear: shared code must not import app-specific code.

## Async and errors

How failures are classified and shown to people is specified in [Errors](../specs/errors.md) (DRAFT).

- Use `async`/`await` for asynchronous code.
- Run independent async work in parallel with `Promise.all()`.
- Do not swallow errors silently.
- Throw or return errors with enough context to debug.
- Do not log secrets, tokens, credentials, or private user data.
- `console` is allowed for examples, CLIs, debugging utilities, and deliberate diagnostics. Do not use casual logging as a substitute for error handling.

## React and UI

- Shared UI in `packages/app` MUST NOT import Tauri, File System Access, or other host APIs. It consumes capabilities through the contracts in `packages/app/src/ports.ts`, and each host implements them. [Architecture](../architecture.md#platform-adapters) describes the adapter model.
- Never use `alert`, `confirm`, or `prompt`. Show transient messages and confirmations through `useToast()` from `packages/app/src/components/feedback/toast.tsx`, which keeps them consistent with the rest of the app. [Toasts and confirmations](../architecture.md#toasts-and-confirmations) describes the toast and confirmation behavior.
- A gesture that must stay smooth, such as dragging, SHOULD update the DOM through a ref during the gesture and commit to state on release, rather than re-rendering on every frame.
- Use the `@codenhub/styles` component classes when one fits, and Tailwind utilities for layout only. [Shared presentation](../architecture.md#shared-presentation) defines the full styling contract.
- Icons are rendered by the build-time `@codenhub/icons` rewrite, which only matches literal class names. The `ic-*` class MUST appear as a literal string in `className`; never compute it at runtime.

## Rust

Rust code lives in `apps/native/src-tauri`, the Tauri host for Vista.

- Public fallible functions return `Result`, and their rustdoc MUST include an `# Errors` section that lists the failure conditions.
- Keep logic that does not need Tauri types out of Tauri-facing entrypoints, so it can be unit-tested without a window.
- Avoid `unwrap()` outside tests. Use `?` to propagate errors, or `expect()` with a message that names the invariant being relied on.

Formatting and linting are owned by `rustfmt` and `clippy`, as [Formatting, linting, and type checking](#formatting-linting-and-type-checking) describes.

## Testing

- Test behavior, edge cases, and error paths (not just happy paths).
- One behavior per test. Name each test after the behavior it asserts, as a sentence, such as `it("shows an error toast when saving a file fails")`.
- Test files are colocated with the code they test: `*.test.ts` or `*.test.tsx` beside the source. Rust unit tests live in a `#[cfg(test)] mod tests` block in the module they cover.
- Mock only real boundaries: network, storage, filesystem, timers, and browser or host APIs. Pure logic is tested directly, as `packages/app/src/domain/path-validation.test.ts` does.
- Prefer observable behavior over implementation details.
- Update affected tests when changing behavior.

The [testing specification](../specs/tests.md) defines test categories, configuration requirements, and coverage targets.

## Documentation

- Comments explain WHY, not WHAT or HOW.
- Remove and avoid redundant comments, decorations and outdated docs.
- Public workspace and contract APIs MUST have JSDoc/TSDoc in source, even when the package or app README also documents them.
- Public Rust items MUST have rustdoc.

In this application workspace, symbols exposed through `package.json` `exports` (such as in `@vista/app`) form the shared contracts and components consumed across platform hosts. Public workspace API includes exported components, capability contracts, interfaces, type aliases, constants, and host adapter types.

Contract and component JSDoc/TSDoc MUST describe purpose, important parameters or properties, return values or side effects, and observable error or failure behavior. It MUST NOT restate the type signature in prose or document private implementation details.

Specifically, public API JSDoc/TSDoc MUST:

- Open with a one-sentence summary of what the symbol does for the caller, in the present tense. Longer explanation goes in `@remarks`, not the summary.
- Document every parameter and type parameter with `@param` / `@typeParam`, giving intent and any constraint, unit, or accepted range rather than a restatement of the type. Omit `@param` only when the parameter name already fixes its meaning exactly.
- Document the returned value with `@returns` whenever the symbol returns one, including the states a caller must handle, such as an empty collection, `null`, or a failed result. Omit it for `void`.
- Describe observable failure with one `@throws` per error type and the condition that triggers it. A symbol that reports failure by return value instead of throwing MUST say so where a reader would otherwise expect a throw.
- Give `@defaultValue` to an optional parameter or property whose default a caller cannot infer.
- Carry `@deprecated` with the replacement and, when known, the version that removes it.
- Document each public member of a class or interface with its own TSDoc. A bare member is an incomplete public API.
- Prefer `{@link OtherSymbol}` to repeating another symbol's contract.

`@example` blocks are encouraged for any non-obvious usage; each MUST be realistic and compile against the current public API.

Internal exports used only to compose package entrypoints SHOULD stay unexported from public entrypoints. If an internal export is necessary, mark it with `@internal` and keep it out of package README examples.

When changing workspace `exports`, shared symbols, capability contracts, or observable failure behavior, update source JSDoc/TSDoc and the package or app README in the same change.

Oxlint validates JSDoc structure and tag quality where supported, but current Oxlint rules do not fully detect missing docs for workspace public exports. Code authors and reviewers MUST enforce public API JSDoc/TSDoc coverage during implementation and review until a dedicated lint rule or custom plugin exists.

## Formatting, linting, and type checking

- Code MUST pass `pnpm format:check`.
- Code MUST pass `pnpm lint:check`.
- Code MUST pass `pnpm typecheck` for changed packages or the full workspace when practical.
- Rust code in `apps/native/src-tauri` MUST pass `pnpm --filter=@vista/native format:rust:check` and `pnpm --filter=@vista/native lint:rust:check`, and its tests MUST pass `pnpm --filter=@vista/native test:rust`.
- Formatting is owned by Oxfmt for TypeScript, CSS, HTML, and JSON, by Prettier for Markdown, and by `rustfmt` for Rust. Do not manually fight formatter output.
- Lint rules are enforceable project policy. Change the rule or document an exception instead of ignoring it broadly.
- Every local suppression (`oxlint-disable`, `@ts-expect-error`, `#[allow(...)]`) MUST carry a comment that says why it is needed. For `oxlint-disable`, put the reason after `--` on the same directive. For `#[allow(...)]` and `@ts-expect-error`, put it on the line above.
