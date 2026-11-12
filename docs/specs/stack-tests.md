---
status: IMPLEMENTED
last_updated: 2026-11-12
scope: How the test categories run with Vitest, Playwright, Node's test runner, and cargo: file names, configuration, scripts, coverage reports, and commands.
---

# Tests with Vitest, Playwright, and cargo

The [testing specification](tests.md) defines the categories, where they live, and what they cover. This document says how they run on Vista's stack.

## Runners and file names

| Category  | Runner                                            | File                                                    | Runs with                               |
| --------- | ------------------------------------------------- | ------------------------------------------------------- | --------------------------------------- |
| Unit      | [Vitest](https://vitest.dev/)                     | `src/<file>.test.ts` or `.tsx`, next to `src/<file>.ts` | `pnpm test`                             |
| Browser   | [Playwright](https://playwright.dev/)             | `apps/web/tests/e2e/<journey>.spec.ts`                  | `pnpm test:e2e`                         |
| Git hooks | [`node --test`](https://nodejs.org/api/test.html) | `scripts/git-hooks.test.mjs`                            | `pnpm test`, or `pnpm test:hooks` alone |

Shared React tests use React Testing Library, jest-dom matchers, and an explicit jsdom environment, with user-event for user interactions. Test setup cleans up mounted components after each test.

## Configuration

- A package or app that needs custom options, such as path aliases, environment variables, plugins, or a DOM environment, MUST include its own explicit configuration file, `vite.config.ts`, `vitest.config.ts`, or `playwright.config.ts`. Do not rely on implicit or undocumented fallback behavior.
- Test scripts MUST NOT chain their own build step. The browser suite's `webServer` builds the web host before serving it, which is the server's setup, not a test script's.
- A package with a Vitest suite defines the root names and meanings:
  - `test`: runs unit and integration tests once, and nothing that needs a browser.
  - `test:watch`: runs those tests in watch mode.
  - `test:coverage`: runs those tests and writes a coverage report.
- A host with only browser tests exposes `test:e2e`. Do not add empty suites or commands that silently pass without tests just to fill out scripts. The native host's first Rust test adds `test:rust`, `cargo test --locked --manifest-path src-tauri/Cargo.toml`, and runs it from `verify:rust` and the CI `Rust` job.

## Browser suites

- `pnpm test`, `pnpm test:watch`, and `pnpm test:coverage` MUST NOT reach a browser suite, directly or through another script.
- Every Playwright project name ends in the engine it runs on, `chromium`, `firefox`, or `webkit`, optionally prefixed to distinguish surfaces (`app-chromium`). CI can then run one engine per job by selecting on the name, and a project named anything else cannot silently drop out of that selection.
- The web host's Playwright config sets `retries: 0`, so a flaky test fails the run in CI as it does locally. Retrying once in CI, and reporting a pass on the retry as `flaky`, is the rejected alternative: it keeps a timing failure from failing a merge, but the evidence for it was timing-sensitive Firefox tests, and this suite runs Chromium only. Of the 43 CI runs up to 2026-11-12, none failed in the browser tests; the 2 failures were a dependency install and a type check. A flake in CI reopens this choice.
- The suite starts its own server on a fixed port and fails on a port collision rather than silently testing another app.
- A suite whose tests do not read cookies, storage, or permissions left by an earlier test SHOULD share one browser context per worker and take a fresh page per test. Playwright builds a context per test by default, and the engines price that very differently: on one suite in codenhub/codenhub, a fresh context cost Firefox about 2.6 s against Chromium's 0.3 s ([codenhub/codenhub@7aad1c19](https://github.com/codenhub/codenhub/commit/7aad1c19ff7a1b43db939ddff6a0ac435fe8bc5d)). A suite whose tests read such state keeps the default context per test, so each test starts clean and sets up the cookies, storage, or permissions it needs itself; a test never relies on what an earlier one left behind. A suite that shares a context MUST reset whatever the page under test persists before each test, not after, so the reset holds even when a test fails partway.

Install the browser once before running the browser suite:

```sh
pnpm --filter=@vista/web exec playwright install chromium
```

CI installs Chromium with the same command, adding `--with-deps` for the Ubuntu runner.

## Coverage

`pnpm test:coverage` writes a V8 coverage report to each package's `coverage/`. In `packages/app` it includes untested implementation files and excludes tests, setup, re-export entrypoints, and the type-only platform contract.

## Commands

Run tests from the repository root.

```sh
pnpm test
pnpm test:coverage
pnpm test:e2e
```

Narrow a run while working on one area. `--filter` selects the package, and a path after the script is forwarded to the runner:

```sh
pnpm --filter=@vista/app test
pnpm --filter=@vista/app test src/domain/path-validation.test.ts
pnpm --filter=@vista/app test:watch
```

[Tooling](../tooling.md#narrowing-a-run) describes the other ways to narrow a run.
