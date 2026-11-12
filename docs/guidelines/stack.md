---
status: IMPLEMENTED
last_updated: 2026-11-12
scope: TypeScript, React, and Rust conventions, on top of the coding guidelines.
---

# TypeScript, React, and Rust guidelines

The [coding guidelines](code.md) hold for every language in the project. This document adds what is particular to TypeScript, React, and Rust, and the tools that check them.

## Naming

- Files and folders: kebab-case (`user-service.ts`, `api-routes/`). Rust files and modules are snake_case.
- Variables and functions: camelCase (`getUserById`, `isValid`).
- Classes, types, and React components: PascalCase (`UserService`, `ApiResponse`).
- Constants: UPPER_SNAKE_CASE (`MAX_RETRY_ATTEMPTS`).
- Rust follows its own conventions: snake_case functions and variables, PascalCase types, and SCREAMING_SNAKE_CASE constants, which clippy checks.

## TypeScript

- Use strict TypeScript; the root `tsconfig.json` sets the flags.
- Prefer `const` to `let`; never use `var`.
- Prefer `unknown` to `any`. Validate `unknown` at the boundary before use.
- Prefer interfaces for object shapes and type aliases for unions and intersections.
- Use type-only imports when importing only types.
- Prefer string-literal unions or `as const` objects to `enum`. `enum` is not erasable syntax: Node.js type stripping rejects it, so code that `tsc` and Vitest accept can fail when Node.js loads it. An earlier rule allowed `enum` and named its members in UPPER_SNAKE_CASE; it was replaced once code run by Node.js directly hit the rejection ([codenhub/codenhub@e3ae18df](https://github.com/codenhub/codenhub/commit/e3ae18df)).
- Keep casts narrow and close to the boundary that justifies them.
- Do not export types or values that are not part of the package or module API.
- A function with three or more parameters takes a typed options object instead, under the exceptions the [coding guidelines](code.md#code) give.

## Modules and imports

- Group related files in a folder with an `index.ts` entrypoint.
- Prefer named exports, except where a tool or framework requires a default export, such as config files.
- Use barrel files only as package or folder entrypoints.
- Do not deep-import another package's internals unless the subpath is part of its `exports`.

## Async and logging

- Use `async`/`await` for asynchronous code.
- Run independent async work in parallel with `Promise.all()`. Sequential awaits in a loop need a reason, given in the comment on the lint suppression they require.
- `console` is for examples, CLIs, debugging utilities, entrypoints reporting startup failures, and deliberate diagnostics. Casual logging is not a substitute for error handling.

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
- Public Rust items MUST have rustdoc.

## TSDoc

The API documentation the [coding guidelines](code.md#documentation-in-code) require is TSDoc in source. Symbols exposed through `package.json` `exports`, such as those of `@vista/app`, form the shared contracts and components consumed across platform hosts: exported components, capability contracts, interfaces, type aliases, constants, and host adapter types. Vista's packages are private, but these exports are its contracts between hosts, so they MUST have TSDoc. Its TSDoc:

- Opens with a one-sentence summary of what the symbol does for the caller, in the present tense. Longer explanation goes in `@remarks`.
- Documents every parameter and type parameter with `@param` and `@typeParam`, giving intent and any constraint, unit, or accepted range rather than the type. A `@param` MAY be left out only when the name already fixes the meaning exactly.
- Documents the returned value with `@returns`, including the states a caller must handle, such as an empty collection, `null`, or a failed result. Leave it out for `void`.
- Gives one `@throws` per error type, with the condition that triggers it. A symbol that reports failure by return value instead says so where a reader would expect a throw.
- Gives `@defaultValue` to an optional parameter or property whose default a caller cannot infer.
- Carries `@deprecated` with the replacement and, when known, the version that removes it.
- Documents each public member of a class or interface with its own TSDoc. A bare member is an incomplete API.
- Prefers `{@link OtherSymbol}` to repeating another symbol's contract.

`@example` blocks are encouraged for any non-obvious usage; each MUST be realistic and compile against the current API.

An export needed only to compose entrypoints SHOULD stay out of public entrypoints. When one cannot, mark it `@internal` and keep it out of package README examples.

When changing workspace `exports`, shared symbols, capability contracts, or observable failure behavior, update the TSDoc and the package or app README in the same change.

oxlint validates the structure of the tags, but no rule detects a missing doc on an export. Authors and reviewers enforce TSDoc coverage until a dedicated lint rule or custom plugin exists.

## Formatting, linting, and type checking

- Code MUST pass `pnpm format:check`, `pnpm lint:check`, and `pnpm typecheck`; [Workspace](../workspace.md#root-scripts) lists them. During development, narrow `typecheck` to the changed packages, as [Tooling](../tooling.md#narrowing-a-run) shows.
- Rust code MUST pass `pnpm --filter=@vista/native format:rust:check` and `pnpm --filter=@vista/native lint:rust:check`.
- Formatting is owned by oxfmt for TypeScript, CSS, HTML, and JSON, by Prettier for Markdown, and by rustfmt for Rust.
- For `oxlint-disable`, put the reason after `--` on the same directive. For `#[allow(...)]` and `@ts-expect-error`, put it on the line above.
